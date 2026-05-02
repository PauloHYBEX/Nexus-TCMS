-- Nexus Testing - SQLite Schema (SQLite 3.35+, bundled with better-sqlite3 9.x)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  role TEXT DEFAULT 'viewer' CHECK(role IN ('master','admin','manager','tester','viewer')),
  avatar_url TEXT,
  github_url TEXT,
  google_url TEXT,
  website_url TEXT,
  bio TEXT,
  tags TEXT DEFAULT '[]',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  can_manage_users INTEGER DEFAULT 0,
  can_manage_projects INTEGER DEFAULT 0,
  can_delete_projects INTEGER DEFAULT 0,
  can_manage_plans INTEGER DEFAULT 0,
  can_manage_cases INTEGER DEFAULT 0,
  can_manage_executions INTEGER DEFAULT 0,
  can_view_reports INTEGER DEFAULT 0,
  can_use_ai INTEGER DEFAULT 0,
  can_access_model_control INTEGER DEFAULT 0,
  can_access_admin_menu INTEGER DEFAULT 0,
  can_configure_ai_models INTEGER DEFAULT 0,
  can_test_ai_connections INTEGER DEFAULT 0,
  can_manage_ai_templates INTEGER DEFAULT 0,
  can_select_ai_models INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  color TEXT DEFAULT '#3b82f6',
  icon TEXT DEFAULT '',
  created_by TEXT REFERENCES profiles(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  objective TEXT DEFAULT '',
  scope TEXT DEFAULT '',
  approach TEXT DEFAULT '',
  criteria TEXT DEFAULT '',
  resources TEXT DEFAULT '',
  schedule TEXT DEFAULT '',
  risks TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES profiles(id),
  user_id TEXT REFERENCES profiles(id),
  generated_by_ai INTEGER DEFAULT 0,
  sequence INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  preconditions TEXT DEFAULT '',
  expected_result TEXT DEFAULT '',
  priority TEXT DEFAULT 'medium',
  type TEXT DEFAULT 'functional',
  status TEXT DEFAULT 'active',
  plan_id TEXT REFERENCES test_plans(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES profiles(id),
  user_id TEXT REFERENCES profiles(id),
  generated_by_ai INTEGER DEFAULT 0,
  sequence INTEGER,
  steps TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_executions (
  id TEXT PRIMARY KEY,
  case_id TEXT REFERENCES test_cases(id) ON DELETE CASCADE,
  plan_id TEXT REFERENCES test_plans(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'not_tested',
  actual_result TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  executed_by TEXT DEFAULT '',
  executed_at TEXT,
  created_by TEXT REFERENCES profiles(id),
  user_id TEXT REFERENCES profiles(id),
  generated_by_ai INTEGER DEFAULT 0,
  sequence INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS requirements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  type TEXT DEFAULT 'functional',
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'draft',
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES profiles(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS requirements_cases (
  id TEXT PRIMARY KEY,
  requirement_id TEXT REFERENCES requirements(id) ON DELETE CASCADE,
  case_id TEXT REFERENCES test_cases(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(requirement_id, case_id)
);

CREATE TABLE IF NOT EXISTS defects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  severity TEXT DEFAULT 'medium',
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open',
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  plan_id TEXT REFERENCES test_plans(id) ON DELETE SET NULL,
  case_id TEXT REFERENCES test_cases(id) ON DELETE SET NULL,
  execution_id TEXT REFERENCES test_executions(id) ON DELETE SET NULL,
  reported_by TEXT REFERENCES profiles(id),
  assigned_to TEXT REFERENCES profiles(id),
  user_id TEXT REFERENCES profiles(id),
  sequence INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES profiles(id),
  action TEXT NOT NULL,
  context TEXT,
  metadata TEXT DEFAULT '{}',
  table_name TEXT,
  record_id TEXT,
  details TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  settings TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  link TEXT DEFAULT '',
  read_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  preferences TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profile_function_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  function_name TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS role_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  requested_role TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Chaves de API criptografadas (AES-256-GCM at-rest). A chave raw nunca e persistida em texto claro.
CREATE TABLE IF NOT EXISTS api_keys (
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model_id TEXT DEFAULT '',
  key_encrypted TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, provider, model_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_test_plans_project ON test_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_plan ON test_cases(plan_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_project ON test_cases(project_id);
CREATE INDEX IF NOT EXISTS idx_executions_case ON test_executions(case_id);
CREATE INDEX IF NOT EXISTS idx_executions_plan ON test_executions(plan_id);
CREATE INDEX IF NOT EXISTS idx_executions_project ON test_executions(project_id);
CREATE INDEX IF NOT EXISTS idx_requirements_project ON requirements(project_id);
CREATE INDEX IF NOT EXISTS idx_defects_project ON defects(project_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(user_id);

-- Configurar realtime para notificacoes (Supabase realtime)
-- Nota: Em SQLite local, o realtime eh simulado via polling no cliente
-- Esta tabela precisa estar na publicacao supabase_realtime para funcionar em PostgreSQL
