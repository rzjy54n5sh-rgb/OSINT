#!/usr/bin/env node
/**
 * Run the social_trends engagement_estimate fix migration.
 * Requires: DATABASE_URL or SUPABASE_DB_URL (Supabase → Settings → Database → Connection string, URI)
 *
 * Usage: DATABASE_URL="postgresql://..." node scripts/run-social-trends-fix.mjs
 * Or with .env.local: node --env-file=.env.local scripts/run-social-trends-fix.mjs
 */
import dotenv from 'dotenv';
import pg from 'pg';
import { existsSync } from 'fs';
import { resolve } from 'path';

['.env.local', '.env'].forEach((f) => {
  const p = resolve(process.cwd(), f);
  if (existsSync(p)) dotenv.config({ path: p });
});
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, 'run-social-trends-fix.sql');
const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!url) {
  console.error('Set DATABASE_URL or SUPABASE_DB_URL (Supabase → Settings → Database → Connection string)');
  process.exit(1);
}

const sql = readFileSync(sqlPath, 'utf8');
const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  await client.query(sql);
  console.log('✅ social_trends.engagement_estimate fix applied');
} catch (e) {
  console.error('Migration failed:', e.message);
  process.exit(1);
} finally {
  await client.end();
}
