import { Router } from 'express';
import { z } from 'zod';
import { RECORD_TYPES } from '../config.js';
import { getDb } from '../db/index.js';
import { type AuthenticatedRequest, requireAuth } from '../middleware/auth.js';
import { badRequest, notFound } from '../middleware/error.js';
import { upload } from '../middleware/upload.js';
import { newId } from '../services/crypto.js';
import { deleteBlob, readDecrypted, storeEncrypted } from '../services/storage.js';
import { type RecordRow, toPublicRecord } from '../types.js';

const metadataSchema = z.object({
  title: z.string().trim().min(2, 'Title is required').max(120),
  recordType: z.enum(RECORD_TYPES),
  recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Record date must be YYYY-MM-DD'),
  providerName: z.string().trim().max(120).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

const listQuerySchema = z.object({
  recordType: z.enum(RECORD_TYPES).optional(),
  search: z.string().trim().max(120).optional(),
});

export const recordsRouter = Router();

recordsRouter.use(requireAuth);

function logAccess(actorId: string, recordId: string, action: string): void {
  getDb()
    .prepare(
      'INSERT INTO access_log (id, actor_id, record_id, action, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run(newId(), actorId, recordId, action, new Date().toISOString());
}

function ownedRecord(ownerId: string, recordId: string): RecordRow {
  const row = getDb()
    .prepare('SELECT * FROM records WHERE id = ? AND owner_id = ?')
    .get(recordId, ownerId) as RecordRow | undefined;

  if (!row) throw notFound('Record not found');
  return row;
}

recordsRouter.get('/', (req: AuthenticatedRequest, res) => {
  const query = listQuerySchema.parse(req.query);

  const clauses = ['owner_id = ?'];
  const params: unknown[] = [req.user!.id];

  if (query.recordType) {
    clauses.push('record_type = ?');
    params.push(query.recordType);
  }
  if (query.search) {
    clauses.push('(LOWER(title) LIKE ? OR LOWER(IFNULL(provider_name, \'\')) LIKE ?)');
    const like = `%${query.search.toLowerCase()}%`;
    params.push(like, like);
  }

  const rows = getDb()
    .prepare(
      `SELECT * FROM records WHERE ${clauses.join(' AND ')} ORDER BY record_date DESC, created_at DESC`,
    )
    .all(...params) as RecordRow[];

  res.json({ records: rows.map(toPublicRecord) });
});

recordsRouter.get('/summary', (req: AuthenticatedRequest, res) => {
  const db = getDb();
  const ownerId = req.user!.id;

  const totals = db
    .prepare(
      'SELECT COUNT(*) AS total, IFNULL(SUM(size_bytes), 0) AS bytes, MAX(created_at) AS last_upload FROM records WHERE owner_id = ?',
    )
    .get(ownerId) as { total: number; bytes: number; last_upload: string | null };

  const byType = db
    .prepare(
      'SELECT record_type, COUNT(*) AS count FROM records WHERE owner_id = ? GROUP BY record_type',
    )
    .all(ownerId) as Array<{ record_type: string; count: number }>;

  const recent = db
    .prepare('SELECT * FROM records WHERE owner_id = ? ORDER BY created_at DESC LIMIT 5')
    .all(ownerId) as RecordRow[];

  res.json({
    totalRecords: totals.total,
    totalBytes: totals.bytes,
    lastUploadAt: totals.last_upload,
    byType: Object.fromEntries(byType.map((row) => [row.record_type, row.count])),
    recentRecords: recent.map(toPublicRecord),
  });
});

recordsRouter.post('/', upload.single('file'), async (req: AuthenticatedRequest, res) => {
  if (!req.file) throw badRequest('A file is required');

  const metadata = metadataSchema.parse(req.body);
  const blob = await storeEncrypted(req.user!.id, req.file.buffer);

  const row: RecordRow = {
    id: newId(),
    owner_id: req.user!.id,
    title: metadata.title,
    record_type: metadata.recordType,
    record_date: metadata.recordDate,
    provider_name: metadata.providerName || null,
    notes: metadata.notes || null,
    original_filename: req.file.originalname,
    mime_type: req.file.mimetype,
    size_bytes: req.file.size,
    storage_key: blob.storageKey,
    encryption_iv: blob.iv,
    encryption_tag: blob.authTag,
    checksum: blob.checksum,
    created_at: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `INSERT INTO records (id, owner_id, title, record_type, record_date, provider_name, notes,
                            original_filename, mime_type, size_bytes, storage_key, encryption_iv,
                            encryption_tag, checksum, created_at)
       VALUES (@id, @owner_id, @title, @record_type, @record_date, @provider_name, @notes,
               @original_filename, @mime_type, @size_bytes, @storage_key, @encryption_iv,
               @encryption_tag, @checksum, @created_at)`,
    )
    .run(row);

  logAccess(req.user!.id, row.id, 'UPLOAD');

  res.status(201).json({ record: toPublicRecord(row) });
});

recordsRouter.get('/:id', (req: AuthenticatedRequest, res) => {
  const row = ownedRecord(req.user!.id, String(req.params.id));
  res.json({ record: toPublicRecord(row) });
});

recordsRouter.get('/:id/file', async (req: AuthenticatedRequest, res) => {
  const row = ownedRecord(req.user!.id, String(req.params.id));

  const plaintext = await readDecrypted({
    storageKey: row.storage_key,
    iv: row.encryption_iv,
    authTag: row.encryption_tag,
    checksum: row.checksum,
  });

  logAccess(req.user!.id, row.id, 'DOWNLOAD');

  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Content-Length', plaintext.length);
  res.setHeader(
    'Content-Disposition',
    `${req.query.disposition === 'inline' ? 'inline' : 'attachment'}; filename="${row.original_filename.replace(/"/g, '')}"`,
  );
  res.send(plaintext);
});

recordsRouter.delete('/:id', async (req: AuthenticatedRequest, res) => {
  const row = ownedRecord(req.user!.id, String(req.params.id));

  await deleteBlob(row.storage_key);
  getDb().prepare('DELETE FROM records WHERE id = ?').run(row.id);
  logAccess(req.user!.id, row.id, 'DELETE');

  res.status(204).send();
});
