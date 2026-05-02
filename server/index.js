import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { createRequire } from 'module';
import { getClient, db, query } from './db.js';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import mammoth from 'mammoth';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const uploadsDir = path.join(rootDir, 'public', 'uploads');

// Validação do segredo JWT — obrigatório e forte em producao
const IS_PROD = process.env.NODE_ENV === 'production';
const RAW_SECRET = process.env.LOCAL_AUTH_SECRET;
const MIN_SECRET_LEN = 32;
const WEAK_SECRETS = new Set(['nexus-local-secret', 'change-me', 'secret', 'changeme']);

if (!RAW_SECRET) {
  if (IS_PROD) {
    console.error('[security] LOCAL_AUTH_SECRET nao definido. Abortando em producao.');
    process.exit(1);
  } else {
    console.warn('[security] LOCAL_AUTH_SECRET nao definido. Usando segredo de desenvolvimento temporario.');
  }
} else if (RAW_SECRET.length < MIN_SECRET_LEN || WEAK_SECRETS.has(RAW_SECRET)) {
  if (IS_PROD) {
    console.error('[security] LOCAL_AUTH_SECRET fraco (<' + MIN_SECRET_LEN + ' chars ou padrao conhecido). Abortando.');
    process.exit(1);
  } else {
    console.warn('[security] LOCAL_AUTH_SECRET fraco. Gere um novo com: openssl rand -hex 32');
  }
}

const JWT_SECRET = RAW_SECRET || ('dev-only-' + Math.random().toString(36).slice(2));
const PORT = Number(process.env.API_PORT || 4000);

await fs.mkdir(uploadsDir, { recursive: true });

const app = express();

// CORS com allowlist configuravel via ALLOWED_ORIGINS (separadas por virgula)
const DEFAULT_ORIGINS = ['http://localhost:8080', 'http://localhost:5173', 'http://127.0.0.1:8080'];
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(','))
  .split(',').map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Permite requisicoes sem Origin (curl, same-origin, ferramentas internas)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
      return callback(null, true);
    }
    return callback(new Error('Origem nao permitida pelo CORS: ' + origin));
  },
  credentials: true,
}));

// Headers de seguranca basicos (sem dependencia externa)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '0');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));

// Rate limit simples em memoria para rotas de autenticacao
const authAttempts = new Map(); // key: ip, value: { count, resetAt }
const AUTH_LIMIT = Number(process.env.AUTH_RATE_LIMIT || 10);
const AUTH_WINDOW_MS = Number(process.env.AUTH_RATE_WINDOW_MS || 15 * 60 * 1000);

function authRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = authAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    authAttempts.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    return next();
  }
  entry.count += 1;
  if (entry.count > AUTH_LIMIT) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: { message: 'Muitas tentativas. Tente novamente em ' + retryAfter + 's.' } });
  }
  next();
}

// Limpeza periodica do mapa de tentativas
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of authAttempts.entries()) {
    if (entry.resetAt < now) authAttempts.delete(ip);
  }
}, 5 * 60 * 1000).unref?.();

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, safe);
  },
});
const upload = multer({ storage });

const ALLOWED_TABLES = new Set([
  'profiles', 'user_permissions', 'projects', 'test_plans', 'test_cases',
  'test_executions', 'requirements', 'requirements_cases', 'defects',
  'activity_logs', 'user_settings', 'notifications', 'notification_preferences',
  'profile_function_roles', 'role_requests',
]);

const BOOL_PERM_COLS = [
  'can_manage_users','can_manage_projects','can_delete_projects','can_manage_plans',
  'can_manage_cases','can_manage_executions','can_view_reports','can_use_ai',
  'can_access_model_control','can_access_admin_menu','can_configure_ai_models',
  'can_test_ai_connections','can_manage_ai_templates','can_select_ai_models',
];

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}

function parseToken(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

async function getCurrentUser(req) {
  const payload = parseToken(req);
  if (!payload?.sub) return null;
  const { rows } = query('SELECT id, email, display_name, role, avatar_url, active FROM profiles WHERE id = ? AND active = 1', [payload.sub]);
  return rows[0] || null;
}

async function requireUser(req, res, next) {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ error: { message: 'Nao autenticado.' } });
    req.user = user;
    next();
  } catch (error) { next(error); }
}

