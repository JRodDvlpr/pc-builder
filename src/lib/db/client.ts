import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import Database from 'better-sqlite3'

/**
 * SQLite holds only what actually changes: scraped offers, their history, and
 * saved builds. The parts catalog stays in committed JSON, so a fresh clone
 * needs no migration step and no seeding to be usable.
 *
 * On Vercel (and most serverless hosts) the deployment bundle is read-only —
 * only /tmp is writable, and it is wiped between cold starts. That is fine
 * here: the cache is a performance layer with a seed-price fallback already
 * built in, so an emptied cache just means the next request re-scrapes rather
 * than anything breaking.
 */
const DB_PATH =
  process.env.PC_BUILDER_DB ??
  (process.env.VERCEL ? '/tmp/pc-builder/prices.db' : join(process.cwd(), '.data', 'prices.db'))

const SCHEMA = `
CREATE TABLE IF NOT EXISTS offers (
  part_id     TEXT NOT NULL,
  provider    TEXT NOT NULL,
  price       REAL NOT NULL,
  url         TEXT NOT NULL,
  title       TEXT NOT NULL,
  in_stock    INTEGER NOT NULL DEFAULT 1,
  match_score REAL NOT NULL,
  fetched_at  INTEGER NOT NULL,
  PRIMARY KEY (part_id, provider)
);

CREATE INDEX IF NOT EXISTS offers_fetched_at ON offers (fetched_at);

CREATE TABLE IF NOT EXISTS price_history (
  part_id   TEXT NOT NULL,
  provider  TEXT NOT NULL,
  price     REAL NOT NULL,
  seen_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS price_history_part ON price_history (part_id, seen_at);

-- Records every scrape attempt, including the ones that found nothing, so a
-- part with no match is not retried on every request.
CREATE TABLE IF NOT EXISTS scrape_log (
  part_id     TEXT NOT NULL,
  provider    TEXT NOT NULL,
  ok          INTEGER NOT NULL,
  matched     INTEGER NOT NULL,
  error       TEXT,
  attempted_at INTEGER NOT NULL,
  PRIMARY KEY (part_id, provider)
);

CREATE TABLE IF NOT EXISTS builds (
  slug       TEXT PRIMARY KEY,
  payload    TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db
  mkdirSync(dirname(DB_PATH), { recursive: true })
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.exec(SCHEMA)
  return db
}
