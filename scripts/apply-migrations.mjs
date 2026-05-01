/**
 * Apply Leftovers SQL files to a Supabase project via the Management API.
 *
 * Env:
 *   SUPABASE_ACCESS_TOKEN  — personal access token (sbp_...)
 *   SUPABASE_PROJECT_REF   — project ref (e.g. yohzkldhcitfbxwrlieu)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
if (!TOKEN || !REF) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF');
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);

const FILES = [
  'supabase/migrations/20260501000000_initial_schema.sql',
  'supabase/migrations/20260501000001_rls.sql',
  'supabase/migrations/20260501000002_views_and_functions.sql',
  'supabase/seed.sql',
];

async function runQuery(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`\n[${label}] FAILED ${res.status}:`);
    console.error(text.slice(0, 4000));
    process.exit(1);
  }
  const body = await res.text();
  console.error(`[${label}] applied (${sql.length} chars).`);
  return body;
}

for (const f of FILES) {
  const sql = readFileSync(join(root, f), 'utf8');
  await runQuery(sql, f);
}
console.error('\nAll migrations applied.');