function buildWhere(filters = [], params = []) {
  const clauses = [];
  for (const filter of filters) {
    const { type, column, value } = filter;
    if (!column || !/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(column)) continue;
    if (type === 'eq') {
      params.push(value);
      clauses.push(column + ' = \$' + params.length);
    } else if (type === 'neq') {
      params.push(value);
      clauses.push(column + ' <> \$' + params.length);
    } else if (type === 'gte') {
      params.push(value);
      clauses.push(column + ' >= \$' + params.length);
    } else if (type === 'lte') {
      params.push(value);
      clauses.push(column + ' <= \$' + params.length);
    } else if (type === 'in' && Array.isArray(value) && value.length > 0) {
      const placeholders = value.map((v) => { params.push(v); return '\$' + params.length; });
      clauses.push(column + ' IN (' + placeholders.join(', ') + ')');
    } else if (type === 'match' && value && typeof value === 'object') {
      for (const [key, val] of Object.entries(value)) {
        if (!/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(key)) continue;
        params.push(val);
        clauses.push(key + ' = \$' + params.length);
      }
    }
  }
  return clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
}

function normalizeRows(table, rows) {
  if (table === 'user_permissions') {
    return rows.map((row) => {
      const norm = { ...row };
      for (const col of BOOL_PERM_COLS) {
        if (col in norm) norm[col] = norm[col] === 1 || norm[col] === true;
      }
      return norm;
    });
  }
  if (table === 'profiles') {
    return rows.map((row) => ({
      ...row,
      active: row.active === 1 || row.active === true,
      tags: typeof row.tags === 'string'
        ? (() => { try { return JSON.parse(row.tags); } catch { return []; } })()
        : (Array.isArray(row.tags) ? row.tags : []),
    }));
  }
  if (table === 'test_cases') {
    return rows.map((row) => ({
      ...row,
      steps: typeof row.steps === 'string'
        ? (() => { try { return JSON.parse(row.steps); } catch { return []; } })()
        : (Array.isArray(row.steps) ? row.steps : []),
    }));
  }
  if (table === 'activity_logs') {
    return rows.map((row) => ({
      ...row,
      metadata: typeof row.metadata === 'string'
        ? (() => { try { return JSON.parse(row.metadata); } catch { return {}; } })()
        : (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
    }));
  }
  return rows;
}

function serializeForDb(table, values) {
  if (!values) return values;
  if (table === 'test_cases' && Array.isArray(values.steps)) {
    return { ...values, steps: JSON.stringify(values.steps) };
  }
  if (table === 'profiles' && Array.isArray(values.tags)) {
    return { ...values, tags: JSON.stringify(values.tags) };
  }
  if (table === 'activity_logs' && values.metadata && typeof values.metadata === 'object') {
    return { ...values, metadata: JSON.stringify(values.metadata) };
  }
  return values;
}

const _tableColsCache = new Map();
function getTableCols(table) {
  if (!_tableColsCache.has(table)) {
    try {
      const rows = db.prepare('PRAGMA table_info(' + table + ')').all();
      _tableColsCache.set(table, new Set(rows.map(r => r.name)));
    } catch { _tableColsCache.set(table, new Set()); }
  }
  return _tableColsCache.get(table);
}
function filterToTableCols(table, obj) {
  const allowed = getTableCols(table);
  if (!allowed.size) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

// Auto-migrate existing databases: add columns that may be missing
{
  _tableColsCache.clear(); // limpa antes de migrar
  const migrations = [
    'ALTER TABLE test_plans ADD COLUMN sequence INTEGER',
    'ALTER TABLE test_plans ADD COLUMN user_id TEXT',
    'ALTER TABLE test_plans ADD COLUMN generated_by_ai INTEGER DEFAULT 0',
    'ALTER TABLE test_cases ADD COLUMN sequence INTEGER',
    'ALTER TABLE test_cases ADD COLUMN user_id TEXT',
    'ALTER TABLE test_cases ADD COLUMN generated_by_ai INTEGER DEFAULT 0',
    'ALTER TABLE test_executions ADD COLUMN sequence INTEGER',
    'ALTER TABLE test_executions ADD COLUMN user_id TEXT',
    'ALTER TABLE test_executions ADD COLUMN generated_by_ai INTEGER DEFAULT 0',
    'ALTER TABLE defects ADD COLUMN sequence INTEGER',
    'ALTER TABLE requirements ADD COLUMN sequence INTEGER',
    'ALTER TABLE requirements ADD COLUMN user_id TEXT',
    'ALTER TABLE requirements ADD COLUMN generated_by_ai INTEGER DEFAULT 0',
    'ALTER TABLE profiles ADD COLUMN github_url TEXT',
    'ALTER TABLE profiles ADD COLUMN google_url TEXT',
    'ALTER TABLE profiles ADD COLUMN website_url TEXT',
    'ALTER TABLE profiles ADD COLUMN tags TEXT DEFAULT \'[]\'',
    'ALTER TABLE profiles ADD COLUMN bio TEXT',
    'ALTER TABLE defects ADD COLUMN user_id TEXT',
    'ALTER TABLE defects ADD COLUMN plan_id TEXT REFERENCES test_plans(id) ON DELETE SET NULL',
    'ALTER TABLE activity_logs ADD COLUMN context TEXT',
    'ALTER TABLE activity_logs ADD COLUMN metadata TEXT DEFAULT \'{}\'',
    'ALTER TABLE projects ADD COLUMN icon TEXT DEFAULT \'\'',
    'ALTER TABLE test_plans ADD COLUMN branches TEXT DEFAULT \'\'',
    'ALTER TABLE test_cases ADD COLUMN branches TEXT DEFAULT \'\'',
    'ALTER TABLE notifications ADD COLUMN link TEXT DEFAULT \'\'',
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch (e) {
      // Ignore 'duplicate column name' errors but log unexpected ones
      if (!String(e?.message).includes('duplicate column') && !String(e?.message).includes('already exists')) {
        console.warn('[migration skip]', String(e?.message).slice(0, 120), '|', sql.slice(0, 80));
      }
    }
  }
  _tableColsCache.clear(); // invalida cache após migrações

  // Verificar e criar tabelas que podem estar faltando
  const extraTables = [
    `CREATE TABLE IF NOT EXISTS requirements_cases (
      id TEXT PRIMARY KEY,
      requirement_id TEXT REFERENCES requirements(id) ON DELETE CASCADE,
      case_id TEXT REFERENCES test_cases(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(requirement_id, case_id)
    )`,
    `CREATE TABLE IF NOT EXISTS role_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
      requested_role TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
  ];
  for (const sql of extraTables) {
    try { db.exec(sql); } catch { /* already exists */ }
  }
  _tableColsCache.clear();
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/auth/login', authRateLimit, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const { rows } = query('SELECT * FROM profiles WHERE email = ? AND active = 1', [String(email || '').toLowerCase().trim()]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: { message: 'Credenciais invalidas.' } });
    const ok = await bcrypt.compare(String(password || ''), user.password_hash);
    if (!ok) return res.status(401).json({ error: { message: 'Credenciais invalidas.' } });
    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, user_metadata: { full_name: user.display_name || '' } } });
  } catch (error) { next(error); }
});

app.post('/api/auth/register', authRateLimit, async (req, res, next) => {
  try {
    const { email, password, name } = req.body || {};
    const passwordHash = await bcrypt.hash(String(password || ''), 10);
    const newId = randomUUID();
    const inserted = query(
      'INSERT INTO profiles (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?) RETURNING id, email, display_name',
      [newId, String(email || '').toLowerCase().trim(), passwordHash, String(name || ''), 'viewer']
    );
    const user = inserted.rows[0];
    query('INSERT INTO user_permissions (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING', [user.id]);
    const token = signToken({ id: user.id, email: user.email, role: 'viewer' });
    res.json({ token, user: { id: user.id, email: user.email, role: 'viewer', user_metadata: { full_name: user.display_name || '' } } });
  } catch (error) { next(error); }
});

app.get('/api/auth/session', async (req, res, next) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) return res.json({ session: null });
    res.json({ session: { user: { id: user.id, email: user.email, role: user.role, user_metadata: { full_name: user.display_name || '' } } } });
  } catch (error) { next(error); }
});

app.post('/api/auth/reset-password', authRateLimit, (_req, res) => {
  res.json({ ok: true, message: 'Recuperacao de senha nao suportada no modo local.' });
});

app.post('/api/auth/update-password', requireUser, async (req, res, next) => {
  try {
    const passwordHash = await bcrypt.hash(String(req.body?.password || ''), 10);
    query('UPDATE profiles SET password_hash = ? WHERE id = ?', [passwordHash, req.user.id]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post('/api/db/query', requireUser, async (req, res, next) => {
  try {
    const { table, filters = [], order, limit, columns = '*', options = {} } = req.body || {};
    if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: { message: 'Tabela nao permitida.' } });
    const params = [];
    const whereSql = buildWhere(filters, params);
    const orderSql = order?.column && /^[_a-zA-Z][_a-zA-Z0-9]*$/.test(order.column)
      ? ' ORDER BY ' + order.column + (order.ascending === false ? ' DESC' : ' ASC')
      : '';
    const limitSql = Number.isFinite(limit) ? ' LIMIT ' + Number(limit) : '';
    let selectSql;
    if (options?.head && options?.count) {
      selectSql = 'COUNT(*) AS count';
    } else if (columns === '*') {
      selectSql = '*';
    } else {
      // Filter requested columns to only those that exist in the table
      const existingCols = getTableCols(table);
      const requestedCols = columns.split(',').map(c => c.trim()).filter(c => /^[_a-zA-Z][_a-zA-Z0-9]*$/.test(c));
      const safeCols = existingCols.size > 0 ? requestedCols.filter(c => existingCols.has(c)) : requestedCols;
      selectSql = safeCols.length > 0 ? safeCols.join(', ') : '*';
    }
    const result = query('SELECT ' + selectSql + ' FROM ' + table + whereSql + orderSql + limitSql, params);
    const rows = normalizeRows(table, result.rows);
    const count = options?.count ? (options.head ? (rows[0]?.count || 0) : rows.length) : null;
    res.json({ data: options?.head ? null : rows, error: null, count });
  } catch (error) { next(error); }
});

app.post('/api/db/mutate', requireUser, async (req, res, next) => {
  try {
    const { table, action, values, filters = [], options = {} } = req.body || {};
    if (!ALLOWED_TABLES.has(table)) return res.status(400).json({ error: { message: 'Tabela nao permitida.' } });
    const client = getClient();
    try {
      let result;
      const SEQ_TABLES = new Set(['test_plans', 'test_cases', 'test_executions', 'requirements', 'defects']);
      if (action === 'insert' || action === 'upsert') {
        const rawRows = Array.isArray(values) ? values : [values];
        if (!rawRows.length) return res.json({ data: [], error: null });
        let nextSeq = null; // inicializado na 1ª linha sem sequence para evitar duplicatas em lote
        const rows = rawRows.map((row) => {
          const r = serializeForDb(table, row);
          const base = r.id ? r : { id: randomUUID(), ...r };
          const filtered = filterToTableCols(table, base);
          if (SEQ_TABLES.has(table) && filtered.sequence == null) {
            if (nextSeq === null) {
              // Sequencia por PROJETO — se a tabela tem project_id e o row tambem,
              // filtra para que cada projeto tenha sua propria numeracao comecando em 1
              const tableCols = getTableCols(table);
              const hasProjectCol = tableCols.has('project_id');
              const projectId = filtered.project_id || null;
              let seqSql = `SELECT sequence FROM ${table} WHERE sequence IS NOT NULL`;
              const seqParams = [];
              if (hasProjectCol && projectId) {
                seqSql += ' AND project_id = ?';
                seqParams.push(projectId);
              } else if (hasProjectCol) {
                // Row sem project_id em tabela com project_id: so conta outros sem project_id
                seqSql += ' AND project_id IS NULL';
              }
              seqSql += ' ORDER BY sequence ASC';
              const { rows: seqRows } = query(seqSql, seqParams);
              const existing = new Set(seqRows.map(r => Number(r.sequence)).filter(n => Number.isFinite(n) && n > 0));
              let candidate = 1;
              while (existing.has(candidate)) candidate++;
              nextSeq = candidate;
            }
            filtered.sequence = nextSeq++;
          }
          return filtered;
        });
        // Union de todas as colunas para garantir alinhamento em batch inserts
        const colSet = new Set();
        rows.forEach(row => Object.keys(row).forEach(k => colSet.add(k)));
        const cols = Array.from(colSet);
        const conflictCols = String(options?.onConflict || '').split(',').map((s) => s.trim()).filter(Boolean);
        const updateCols = cols.filter((c) => !conflictCols.includes(c));
        const onConflict = options?.onConflict
          ? (updateCols.length > 0
              ? ' ON CONFLICT (' + conflictCols.join(', ') + ') DO UPDATE SET ' + updateCols.map((c) => c + ' = excluded.' + c).join(', ')
              : ' ON CONFLICT (' + conflictCols.join(', ') + ') DO NOTHING')
          : '';
        // better-sqlite3: inserir cada row individualmente para evitar
        // desalinhamento de parâmetros em batch com colunas heterogêneas
        const allInserted = [];
        for (const row of rows) {
          const rowParams = [];
          const placeholders = cols.map((col) => { rowParams.push(row[col] !== undefined ? row[col] : null); return '?' ; });
          const sql = 'INSERT INTO ' + table + ' (' + cols.join(', ') + ') VALUES (' + placeholders.join(', ') + ')' + (action === 'upsert' ? onConflict : '') + ' RETURNING *';
          const r = client.query(sql, rowParams);
          allInserted.push(...(r.rows || []));
        }
        result = { rows: allInserted, rowCount: allInserted.length };
      } else if (action === 'update') {
        const allowed = getTableCols(table);
        const entries = Object.entries(serializeForDb(table, values) || {})
          .filter(([key]) => !allowed.size || allowed.has(key));
        const params = [];
        const setSql = entries.map(([key, val]) => { params.push(val); return key + ' = \$' + params.length; }).join(', ');
        const whereSql = buildWhere(filters, params);
        result = client.query('UPDATE ' + table + ' SET ' + setSql + whereSql + ' RETURNING *', params);
      } else if (action === 'delete') {
        const params = [];
        const whereSql = buildWhere(filters, params);
        result = client.query('DELETE FROM ' + table + whereSql + ' RETURNING *', params);
      } else {
        return res.status(400).json({ error: { message: 'Acao invalida.' } });
      }
      res.json({ data: normalizeRows(table, result.rows), error: null });
    } finally {
      client.release();
    }
  } catch (error) { next(error); }
});

app.post('/api/rpc/:name', requireUser, async (req, res, next) => {
  try {
    const { name } = req.params;
    if (name === 'list_all_users') {
      const { rows } = query('SELECT id, email, display_name, role, created_at FROM profiles ORDER BY display_name, email');
      // Retorna datas em formato ISO para parse correto no frontend
      const rowsWithIsoDates = rows.map(r => ({
        ...r,
        created_at: r.created_at ? new Date(r.created_at).toISOString() : r.created_at
      }));
      return res.json({ data: rowsWithIsoDates, error: null });
    }
    if (name === 'sync_profiles_from_auth') {
      return res.json({ data: { synced: true }, error: null });
    }
    return res.status(404).json({ error: { message: 'RPC nao implementado.' } });
  } catch (error) { next(error); }
});

app.post('/api/reports/aggregate', requireUser, async (req, res, next) => {
  try {
    const { type, filters = {} } = req.body || {};
    const { dateFrom, dateTo } = filters;
    const dateClauses = [];
    const dateParams = [];
    if (dateFrom) { dateParams.push(dateFrom); dateClauses.push('executed_at >= \$' + dateParams.length); }
    if (dateTo) { dateParams.push(dateTo); dateClauses.push('executed_at <= \$' + dateParams.length); }
    const baseWhere = dateClauses.length ? ' WHERE ' + dateClauses.join(' AND ') : '';

    if (type === 'trend-analysis') {
      const granularity = String(filters.granularity || 'day');
      const dateFmt = granularity === 'month' ? '%Y-%m' : granularity === 'week' ? '%Y-W%W' : '%Y-%m-%d';
      const sql = "SELECT strftime('" + dateFmt + "', executed_at) AS bucket, SUM(CASE WHEN status='passed' THEN 1 ELSE 0 END) AS passed, SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed, SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END) AS blocked, SUM(CASE WHEN status='not_tested' THEN 1 ELSE 0 END) AS not_tested, COUNT(*) AS total FROM test_executions WHERE executed_at IS NOT NULL" + (dateClauses.length ? ' AND ' + dateClauses.join(' AND ') : '') + " GROUP BY 1 ORDER BY 1";
      const { rows } = query(sql, dateParams);
      const totals = rows.reduce((a, c) => ({ passed: a.passed + Number(c.passed), failed: a.failed + Number(c.failed), blocked: a.blocked + Number(c.blocked), not_tested: a.not_tested + Number(c.not_tested), total: a.total + Number(c.total) }), { passed: 0, failed: 0, blocked: 0, not_tested: 0, total: 0 });
      return res.json({ type, generatedAt: new Date().toISOString(), data: { series: rows, totals, granularity } });
    }

    if (type === 'failure-analysis') {
      const { rows } = query('SELECT id, case_id, plan_id, status, executed_at FROM test_executions' + baseWhere, dateParams);
      const failed = rows.filter((r) => r.status === 'failed');
      const caseCount = new Map();
      const planCount = new Map();
      for (const r of failed) {
        if (r.case_id) caseCount.set(r.case_id, (caseCount.get(r.case_id) || 0) + 1);
        if (r.plan_id) planCount.set(r.plan_id, (planCount.get(r.plan_id) || 0) + 1);
      }
      const caseIds = [...caseCount.keys()];
      const planIds = [...planCount.keys()];
      const caseRows = caseIds.length
        ? query('SELECT id, title FROM test_cases WHERE id IN (' + caseIds.map((_, i) => '\$' + (i + 1)).join(', ') + ')', caseIds).rows
        : [];
      const planRows = planIds.length
        ? query('SELECT id, title FROM test_plans WHERE id IN (' + planIds.map((_, i) => '\$' + (i + 1)).join(', ') + ')', planIds).rows
        : [];
      const caseMap = new Map(caseRows.map((r) => [r.id, r.title]));
      const planMap = new Map(planRows.map((r) => [r.id, r.title]));
      return res.json({ type, generatedAt: new Date().toISOString(), data: {
        totals: { totalExecutions: rows.length, failedExecutions: failed.length, failureRate: rows.length ? failed.length / rows.length : 0, lastFailedAt: failed[0]?.executed_at || null },
        topCases: caseIds.map((id) => ({ id, title: caseMap.get(id) || id, count: caseCount.get(id) })).sort((a, b) => b.count - a.count).slice(0, 20),
        topPlans: planIds.map((id) => ({ id, title: planMap.get(id) || id, count: planCount.get(id) })).sort((a, b) => b.count - a.count).slice(0, 20),
      }});
    }

    if (type === 'requirements-defects') {
      const { rows: reqs } = query('SELECT status, priority FROM requirements');
      const { rows: defs } = query('SELECT status, severity FROM defects');
      const countBy = (rowArr, key) => rowArr.reduce((acc, row) => ({ ...acc, [row[key]]: (acc[row[key]] || 0) + 1 }), {});
      return res.json({ type, generatedAt: new Date().toISOString(), data: {
        totals: { requirements: reqs.length, defects: defs.length },
        requirementsByStatus: countBy(reqs, 'status'),
        requirementsByPriority: countBy(reqs, 'priority'),
        defectsBySeverity: countBy(defs, 'severity'),
        defectsByStatus: countBy(defs, 'status'),
      }});
    }

    res.status(400).json({ error: { message: 'Tipo de relatorio nao suportado.' } });
  } catch (error) { next(error); }
});

// Extrai texto e imagens de arquivos .pptx
async function extractFromPptx(filePath) {
  try {
    const data = await fs.readFile(filePath);
    const zip = await JSZip.loadAsync(data);

    // Extrair texto dos slides
    const slideFiles = Object.keys(zip.files).filter(n => n.startsWith('ppt/slides/slide') && n.endsWith('.xml'));
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml$/)?.[1] || '0', 10);
      const numB = parseInt(b.match(/slide(\d+)\.xml$/)?.[1] || '0', 10);
      return numA - numB;
    });
    const texts = [];
    for (const slideFile of slideFiles) {
      const xml = await zip.files[slideFile].async('text');
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      const tNodes = doc.getElementsByTagName('a:t');
      const slideTexts = [];
      for (let i = 0; i < tNodes.length; i++) {
        const text = tNodes[i].textContent || '';
        if (text.trim()) slideTexts.push(text);
      }
      if (slideTexts.length) {
        texts.push(`=== Slide ${slideFile.match(/slide(\d+)\.xml$/)?.[1] || '?'} ===\n${slideTexts.join('\n')}`);
      }
    }

    // Extrair imagens (ppt/media/)
    const images = [];
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
    const mediaFiles = Object.keys(zip.files).filter(n => {
      const lower = n.toLowerCase();
      return n.startsWith('ppt/media/') && imageExts.some(ext => lower.endsWith(ext));
    });

    for (const mediaFile of mediaFiles) {
      try {
        const ext = path.extname(mediaFile).toLowerCase().replace('.', '');
        const mime = ext === 'jpg' ? 'jpeg' : ext;
        const buffer = await zip.files[mediaFile].async('nodebuffer');
        const base64 = buffer.toString('base64');
        // Limitar tamanho da imagem (max 2MB base64 ~ 1.5MB binário)
        if (base64.length > 2 * 1024 * 1024) continue;
        images.push({
          name: path.basename(mediaFile),
          dataUrl: `data:image/${mime};base64,${base64}`,
          slide: null // Podemos mapear para slides posteriorente se necessário
        });
      } catch (imgErr) {
        console.warn(`Erro ao extrair imagem ${mediaFile}:`, imgErr.message);
      }
    }

    return { text: texts.join('\n\n'), images };
  } catch (e) {
    throw new Error(`Erro ao extrair conteúdo do PPTX: ${e.message}`);
  }
}

app.post('/api/storage/upload', requireUser, upload.single('file'), async (req, res) => {
  res.json({ path: req.file.filename, publicUrl: '/uploads/' + req.file.filename });
});

// Endpoint para extrair conteúdo de documentos (PPTX com imagens, TXT, etc)
app.post('/api/documents/extract', requireUser, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: { message: 'Nenhum arquivo enviado.' } });
    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let result = { text: '', images: [] };
    if (ext === '.pptx') {
      result = await extractFromPptx(filePath);
    } else if (ext === '.txt' || ext === '.md' || req.file.mimetype === 'text/plain') {
      result.text = await fs.readFile(filePath, 'utf-8');
    } else if (ext === '.pdf') {
      const buffer = await fs.readFile(filePath);
      const parsed = await pdfParse(buffer);
      result.text = parsed.text || '';
    } else if (ext === '.docx') {
      const buffer = await fs.readFile(filePath);
      const { value } = await mammoth.extractRawText({ buffer });
      result.text = value || '';
    } else if (ext === '.doc') {
      const buffer = await fs.readFile(filePath);
      try {
        const { value } = await mammoth.extractRawText({ buffer });
        result.text = value || '';
      } catch {
        result.text = '(Arquivo .doc legado — conteúdo não pôde ser extraído automaticamente. Por favor, salve como .docx ou cole o conteúdo manualmente.)';
      }
    } else if (ext === '.xlsx' || ext === '.xls') {
      result.text = '(Arquivo Excel detectado — cole o conteúdo das células relevantes no campo de Requisitos abaixo para melhor análise.)';
    } else {
      await fs.unlink(filePath).catch(() => {});
      return res.status(400).json({ error: { message: `Formato '${ext}' não suportado. Use .pptx, .pdf, .docx, .doc ou .txt` } });
    }
    await fs.unlink(filePath).catch(() => {});
    res.json({
      text: result.text,
      images: result.images,
      filename: req.file.originalname,
      format: ext.slice(1)
    });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: { message: error?.message || 'Erro interno.' } });
});

app.listen(PORT, () => {
  console.log('Nexus Testing API rodando em http://localhost:' + PORT);
});

process.on('SIGINT', () => {
  try { db.close(); } catch {}
  process.exit(0);
});
