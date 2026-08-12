import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app, registerPatient, resetState } from './helpers.js';

beforeEach(() => {
  resetState();
});

describe('POST /api/auth/register', () => {
  it('creates a patient account and returns a token', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'Asha@Example.com',
        password: 'Str0ngPass!',
        fullName: 'Asha Rao',
        dateOfBirth: '1994-03-12',
        bloodGroup: 'O+',
      })
      .expect(201);

    expect(response.body.token).toBeTypeOf('string');
    expect(response.body.user.email).toBe('asha@example.com');
    expect(response.body.user.role).toBe('PATIENT');
    expect(response.body.user).not.toHaveProperty('password_hash');
  });

  it('rejects a weak password', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'weak@example.com', password: 'short', fullName: 'Weak Pass' })
      .expect(400);

    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a duplicate email', async () => {
    const patient = await registerPatient();

    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: patient.email, password: 'Str0ngPass!', fullName: 'Copy Cat' })
      .expect(409);

    expect(response.body.code).toBe('EMAIL_TAKEN');
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token for valid credentials', async () => {
    const patient = await registerPatient();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: patient.email, password: 'Str0ngPass!' })
      .expect(200);

    expect(response.body.token).toBeTypeOf('string');
  });

  it('rejects a wrong password without revealing which field failed', async () => {
    const patient = await registerPatient();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: patient.email, password: 'WrongPass!' })
      .expect(401);

    expect(response.body.error).toBe('Invalid email or password');
  });
});

describe('GET /api/auth/me', () => {
  it('returns the authenticated patient', async () => {
    const patient = await registerPatient();

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${patient.token}`)
      .expect(200);

    expect(response.body.user.id).toBe(patient.id);
  });

  it('rejects a missing token', async () => {
    await request(app).get('/api/auth/me').expect(401);
  });

  it('rejects a tampered token', async () => {
    await request(app).get('/api/auth/me').set('Authorization', 'Bearer not.a.token').expect(401);
  });
});
