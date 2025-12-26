#!/usr/bin/env node
import { Client } from 'pg';

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL;
  if (!sourceUrl || !targetUrl) {
    throw new Error('SOURCE_DATABASE_URL and DATABASE_URL must both be set before running the migration.');
  }

  const source = new Client({ connectionString: sourceUrl });
  const target = new Client({ connectionString: targetUrl });

  await source.connect();
  await target.connect();

  const { rows } = await source.query(`
    SELECT id, name, email, whatsapp, telegram, password_hash, created_at
    FROM public.users
    ORDER BY created_at NULLS LAST;
  `);

  if (!rows.length) {
    console.log('No users found in the source database.');
  } else {
    console.log(`Migrating ${rows.length} users...`);
  }

  const insert = `
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

  for (const user of rows) {
    await target.query(insert, [
      user.id,
      user.name,
      user.email,
      user.whatsapp,
      user.telegram,
      user.password_hash,
      user.created_at,
    ]);
  }

  await Promise.all([source.end(), target.end()]);
  console.log('Migration completed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
