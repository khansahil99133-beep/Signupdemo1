#!/usr/bin/env node
import { readFile } from 'fs/promises';
import path from 'path';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';

const DEFAULT_JSON = path.join(process.cwd(), 'data', 'users.json');

async function hashPassword(record) {
  const raw = record.passwordHash || record.password || '';
  if (!raw) return null;
  return bcrypt.hash(raw, 10);
}

async function main() {
  const targetUrl = process.env.DATABASE_URL;
  if (!targetUrl) {
    throw new Error('DATABASE_URL must be set to run this importer.');
  }

  const sourcePath = process.argv[2] || DEFAULT_JSON;
  const raw = await readFile(sourcePath, 'utf-8');
  const users = JSON.parse(raw);
  if (!Array.isArray(users) || users.length === 0) {
    console.log('No users found in', sourcePath);
    return;
  }

  const client = new Client({ connectionString: targetUrl });
  await client.connect();

  const sql = `
    INSERT INTO public.users (id, name, email, whatsapp, telegram, password_hash, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      whatsapp = EXCLUDED.whatsapp,
      telegram = EXCLUDED.telegram,
      password_hash = EXCLUDED.password_hash,
      created_at = LEAST(public.users.created_at, EXCLUDED.created_at);
  `;

  let migrated = 0;
  for (const entry of users) {
    const hash = await hashPassword(entry);
    await client.query(sql, [
      entry.id,
      entry.name || null,
      entry.email || null,
      entry.whatsapp || null,
      entry.telegram || null,
      hash,
      entry.createdAt ? new Date(entry.createdAt) : new Date(),
    ]);
    migrated += 1;
  }

  await client.end();
  console.log(`Migration of ${migrated} user(s) from JSON complete.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
