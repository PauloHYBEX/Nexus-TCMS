// Validacao leve de payloads por tabela. Roda ANTES da persistencia.
// Filosofia: bloquear dados ma-formados sem quebrar flows existentes.
// Regras mais restritivas ficam nos forms (Zod) e/ou em endpoints dedicados.

// ─── Enums aceitos ────────────────────────────────────────────────────────
const PRIORITIES = new Set(['low', 'medium', 'high', 'critical']);
const TEST_CASE_TYPES = new Set(['functional', 'integration', 'performance', 'security', 'usability']);
const EXEC_STATUSES = new Set(['passed', 'failed', 'blocked', 'not_tested']);
const DEFECT_STATUSES = new Set(['open', 'in_analysis', 'fixed', 'validated', 'closed']);
const REQ_STATUSES = new Set(['open', 'in_progress', 'approved', 'deprecated']);

// ─── State machines ───────────────────────────────────────────────────────
const DEFECT_TRANSITIONS = {
  open: ['in_analysis', 'fixed', 'closed'],
  in_analysis: ['open', 'fixed', 'closed'],
  fixed: ['validated', 'in_analysis', 'open'],
  validated: ['closed', 'open'],
  closed: ['open'],
};

const REQ_TRANSITIONS = {
  open: ['in_progress', 'deprecated'],
  in_progress: ['approved', 'open', 'deprecated'],
  approved: ['deprecated', 'in_progress'],
  deprecated: ['open'],
};

export function canTransitionDefect(from, to) {
  if (!from || from === to) return true;
  return (DEFECT_TRANSITIONS[from] || []).includes(to);
}

export function canTransitionRequirement(from, to) {
  if (!from || from === to) return true;
  return (REQ_TRANSITIONS[from] || []).includes(to);
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function isStr(v, min = 0, max = Infinity) {
  if (typeof v !== 'string') return false;
  const t = v.trim();
  return t.length >= min && t.length <= max;
}

function isNonEmptyStr(v, max = 500) {
  return isStr(v, 1, max);
}

// ─── Validacao por tabela (campos obrigatorios + enums) ───────────────────
// Retorna string (mensagem de erro) ou null se OK.
export function validateRow(table, row, { isUpdate = false } = {}) {
  if (!row || typeof row !== 'object') return 'Payload invalido';

  // Em UPDATE so valida campos presentes no payload (nao bloqueia por ausencia)
  const check = (field, rule) => {
    if (isUpdate && !(field in row)) return null;
    return rule();
  };

  switch (table) {
    case 'test_plans': {
      const err = check('title', () => !isNonEmptyStr(row.title, 200) ? 'title invalido (1-200 chars)' : null);
      if (err) return err;
      const errP = check('project_id', () => !isNonEmptyStr(row.project_id, 64) ? 'project_id obrigatorio' : null);
      if (errP) return errP;
      return null;
    }
    case 'test_cases': {
      const err = check('title', () => !isNonEmptyStr(row.title, 200) ? 'title invalido (1-200 chars)' : null);
      if (err) return err;
      if ('priority' in row && row.priority && !PRIORITIES.has(row.priority)) return 'priority invalido';
      if ('type' in row && row.type && !TEST_CASE_TYPES.has(row.type)) return 'type invalido';
      return null;
    }
    case 'test_executions': {
      if ('status' in row && row.status && !EXEC_STATUSES.has(row.status)) return 'status invalido';
      return null;
    }
    case 'defects': {
      const err = check('title', () => !isNonEmptyStr(row.title, 200) ? 'title invalido (1-200 chars)' : null);
      if (err) return err;
      if ('status' in row && row.status && !DEFECT_STATUSES.has(row.status)) return 'status invalido';
      if ('severity' in row && row.severity && !PRIORITIES.has(row.severity)) return 'severity invalido';
      return null;
    }
    case 'requirements': {
      const err = check('title', () => !isNonEmptyStr(row.title, 200) ? 'title invalido (1-200 chars)' : null);
      if (err) return err;
      if ('priority' in row && row.priority && !PRIORITIES.has(row.priority)) return 'priority invalido';
      if ('status' in row && row.status && !REQ_STATUSES.has(row.status)) return 'status invalido';
      return null;
    }
    case 'notifications': {
      // Valida comprimento e formato, mas nao obriga autor (inserido pelo sistema)
      if ('title' in row && !isNonEmptyStr(row.title, 200)) return 'title invalido';
      if ('body' in row && !isStr(row.body, 0, 5000)) return 'body muito longo';
      return null;
    }
    default:
      return null; // tabelas nao cobertas: sem validacao extra
  }
}
