import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const schemaPath = path.join(root, 'schema.sql');
const DATA_DIR = process.env.DATABASE_DIR || path.join(root, '..', 'data');
const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'nexus_testing.db');

const MASTER_EMAIL = process.env.LOCAL_MASTER_EMAIL || 'paulo.santos@teste';
const MASTER_PASSWORD = process.env.LOCAL_MASTER_PASSWORD || '050200@Pa';
const MASTER_NAME = process.env.LOCAL_MASTER_NAME || 'Paulo Santos';

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const schema = fs.readFileSync(schemaPath, 'utf8');
  // Recriar o arquivo para garantir que o schema mais recente seja aplicado
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  const walPath = DB_PATH + '-wal';
  const shmPath = DB_PATH + '-shm';
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  try {
    db.exec(schema);

    // Limpar todos os dados anteriores
    db.pragma('foreign_keys = OFF');
    const tables = [
      'role_requests', 'profile_function_roles', 'notification_preferences',
      'notifications', 'user_settings', 'activity_logs', 'requirements_cases',
      'defects', 'requirements', 'test_executions', 'test_cases', 'test_plans',
      'projects', 'user_permissions', 'profiles',
    ];
    db.transaction(() => {
      for (const t of tables) db.prepare('DELETE FROM ' + t).run();
    })();
    db.pragma('foreign_keys = ON');

    // Criar usuario master
    const passwordHash = bcrypt.hashSync(MASTER_PASSWORD, 10);
    const userId = randomUUID();

    db.transaction(() => {
      db.prepare(
        'INSERT INTO profiles (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)'
      ).run(userId, MASTER_EMAIL.toLowerCase().trim(), passwordHash, MASTER_NAME, 'master');

      db.prepare(
        'INSERT INTO user_permissions (user_id, can_manage_users, can_manage_projects, can_delete_projects, can_manage_plans, can_manage_cases, can_manage_executions, can_view_reports, can_use_ai, can_access_model_control, can_access_admin_menu, can_configure_ai_models, can_test_ai_connections, can_manage_ai_templates, can_select_ai_models) VALUES (?, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)'
      ).run(userId);
    })();

    console.log('Banco local (SQLite) resetado com sucesso.');
    console.log('Usuarios anteriores removidos.');
    console.log('Master: ' + MASTER_EMAIL);
    console.log('Senha:  ' + MASTER_PASSWORD);
  } catch (e) {
    console.error('Falha ao inicializar banco local:', e);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
