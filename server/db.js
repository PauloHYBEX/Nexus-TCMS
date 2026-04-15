import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATABASE_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'nexus_testing.db');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Converte placeholders PostgreSQL-style ($1, $2, ...) para ? do SQLite
function toSQLite(sql) {
  return sql.replace(/\$\d+/g, '?');
}

// better-sqlite3 não aceita booleanos — converte para 0/1
function coerceParams(params) {
  return params.map(p => typeof p === 'boolean' ? (p ? 1 : 0) : p);
}

export function query(sql, params = []) {
  const converted = toSQLite(sql);
  const hasReturning = /RETURNING/i.test(converted);
  const isRead = /^\s*(SELECT|WITH)/i.test(converted);
  const stmt = db.prepare(converted);
  const safe = coerceParams(params);
  if (isRead || hasReturning) {
    const rows = stmt.all(...safe);
    return { rows, rowCount: rows.length };
  }
  const result = stmt.run(...safe);
  return { rows: [], rowCount: result.changes };
}

export function getClient() {
  return {
    query: (sql, params = []) => query(sql, params),
    release: () => {},
  };
}

export const pool = {
  connect: () => getClient(),
  end: () => { try { db.close(); } catch {} },
};
