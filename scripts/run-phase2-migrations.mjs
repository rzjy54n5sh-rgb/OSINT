#!/usr/bin/env node
/**
 * Run Phase 2 migrations (001–008) against Supabase via direct Postgres.
 * Requires in .env.local:
 *   - NEXT_PUBLIC_SUPABASE_URL (e.g. https://xxxxx.supabase.co)
 *   - SUPABASE_DB_PASSWORD (Database password from Supabase Dashboard → Settings → Database)
 * Or set DATABASE_URL (full postgresql://... connection string) instead.
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const migrationsDir = join(root, 'supabase', 'migrations');

config({ path: join(root, '.env.local') });
config({ path: join(process.cwd(), '.env.local') });

const MIGRATION_ORDER = [
  '001_users.sql',
  '002_subscriptions.sql',
  '003_api_keys.sql',
  '004_rbac.sql',
  '005_platform_config.sql',
  '006_scenario_detection.sql',
  '007_sources_pipeline.sql',
  '008_indexes_rls.sql',
];

function getConnectionConfig() {
  const raw =
    process.env.DATABASE_URL ||
    process.env.database_url ||
    process.env['database_url'] ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.POSTGRES_URL;
  let url = typeof raw === 'string' ? raw.trim() : '';
  if (url && (url.startsWith('postgres') || url.startsWith('postgresql'))) {
    const password =
      process.env.SUPABASE_DB_PASSWORD ||
      process.env.supabase_db_password ||
      process.env.DATABASE_PASSWORD;
    if (url.includes('[YOUR-PASSWORD]') && password)
      url = url.replace('[YOUR-PASSWORD]', encodeURIComponent(password));
    if (url.includes('@db.') && url.includes('.supabase.co:')) {
      const ref = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https:\/\//, '').split('.')[0] || url.match(/postgres\.([^.]+)\.supabase/)?.[1];
      if (ref && password) {
        const poolerRegions = ['us-east-1', 'us-west-1', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'];
        return poolerRegions.map((region) => ({
          connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-${region}.pooler.supabase.com:5432/postgres`,
        }));
      }
    }
    return { connectionString: url };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const password =
    process.env.SUPABASE_DB_PASSWORD ||
    process.env.supabase_db_password ||
    process.env.SUPABASE_DATABASE_PASSWORD ||
    process.env.SUPABASE_PASSWORD ||
    process.env.DATABASE_PASSWORD ||
    process.env.DB_PASSWORD ||
    process.env.PGPASSWORD;
  if (!supabaseUrl || !password) {
    console.error('Missing: set SUPABASE_DB_PASSWORD in .env.local (or DATABASE_URL).');
    console.error('Use exactly: SUPABASE_DB_PASSWORD=your_database_password');
    console.error('Get the password from: Supabase Dashboard → Project Settings → Database.');
    process.exit(1);
  }
  const ref = supabaseUrl.replace(/^https:\/\//, '').split('.')[0];
  const poolerRegions = ['us-east-1', 'us-west-1', 'eu-west-1', 'eu-central-1', 'ap-southeast-1'];
  return poolerRegions.map((region) => ({
    host: `aws-0-${region}.pooler.supabase.com`,
    port: 5432,
    database: 'postgres',
    user: `postgres.${ref}`,
    password,
    ssl: { rejectUnauthorized: false },
  }));
}

async function main() {
  const configOrList = getConnectionConfig();
  const configs = Array.isArray(configOrList) ? configOrList : [configOrList];
  const useUrl = configs.length === 1 && configs[0].connectionString;
  if (useUrl) console.log('Using DATABASE_URL from .env.local');
  let client = null;
  let lastErr = null;
  for (const c of configs) {
    const c2 = new pg.Client(c);
    try {
      await c2.connect();
      client = c2;
      console.log('Connected to Supabase Postgres.\n');
      break;
    } catch (err) {
      lastErr = err;
      await c2.end().catch(() => {});
    }
  }
  if (!client) {
    console.error('Migration failed:', lastErr?.message || 'Could not connect to any pooler.');
    console.error('Try setting DATABASE_URL in .env.local: copy the full connection string from');
    console.error('Supabase Dashboard → Connect → Session mode (or Transaction), then run again.');
    process.exit(1);
  }
  try {
    for (const name of MIGRATION_ORDER) {
      const path = join(migrationsDir, name);
      const sql = readFileSync(path, 'utf8');
      console.log(`Running ${name}...`);
      await client.query(sql);
      console.log(`  OK: ${name}\n`);
    }
    console.log('All Phase 2 migrations applied.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    if (err.position) console.error('Position:', err.position);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
