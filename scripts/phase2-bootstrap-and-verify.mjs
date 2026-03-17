#!/usr/bin/env node
/**
 * Phase 2: Run Omar bootstrap + verification queries via Supabase (uses .env.local).
 */
import pg from 'pg';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

config({ path: join(root, '.env.local') });
config({ path: join(process.cwd(), '.env.local') });

function getConnectionConfig() {
  const raw =
    process.env.DATABASE_URL ||
    process.env.database_url ||
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
    return { connectionString: url };
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const password =
    process.env.SUPABASE_DB_PASSWORD ||
    process.env.supabase_db_password ||
    process.env.DATABASE_PASSWORD;
  if (!supabaseUrl || !password) {
    console.error('Missing DATABASE_URL or SUPABASE_DB_PASSWORD in .env.local');
    process.exit(1);
  }
  const ref = supabaseUrl.replace(/^https:\/\//, '').split('.')[0];
  return {
    connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`,
  };
}

async function main() {
  const client = new pg.Client(getConnectionConfig());
  try {
    await client.connect();
  } catch (err) {
    console.error('Connection failed:', err.message);
    process.exit(1);
  }

  const adminEmail = process.env.OMAR_EMAIL || process.env.ADMIN_EMAIL || 'admin@mena-intel-desk.local';

  try {
    console.log('Phase 2 — Bootstrap & verification\n');

    const bootstrapRes = await client.query(
      `INSERT INTO public.admin_users (email, display_name, role, created_by)
       SELECT $1, 'Omar', 'SUPER_ADMIN', NULL
       WHERE NOT EXISTS (SELECT 1 FROM public.admin_users WHERE role = 'SUPER_ADMIN')
       RETURNING id, email, role`,
      [adminEmail]
    );
    if (bootstrapRes.rowCount > 0) {
      console.log('Bootstrap: Omar added as SUPER_ADMIN:', bootstrapRes.rows[0].email);
    } else {
      console.log('Bootstrap: SUPER_ADMIN already exists (skip).');
    }

    const conflictDay = (await client.query('SELECT public.get_current_conflict_day() AS n')).rows[0]?.n;
    const tierFeatures = (await client.query('SELECT COUNT(*) AS n FROM public.tier_features')).rows[0]?.n;
    const articleSources = (await client.query('SELECT COUNT(*) AS n FROM public.article_sources')).rows[0]?.n;
    const adminUsers = (await client.query('SELECT email, role FROM public.admin_users')).rows;

    console.log('\nVerification:');
    console.log('  get_current_conflict_day():', conflictDay);
    console.log('  tier_features count:', tierFeatures, tierFeatures === 18 ? '✓' : '(expected 18)');
    console.log('  article_sources count:', articleSources, articleSources === 26 ? '✓' : '(expected 26)');
    console.log('  admin_users:', adminUsers.length, 'row(s)');
    adminUsers.forEach((r) => console.log('   -', r.email, '→', r.role));

    console.log('\nPhase 2 verification done.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
