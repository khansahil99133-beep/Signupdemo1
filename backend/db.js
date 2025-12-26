import { Pool } from 'pg';

let pool;

const DEFAULT_CONFIG = {
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'postgres',
  database: process.env.PGDATABASE || 'softupkaran',
};

export function initDb({ pool: externalPool } = {}) {
  if (externalPool) {
    pool = externalPool;
    return pool;
  }
  if (!pool) {
    const config = process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : DEFAULT_CONFIG;
    pool = new Pool(config);
  }
  return pool;
}

export function getPool() {
  if (!pool) throw new Error('Database not initialized');
  return pool;
}

export async function ensureSchema() {
  const sql = `
    CREATE TABLE IF NOT EXISTS public.users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      whatsapp TEXT,
      telegram TEXT,
      password_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await getPool().query(sql);
}

function normalizeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    whatsapp: row.whatsapp,
    telegram: row.telegram,
    createdAt: row.created_at ? row.created_at.toISOString() : null,
  };
}

export async function insertUser(record) {
  const query = `
    INSERT INTO public.users (id, name, email, whatsapp, telegram, password_hash)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, name, email, whatsapp, telegram, created_at;
  `;
  const values = [
    record.id,
    record.name || null,
    record.email || null,
    record.whatsapp || null,
    record.telegram,
    record.passwordHash,
  ];
  const { rows } = await getPool().query(query, values);
  return normalizeUser(rows[0]);
}

export async function listUsers() {
  const query = `
    SELECT id, name, email, whatsapp, telegram, created_at
    FROM public.users
    ORDER BY created_at DESC;
  `;
  const { rows } = await getPool().query(query);
  return rows.map(normalizeUser);
}

export async function deleteUserById(id) {
  const result = await getPool().query('DELETE FROM public.users WHERE id = $1', [id]);
  return result.rowCount;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
