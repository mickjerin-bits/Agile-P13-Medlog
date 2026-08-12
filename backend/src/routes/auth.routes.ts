import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { type AuthenticatedRequest, requireAuth, signToken } from '../middleware/auth.js';
import { HttpError, unauthorized } from '../middleware/error.js';
import { newId } from '../services/crypto.js';
import { type UserRow, toPublicUser } from '../types.js';

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email address is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().trim().min(2, 'Full name is required'),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD')
    .optional(),
  bloodGroup: z
    .enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
    .optional(),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later', code: 'RATE_LIMITED' },
});

export const authRouter = Router();

authRouter.post('/register', authLimiter, (req, res) => {
  const body = registerSchema.parse(req.body);
  const db = getDb();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(body.email);
  if (existing) {
    throw new HttpError(409, 'An account with this email already exists', 'EMAIL_TAKEN');
  }

  const user: UserRow = {
    id: newId(),
    email: body.email,
    password_hash: bcrypt.hashSync(body.password, config.bcryptRounds),
    full_name: body.fullName,
    date_of_birth: body.dateOfBirth ?? null,
    blood_group: body.bloodGroup ?? null,
    role: 'PATIENT',
    created_at: new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO users (id, email, password_hash, full_name, date_of_birth, blood_group, role, created_at)
     VALUES (@id, @email, @password_hash, @full_name, @date_of_birth, @blood_group, @role, @created_at)`,
  ).run(user);

  res.status(201).json({ token: signToken(user.id), user: toPublicUser(user) });
});

authRouter.post('/login', authLimiter, (req, res) => {
  const body = loginSchema.parse(req.body);

  const user = getDb().prepare('SELECT * FROM users WHERE email = ?').get(body.email) as
    | UserRow
    | undefined;

  if (!user || !bcrypt.compareSync(body.password, user.password_hash)) {
    throw unauthorized('Invalid email or password');
  }

  res.json({ token: signToken(user.id), user: toPublicUser(user) });
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: toPublicUser(req.user!) });
});
