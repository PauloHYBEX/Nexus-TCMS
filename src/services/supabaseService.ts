import { supabase } from '@/integrations/supabase/client';
import { TestPlan, TestCase, TestExecution, TestStep, Requirement, Defect } from '@/types';

// Utilitário: registra ação no histórico do usuário (silencioso em caso de erro)
export const logActivity = async (
  action: string,
  context?: string,
  userIdOrMetadata?: string | Record<string, any>,
  maybeMetadata?: Record<string, any>
) => {
  try {
    let uid: string | undefined;
    let metadata: Record<string, any> | undefined;
    if (typeof userIdOrMetadata === 'string' || typeof userIdOrMetadata === 'undefined') {
      uid = userIdOrMetadata as string | undefined;
      metadata = maybeMetadata;
    } else {
      metadata = userIdOrMetadata as Record<string, any>;
    }
    const auth = await supabase.auth.getUser();
    if (!uid) uid = auth?.data?.user?.id as string | undefined;
    if (!uid) return;
    await supabase.from('activity_logs' as any).insert({ user_id: uid, action, context, metadata });
  } catch (e) {
    // não interrompe o fluxo principal
    console.warn('[logActivity] falha ao registrar log:', e);
  }
};

// NOVO: Flag independente para visibilidade de dados compartilhada entre usuários.
// Quando true, leituras NÃO filtram por user_id (todos veem a mesma base),
// sem interferir no sistema de permissões/roles.
const SHARED_DATA = String((import.meta as any).env?.VITE_SHARED_DATA ?? 'true') === 'true';

// Opcional: manter log de depuração e exposição no window
try {
  (window as any).__KRG_SHARED_DATA__ = SHARED_DATA;
  if (!(window as any).__KRG_SHARED_DATA_LOGGED__) {
    console.debug('[KRG] SHARED_DATA =', SHARED_DATA);
    (window as any).__KRG_SHARED_DATA_LOGGED__ = true;
  }
} catch {
  // ambiente sem window (SSR/tests)
}

// Helpers de formatação para logs
const ptStatus = (s?: string) => ({ passed: 'Aprovado', failed: 'Reprovado', blocked: 'Bloqueado', not_tested: 'Não testado' } as any)[s || ''] || String(s || '');
const truncate = (t?: string, n = 120) => (t ? (t.length > n ? t.slice(0, n - 1) + '…' : t) : '');
const labelPT = (row?: any) => row && row.sequence != null ? `PT-${String(row.sequence).padStart(3, '0')}` : `PT-${String(row?.id || '').slice(0, 4)}`;
const labelCT = (row?: any) => row && row.sequence != null ? `CT-${String(row.sequence).padStart(3, '0')}` : `CT-${String(row?.id || '').slice(0, 4)}`;
const labelEXE = (row?: any) => row && row.sequence != null ? `EXE-${String(row.sequence).padStart(3, '0')}` : `EXE-${String(row?.id || '').slice(0, 4)}`;
const labelDF = (row?: any) => row && row.sequence != null ? `DF-${String(row.sequence).padStart(3, '0')}` : `DF-${String(row?.id || '').slice(0, 4)}`;

// ===== Regras de negócio: projeto pausado (somente leitura) =====
async function ensureProjectNotPaused(projectId?: string) {
  if (!projectId) return;
  const { data, error } = await supabase.from('projects').select('status').eq('id', projectId).maybeSingle();
  if (!error && data && (data as any).status === 'paused') {
    const err = new Error('Projeto pausado — criação/alteração desabilitada.');
    (err as any).code = 'PROJECT_PAUSED';
    throw err;
  }
}

async function ensureWritableByPlanId(planId?: string) {
  if (!planId) return;
  const { data: plan } = await supabase.from('test_plans').select('project_id').eq('id', planId).maybeSingle();
  const pid = (plan as any)?.project_id as string | undefined;
  if (pid) await ensureProjectNotPaused(pid);
}
const labelREQ = (row?: any) => `REQ-${String(row?.id || '').slice(0, 4)}`;
const labelDEF = (row?: any) => `DEF-${String(row?.id || '').slice(0, 4)}`;

// Helper para aplicar (ou não) o filtro por usuário, controlado por SHARED_DATA
const withUserScope = <Q>(query: any, userId?: string) => {
  if (SHARED_DATA) return query; // base compartilhada
  if (userId) return query.eq('user_id', userId);
  return query;
};

// =====================
// Activity Logs
// =====================
export interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  context?: string | null;
  metadata?: any;
  created_at: Date;
}

export const getActivityLogs = async (
  userId: string,
  opts?: { dateStart?: Date; dateEnd?: Date }
): Promise<ActivityLog[]> => {
  let query = supabase
    .from('activity_logs')
    .select('*')
    .order('created_at', { ascending: false });

  // Se userId especificado, filtra por usuário; senão, busca todos (sistema)
  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (opts?.dateStart) {
    query = query.gte('created_at', opts.dateStart.toISOString());
  }
  if (opts?.dateEnd) {
    query = query.lte('created_at', opts.dateEnd.toISOString());
  }

  const { data, error } = await query;
  if (error) {
    console.error('Erro ao buscar activity_logs:', error);
    throw error;
  }

  // Auto-exclusão de logs antigos (>90 dias) - executa em background
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  deleteOldActivityLogs(ninetyDaysAgo).catch(() => {});

  return (data || []).map((r: any) => ({
    id: r.id,
    user_id: r.user_id,
    action: r.action,
    context: r.context ?? null,
    metadata: r.metadata ?? null,
    created_at: new Date(r.created_at)
  }));
};

// Auto-exclusão de logs antigos
const deleteOldActivityLogs = async (cutoffDate: Date): Promise<void> => {
  try {
    const { error } = await supabase
      .from('activity_logs')
      .delete()
      .lt('created_at', cutoffDate.toISOString());
    if (error) {
      console.warn('Erro ao excluir logs antigos:', error);
    }
  } catch (e) {
    console.warn('Erro ao excluir logs antigos:', e);
  }
};

// Funções para Planos de Teste
export const getTestPlans = async (userId: string, projectId?: string): Promise<TestPlan[]> => {
  let query = withUserScope(
    supabase
      .from('test_plans')
      .select('*'),
    userId
  );

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  const { data, error } = await query.order('updated_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar planos de teste:', error);
    throw error;
  }

  return data.map(plan => ({
    ...plan,
    created_at: new Date(plan.created_at),
    updated_at: new Date(plan.updated_at)
  }));
};

// Busca defeitos por projeto atual diretamente na tabela (coluna project_id)
export const getDefectsByProject = async (userId: string, projectId: string): Promise<Defect[]> => {
  const { data, error } = await withUserScope(
    supabase
      .from('defects')
      .select('*'),
    userId
  )
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('Erro ao buscar defeitos por projeto:', error);
    throw error;
  }
  return (data || []).map((d: any) => ({
    ...d,
    created_at: new Date(d.created_at),
    updated_at: new Date(d.updated_at),
    status: d.status as Defect['status'],
    severity: d.severity as Defect['severity']
  }));
};

// Versão filtrada por projeto para requisitos
export const getRequirementsByProject = async (userId: string, projectId: string): Promise<Requirement[]> => {
  const { data, error } = await withUserScope(
    supabase
      .from('requirements')
      .select('*'),
    userId
  )
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar requisitos por projeto:', error);
    throw error;
  }

  return (data || []).map((r: any) => ({
    ...r,
    created_at: new Date(r.created_at),
    updated_at: new Date(r.updated_at),
    priority: r.priority as Requirement['priority'],
    status: r.status as Requirement['status']
  }));
};

// ===== Contadores por Caso =====
export const countExecutionsByCase = async (userId: string, caseId: string): Promise<number> => {
  const { count, error } = await withUserScope(
    supabase
      .from('test_executions')
      .select('*', { count: 'exact', head: true }),
    userId
  )
    .eq('case_id', caseId);
  if (error) {
    console.error('Erro ao contar execuções por caso:', error);
    throw error;
  }
  return count || 0;
};

export const countDefectsByCase = async (userId: string, caseId: string): Promise<number> => {
  const { count, error } = await withUserScope(
    supabase
      .from('defects')
      .select('*', { count: 'exact', head: true }),
    userId
  )
    .eq('case_id', caseId);
  if (error) {
    console.error('Erro ao contar defeitos por caso:', error);
    throw error;
  }
  return count || 0;
};

export const getCaseLinkedCounts = async (
  userId: string,
  caseId: string
): Promise<{ executionCount: number; defectCount: number }> => {
  const [executionCount, defectCount] = await Promise.all([
    countExecutionsByCase(userId, caseId),
    countDefectsByCase(userId, caseId),
  ]);
  return { executionCount, defectCount };
};

// Alias para buscar planos de um projeto específico
export const getTestPlansByProject = async (userId: string, projectId: string): Promise<TestPlan[]> => {
  return getTestPlans(userId, projectId);
};

export const createTestPlan = async (plan: Omit<TestPlan, 'id' | 'created_at' | 'updated_at'>): Promise<TestPlan> => {
  // Impedir criação se o projeto estiver pausado
  try { await ensureProjectNotPaused((plan as any).project_id); } catch (e) { console.warn(e); throw e; }
  const { data, error } = await supabase
    .from('test_plans')
    .insert([plan])
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar plano de teste:', error);
    throw error;
  }

  // Log: Plano criado
  try {
    await logActivity(
      `Plano criado ${labelPT(data)}`,
      `Plano de Teste criado — Título: ${data.title || ''}`,
      undefined,
      { entity: 'plan', id: data.id }
    );
  } catch {}

  return {
    ...data,
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at)
  };
};

export const updateTestPlan = async (id: string, updates: Partial<TestPlan>): Promise<TestPlan> => {
  // Remove created_at and updated_at from updates, convert Date to string
  const { created_at, updated_at, ...cleanUpdates } = updates;
  
  const { data, error } = await supabase
    .from('test_plans')
    .update({ ...cleanUpdates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Erro ao atualizar plano de teste:', error);
    throw error;
  }

  // Log: Plano atualizado
  try {
    const fields = Object.keys(cleanUpdates).map(k => ({
      title: 'título', description: 'descrição', objective: 'objetivo', scope: 'escopo', approach: 'abordagem', criteria: 'critérios'
    } as any)[k] || k).join(', ');
    await logActivity(
      `Plano atualizado ${labelPT(data)}`,
      `Plano de Teste atualizado — Campos: ${fields}`,
      undefined,
      { entity: 'plan', id: data.id }
    );
  } catch {}

  return {
    ...data,
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at)
  };
};

export const deleteTestPlan = async (id: string) => {
  const { data: row } = await supabase.from('test_plans').select('id, sequence, title').eq('id', id).maybeSingle();
  const { error } = await supabase
    .from('test_plans')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Erro ao excluir plano de teste: ${error.message}`);
  }
  try { await logActivity(`Plano excluído ${labelPT(row)}`, `Plano de Teste excluído — Título: ${row?.title || ''}`, undefined, { entity: 'plan', id }); } catch {}
};

// Contadores de vínculos de um plano
export const countTestCasesByPlan = async (userId: string, planId: string): Promise<number> => {
  const { count, error } = await withUserScope(
    supabase
      .from('test_cases')
      .select('*', { count: 'exact', head: true }),
    userId
  )
    .eq('plan_id', planId);
  if (error) {
    console.error('Erro ao contar casos por plano:', error);
    throw error;
  }
  return count || 0;
};

export const countExecutionsByPlan = async (userId: string, planId: string): Promise<number> => {
  const { count, error } = await withUserScope(
    supabase
      .from('test_executions')
      .select('*', { count: 'exact', head: true }),
    userId
  )
    .eq('plan_id', planId);
  if (error) {
    console.error('Erro ao contar execuções por plano:', error);
    throw error;
  }
  return count || 0;
};

export const getPlanLinkedCounts = async (
  userId: string,
  planId: string
): Promise<{ testCaseCount: number; executionCount: number }> => {
  const [testCaseCount, executionCount] = await Promise.all([
    countTestCasesByPlan(userId, planId),
    countExecutionsByPlan(userId, planId),
  ]);
  return { testCaseCount, executionCount };
};

// Detalhes completos dos vínculos de um plano (para modal de exclusão)
export const getPlanLinkedDetails = async (
  userId: string,
  planId: string
): Promise<{
  testCaseCount: number;
  executionCount: number;
  defectCount: number;
  testCases: Array<{ id: string; title: string; sequence?: number }>;
  executions: Array<{ id: string; status: string; sequence?: number }>;
  defects: Array<{ id: string; title: string; status: string; severity?: string }>;
}> => {
  // Buscar casos de teste vinculados
  const { data: casesData, error: casesError } = await withUserScope(
    supabase.from('test_cases').select('id, title, sequence'),
    userId
  ).eq('plan_id', planId).limit(5);

  // Buscar execuções vinculadas
  const { data: execsData, error: execsError } = await withUserScope(
    supabase.from('test_executions').select('id, status, sequence'),
    userId
  ).eq('plan_id', planId).limit(5);

  // Buscar defeitos vinculados (via plan_id ou via casos do plano)
  const { data: defectsData, error: defectsError } = await withUserScope(
    supabase.from('defects').select('id, title, status, severity, plan_id, case_id'),
    userId
  ).eq('plan_id', planId).limit(5);

  const testCases = (casesData || []).map((c: any) => ({
    id: c.id,
    title: c.title,
    sequence: c.sequence
  }));

  const executions = (execsData || []).map((e: any) => ({
    id: e.id,
    status: e.status,
    sequence: e.sequence
  }));

  const defects = (defectsData || []).map((d: any) => ({
    id: d.id,
    title: d.title,
    status: d.status,
    severity: d.severity
  }));

  // Contagens totais (podem ser mais que o limit)
  const [testCaseCount, executionCount, defectCount] = await Promise.all([
    countTestCasesByPlan(userId, planId),
    countExecutionsByPlan(userId, planId),
    (async () => {
      const { count } = await withUserScope(
        supabase.from('defects').select('*', { count: 'exact', head: true }),
        userId
      ).eq('plan_id', planId);
      return count || 0;
    })()
  ]);

  return {
    testCaseCount,
    executionCount,
    defectCount,
    testCases,
    executions,
    defects
  };
};

// Funções para Casos de Teste
export const getTestCases = async (userId: string, planId?: string): Promise<TestCase[]> => {
  let query = withUserScope(
    supabase
      .from('test_cases')
      .select('*'),
    userId
  );

  if (planId) {
    query = query.eq('plan_id', planId);
  }

  const { data, error } = await query.order('updated_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar casos de teste:', error);
    throw error;
  }

  return data.map(testCase => ({
    ...testCase,
    steps: Array.isArray(testCase.steps) ? (testCase.steps as unknown as TestStep[]) : [],
    priority: testCase.priority as 'low' | 'medium' | 'high' | 'critical',
    type: testCase.type as 'functional' | 'integration' | 'performance' | 'security' | 'usability',
    created_at: new Date(testCase.created_at),
    updated_at: new Date(testCase.updated_at)
  }));
};

// Busca casos de teste por projeto atual via planos associados
export const getTestCasesByProject = async (userId: string, projectId: string): Promise<TestCase[]> => {
  // 1) Buscar IDs de planos do usuário no projeto
  const { data: plans, error: planErr } = await withUserScope(
    supabase
      .from('test_plans')
      .select('id'),
    userId
  )
    .eq('project_id', projectId);

  if (planErr) {
    console.error('Erro ao buscar planos para o projeto em getTestCasesByProject:', planErr);
    throw planErr;
  }

  const planIds = (plans || []).map(p => p.id);
  if (planIds.length === 0) return [];

  // 2) Buscar casos vinculados a esses planos
  const { data, error } = await withUserScope(
    supabase
      .from('test_cases')
      .select('*'),
    userId
  )
    .in('plan_id', planIds)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar casos de teste por projeto:', error);
    throw error;
  }

  return (data || []).map((testCase: any) => ({
    ...testCase,
    steps: Array.isArray(testCase.steps) ? (testCase.steps as unknown as TestStep[]) : [],
    priority: testCase.priority as 'low' | 'medium' | 'high' | 'critical',
    type: testCase.type as 'functional' | 'integration' | 'performance' | 'security' | 'usability',
    created_at: new Date(testCase.created_at),
    updated_at: new Date(testCase.updated_at)
  }));
};

// Busca planos por uma lista de IDs
export const getTestPlansByIds = async (userId: string, ids: string[]): Promise<TestPlan[]> => {
  if (!ids || ids.length === 0) return [];
  const { data, error } = await withUserScope(
    supabase
      .from('test_plans')
      .select('*'),
    userId
  )
    .in('id', ids);
  if (error) {
    console.error('Erro ao buscar planos por IDs:', error);
    throw error;
  }
  return (data || []).map((plan: any) => ({
    ...plan,
    created_at: new Date(plan.created_at),
    updated_at: new Date(plan.updated_at)
  }));
};

// Busca casos por uma lista de IDs
export const getTestCasesByIds = async (userId: string, ids: string[]): Promise<TestCase[]> => {
  if (!ids || ids.length === 0) return [];
  const { data, error } = await withUserScope(
    supabase
      .from('test_cases')
      .select('*'),
    userId
  )
    .in('id', ids);
  if (error) {
    console.error('Erro ao buscar casos por IDs:', error);
    throw error;
  }
  return (data || []).map((testCase: any) => ({
    ...testCase,
    steps: Array.isArray(testCase.steps) ? (testCase.steps as unknown as TestStep[]) : [],
    priority: testCase.priority as 'low' | 'medium' | 'high' | 'critical',
    type: testCase.type as 'functional' | 'integration' | 'performance' | 'security' | 'usability',
    created_at: new Date(testCase.created_at),
    updated_at: new Date(testCase.updated_at)
  }));
};

export const createTestCase = async (testCase: Omit<TestCase, 'id' | 'created_at' | 'updated_at'>): Promise<TestCase> => {
  // Ensure user_id is present (fallback to current authenticated user)
  const payload: any = {
    ...testCase,
    steps: Array.isArray(testCase.steps) ? (testCase.steps as any) : [] // Convert TestStep[] to Json and default to []
  };

  // Normalize empty UUIDs to null
  if (payload.plan_id === '' || typeof payload.plan_id === 'undefined') {
    payload.plan_id = null;
  }

  if (!payload.user_id) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      console.error('Erro ao obter usuário autenticado para criar caso de teste:', authError);
      throw new Error('Não foi possível obter usuário autenticado para criar caso de teste.');
    }
    payload.user_id = authData.user.id;
  }

  const { data, error } = await supabase
    .from('test_cases')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar caso de teste:', error);
    throw error;
  }

  // Log: Caso criado
  try {
    await logActivity(`Caso criado ${labelCT(data)}`, `Caso de Teste criado — Título: ${data.title || ''}`, undefined, { entity: 'case', id: data.id });
  } catch {}

  return {
    ...data,
    steps: Array.isArray(data.steps) ? (data.steps as unknown as TestStep[]) : [],
    priority: data.priority as 'low' | 'medium' | 'high' | 'critical',
    type: data.type as 'functional' | 'integration' | 'performance' | 'security' | 'usability',
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at)
  };
};

export const updateTestCase = async (id: string, updates: Partial<TestCase>): Promise<TestCase> => {
  // Remove created_at and updated_at from updates, convert Date to string and TestStep[] to Json
  const { created_at, updated_at, steps, ...cleanUpdates } = updates;
  
  const updateData: any = {
    ...cleanUpdates,
    updated_at: new Date().toISOString()
  };

  if (steps) {
    updateData.steps = steps; // Convert TestStep[] to Json
  }

  // Normalize empty UUIDs to null when updating
  if ('plan_id' in cleanUpdates) {
    const p: any = (cleanUpdates as any).plan_id;
    updateData.plan_id = p && String(p).trim() !== '' ? p : null;
  }

  const { data, error } = await supabase
    .from('test_cases')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Erro ao atualizar caso de teste:', error);
    throw error;
  }

  // Log: Caso atualizado
  try {
    const fields = Object.keys(updateData).filter(k => k !== 'updated_at').map(k => ({
      title: 'título', description: 'descrição', priority: 'prioridade', type: 'tipo', steps: 'passos'
    } as any)[k] || k).join(', ');
    await logActivity(`Caso atualizado ${labelCT(data)}`, `Caso de Teste atualizado — Campos: ${fields}`, undefined, { entity: 'case', id: data.id });
  } catch {}

  return {
    ...data,
    steps: Array.isArray(data.steps) ? (data.steps as unknown as TestStep[]) : [],
    priority: data.priority as 'low' | 'medium' | 'high' | 'critical',
    type: data.type as 'functional' | 'integration' | 'performance' | 'security' | 'usability',
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at)
  };
};

export const deleteTestCase = async (id: string) => {
  const { data: row } = await supabase.from('test_cases').select('id, sequence, title').eq('id', id).maybeSingle();
  const { error } = await supabase
    .from('test_cases')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Erro ao excluir caso de teste: ${error.message}`);
  }
  try { await logActivity(`Caso excluído ${labelCT(row)}`, `Caso de Teste excluído — Título: ${row?.title || ''}`, undefined, { entity: 'case', id }); } catch {}
};

// Funções para Execuções de Teste
export const getTestExecutions = async (userId: string, planId?: string, caseId?: string): Promise<TestExecution[]> => {
  let query = withUserScope(
    supabase
      .from('test_executions')
      .select('*'),
    userId
  );

  if (planId) {
    query = query.eq('plan_id', planId);
  }

  if (caseId) {
    query = query.eq('case_id', caseId);
  }

  const { data, error } = await query.order('executed_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar execuções de teste:', error);
    throw error;
  }

  return data.map(execution => ({
    ...execution,
    status: execution.status as 'passed' | 'failed' | 'blocked' | 'not_tested',
    executed_at: new Date(execution.executed_at)
  }));
};

// Busca execuções por projeto atual via planos associados
export const getTestExecutionsByProject = async (userId: string, projectId: string): Promise<TestExecution[]> => {
  // 1) Buscar IDs de planos do usuário no projeto
  const { data: plans, error: planErr } = await withUserScope(
    supabase
      .from('test_plans')
      .select('id'),
    userId
  )
    .eq('project_id', projectId);

  if (planErr) {
    console.error('Erro ao buscar planos para o projeto em getTestExecutionsByProject:', planErr);
    throw planErr;
  }

  const planIds = (plans || []).map(p => p.id);
  if (planIds.length === 0) return [];

  // 2) Buscar execuções vinculadas a esses planos
  const { data, error } = await withUserScope(
    supabase
      .from('test_executions')
      .select('*'),
    userId
  )
    .in('plan_id', planIds)
    .order('executed_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar execuções por projeto:', error);
    throw error;
  }

  return (data || []).map((execution: any) => ({
    ...execution,
    status: execution.status as 'passed' | 'failed' | 'blocked' | 'not_tested',
    executed_at: new Date(execution.executed_at)
  }));
};

export const createTestExecution = async (execution: Omit<TestExecution, 'id' | 'executed_at'>): Promise<TestExecution> => {
  // Impedir criação se o projeto do plano estiver pausado
  try { await ensureWritableByPlanId(execution.plan_id); } catch (e) { console.warn(e); throw e; }
  const { data, error } = await supabase
    .from('test_executions')
    .insert([{ ...execution, executed_at: new Date().toISOString() }])
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar execução de teste:', error);
    throw error;
  }

  // Log de criação da execução (amigável)
  try {
    const context = `Execução de Teste criada — Status: ${ptStatus(data.status)}${data.actual_result ? `; Resultado: ${truncate(data.actual_result, 80)}` : ''}`;
    await logActivity(`Execução criada ${labelEXE(data)}`, context, undefined, { entity: 'execution', id: data.id });
  } catch {}

  return {
    ...data,
    status: data.status as 'passed' | 'failed' | 'blocked' | 'not_tested',
    executed_at: new Date(data.executed_at)
  };
};

export const updateTestExecution = async (id: string, updates: Partial<TestExecution>): Promise<TestExecution> => {
  // Remove executed_at from updates, convert Date to string
  const { executed_at, ...cleanUpdates } = updates;
  
  // 1) Atualiza sem pedir representação para evitar 406 quando RLS bloqueia SELECT
  const { error } = await supabase
    .from('test_executions')
    .update(cleanUpdates)
    .eq('id', id);

  if (error) {
    console.error('Erro ao atualizar execução de teste:', error);
    throw error;
  }

  // 2) Tenta buscar a linha atualizada; se RLS impedir, devolve um fallback mesclado
  try {
    const { data: row, error: selErr } = await supabase
      .from('test_executions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (!selErr && row) {
      // Log de atualização com rótulo
      try {
        const fields = Object.keys(cleanUpdates).map(k => ({ status: 'status', actual_result: 'resultado', notes: 'observações', executed_by: 'executado por' } as any)[k] || k).join(', ');
        const extras = cleanUpdates.status ? ` — Novo status: ${ptStatus(cleanUpdates.status as any)}` : '';
        const snippet = cleanUpdates.actual_result ? `; Resultado: ${truncate(String(cleanUpdates.actual_result), 80)}` : '';
        const context = `Execução de Teste atualizada — Campos: ${fields}${extras}${snippet}`;
        await logActivity(`Execução atualizada ${labelEXE(row)}`, context, undefined, { entity: 'execution', id: row.id });
      } catch {}
      return {
        ...row,
        status: row.status as 'passed' | 'failed' | 'blocked' | 'not_tested',
        executed_at: new Date(row.executed_at)
      };
    }
  } catch (e) {
    // ignore e continuar com fallback
  }

  // Fallback: retorna objeto parcial mesclado (melhora UX mesmo com RLS restritiva)
  try {
    const fields = Object.keys(cleanUpdates).map(k => ({ status: 'status', actual_result: 'resultado', notes: 'observações', executed_by: 'executado por' } as any)[k] || k).join(', ');
    const extras = cleanUpdates.status ? ` — Novo status: ${ptStatus(cleanUpdates.status as any)}` : '';
    const snippet = cleanUpdates.actual_result ? `; Resultado: ${truncate(String(cleanUpdates.actual_result), 80)}` : '';
    const context = `Execução de Teste atualizada — Campos: ${fields}${extras}${snippet}`;
    await logActivity(`Execução atualizada ${labelEXE({ id })}`, context, undefined, { entity: 'execution', id });
  } catch {}
  return {
    id: id,
    ...(cleanUpdates as any),
    status: (cleanUpdates.status as any) || 'not_tested',
    executed_at: new Date()
  } as unknown as TestExecution;
};

export const deleteTestExecution = async (id: string) => {
  const { data: row } = await supabase.from('test_executions').select('id, sequence, status, executed_at').eq('id', id).maybeSingle();
  const { error } = await supabase
    .from('test_executions')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Erro ao excluir execução de teste: ${error.message}`);
  }
  try {
    await logActivity(`Execução excluída ${labelEXE(row)}`, `Execução removida — Status: ${row?.status ? ptStatus(row?.status) : ''}`, undefined, { entity: 'execution', id });
  } catch {}
};

// =====================
// Fase 1: Requisitos
// =====================

export const getRequirements = async (userId: string): Promise<Requirement[]> => {
  const { data, error } = await withUserScope(
    supabase
      .from('requirements')
      .select('*'),
    userId
  )
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar requisitos:', error);
    throw error;
  }

  return (data || []).map((r: any) => ({
    ...r,
    created_at: new Date(r.created_at),
    updated_at: new Date(r.updated_at),
    priority: r.priority as Requirement['priority'],
    status: r.status as Requirement['status'],
  }));
};

// Criar requisito
export const createRequirement = async (req: Omit<Requirement, 'id' | 'created_at' | 'updated_at'>): Promise<Requirement> => {
  const { data, error } = await supabase
    .from('requirements')
    .insert([req])
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar requisito:', error);
    throw error;
  }

  // Log: Requisito criado
  try {
    await logActivity(`Requisito criado ${labelREQ(data)}`, `Requisito criado — Título: ${data.title || ''}`, undefined, { entity: 'requirement', id: data.id });
  } catch {}

  return {
    ...data,
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at),
    priority: data.priority as Requirement['priority'],
    status: data.status as Requirement['status']
  } as Requirement;
};

export const updateRequirement = async (id: string, updates: Partial<Requirement>): Promise<Requirement> => {
  const { created_at, updated_at, ...clean } = updates;
  const { data, error } = await supabase
    .from('requirements')
    .update({ ...clean, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Erro ao atualizar requisito:', error);
    throw error;
  }

  // Log: Requisito atualizado
  try {
    const fields = Object.keys(clean).map(k => ({ title: 'título', description: 'descrição', priority: 'prioridade', status: 'status' } as any)[k] || k).join(', ');
    await logActivity(`Requisito atualizado ${labelREQ(data)}`, `Requisito atualizado — Campos: ${fields}`, undefined, { entity: 'requirement', id: data.id });
  } catch {}

  return {
    ...data,
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at),
    priority: data.priority as Requirement['priority'],
    status: data.status as Requirement['status']
  } as Requirement;
};

export const deleteRequirement = async (id: string) => {
  const { data: row } = await supabase.from('requirements').select('id, title').eq('id', id).maybeSingle();
  const { error } = await supabase
    .from('requirements')
    .delete()
    .eq('id', id);
  if (error) {
    throw new Error(`Erro ao excluir requisito: ${error.message}`);
  }
  try { await logActivity(`Requisito excluído ${labelREQ(row)}`, `Requisito excluído — Título: ${row?.title || ''}`, undefined, { entity: 'requirement', id }); } catch {}
};

// Vínculos requisito ↔ caso
export const linkRequirementToCase = async (requirementId: string, caseId: string, userId: string) => {
  const { error } = await supabase
    .from('requirements_cases')
    .insert([{ requirement_id: requirementId, case_id: caseId, user_id: userId }]);
  if (error) {
    throw new Error(`Erro ao vincular requisito ao caso: ${error.message}`);
  }
};

export const unlinkRequirementFromCase = async (requirementId: string, caseId: string) => {
  const { error } = await supabase
    .from('requirements_cases')
    .delete()
    .match({ requirement_id: requirementId, case_id: caseId });
  if (error) {
    throw new Error(`Erro ao desvincular requisito do caso: ${error.message}`);
  }
};

export const getRequirementsByCase = async (userId: string, caseId: string): Promise<Requirement[]> => {
  // Estratégia em duas etapas para evitar dependência de embeddeds
  const { data: links, error: linkErr } = await withUserScope(
    supabase
      .from('requirements_cases')
      .select('requirement_id'),
    userId
  )
    .eq('case_id', caseId);
  if (linkErr) {
    console.error('Erro ao buscar vínculos requisito↔caso:', linkErr);
    throw linkErr;
  }
  const ids = (links || []).map(l => l.requirement_id);
  if (ids.length === 0) return [];
  const { data, error } = await withUserScope(
    supabase
      .from('requirements')
      .select('*'),
    userId
  )
    .in('id', ids);
  if (error) {
    console.error('Erro ao buscar requisitos por IDs:', error);
    throw error;
  }
  return (data || []).map((r: any) => ({
    ...r,
    created_at: new Date(r.created_at),
    updated_at: new Date(r.updated_at),
    priority: r.priority as Requirement['priority'],
    status: r.status as Requirement['status']
  }));
};

export const getCasesByRequirement = async (userId: string, requirementId: string): Promise<TestCase[]> => {
  const { data: links, error: linkErr } = await withUserScope(
    supabase
      .from('requirements_cases')
      .select('case_id'),
    userId
  )
    .eq('requirement_id', requirementId);
  if (linkErr) {
    console.error('Erro ao buscar vínculos requisito↔caso:', linkErr);
    throw linkErr;
  }
  const ids = (links || []).map(l => l.case_id);
  if (ids.length === 0) return [];
  const { data, error } = await withUserScope(
    supabase
      .from('test_cases')
      .select('*'),
    userId
  )
    .in('id', ids);
  if (error) {
    console.error('Erro ao buscar casos por IDs:', error);
    throw error;
  }
  return (data || []).map((testCase: any) => ({
    ...testCase,
    steps: Array.isArray(testCase.steps) ? (testCase.steps as unknown as TestStep[]) : [],
    priority: testCase.priority as 'low' | 'medium' | 'high' | 'critical',
    type: testCase.type as 'functional' | 'integration' | 'performance' | 'security' | 'usability',
    created_at: new Date(testCase.created_at),
    updated_at: new Date(testCase.updated_at)
  }));
};

// =====================
// Fase 1: Defeitos
// =====================

export const getDefects = async (userId: string, caseId?: string, executionId?: string): Promise<Defect[]> => {
  let query = withUserScope(
    supabase
      .from('defects')
      .select('*'),
    userId
  );
  if (caseId) query = query.eq('case_id', caseId);
  if (executionId) query = query.eq('execution_id', executionId);
  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) {
    console.error('Erro ao buscar defeitos:', error);
    throw error;
  }
  return (data || []).map((d: any) => ({
    ...d,
    created_at: new Date(d.created_at),
    updated_at: new Date(d.updated_at),
    status: d.status as Defect['status'],
    severity: d.severity as Defect['severity']
  }));
};

export const createDefect = async (defect: Omit<Defect, 'id' | 'created_at' | 'updated_at'>): Promise<Defect> => {
  // Normaliza payload e garante user_id / project_id quando possível
  const payload: any = { ...defect };

  // Garante user_id
  if (!payload.user_id) {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      console.error('Erro ao obter usuário autenticado para criar defeito:', authErr);
      throw new Error('Não foi possível obter usuário autenticado para criar defeito.');
    }
    payload.user_id = authData.user.id;
  }

  // Deriva project_id quando ausente a partir de case_id/execution_id
  if (!payload.project_id) {
    try {
      let planId: string | null = null;
      if (payload.case_id) {
        const { data: caseData, error: caseErr } = await supabase
          .from('test_cases')
          .select('plan_id')
          .eq('id', payload.case_id)
          .single();
        if (!caseErr && caseData?.plan_id) {
          planId = caseData.plan_id;
        }
      }
      if (!planId && payload.execution_id) {
        const { data: execData, error: execErr } = await supabase
          .from('test_executions')
          .select('plan_id')
          .eq('id', payload.execution_id)
          .single();
        if (!execErr && execData?.plan_id) {
          planId = execData.plan_id;
        }
      }
      if (planId) {
        const { data: planData, error: planErr } = await supabase
          .from('test_plans')
          .select('project_id')
          .eq('id', planId)
          .single();
        if (!planErr && planData?.project_id) {
          payload.project_id = planData.project_id;
        }
      }
    } catch (e) {
      console.warn('Não foi possível derivar project_id para o defeito. Prosseguindo sem definir.', e);
    }
  }

  const { data, error } = await supabase
    .from('defects')
    .insert([payload])
    .select()
    .single();
  if (error) {
    console.error('Erro ao criar defeito:', error);
    throw error;
  }

  // Log: Defeito criado
  try {
    const st = (data.status as string) || '';
    const sv = (data.severity as string) || '';
    await logActivity(`Defeito criado ${labelDF(data)}`, `Defeito criado — Status: ${st}; Severidade: ${sv}${data.title ? `; Título: ${data.title}` : ''}`);
  } catch {}

  return {
    ...data,
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at),
    status: data.status as Defect['status'],
    severity: data.severity as Defect['severity']
  } as Defect;
};

export const updateDefect = async (id: string, updates: Partial<Defect>): Promise<Defect> => {
  const { created_at, updated_at, ...clean } = updates;
  const { data, error } = await supabase
    .from('defects')
    .update({ ...clean, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Erro ao atualizar defeito:', error);
    throw error;
  }

  // Log: Defeito atualizado
  try {
    const fields = Object.keys(clean).map(k => ({ title: 'título', description: 'descrição', status: 'status', severity: 'severidade' } as any)[k] || k).join(', ');
    const extra = (clean as any).status ? ` — Novo status: ${(clean as any).status}` : '';
    await logActivity(`Defeito atualizado ${labelDEF(data)}`, `Defeito atualizado — Campos: ${fields}${extra}`);
  } catch {}

  return {
    ...data,
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at),
    status: data.status as Defect['status'],
    severity: data.severity as Defect['severity']
  } as Defect;
};

export const deleteDefect = async (id: string) => {
  const { data: row } = await supabase.from('defects').select('id, title, status').eq('id', id).maybeSingle();
  const { error } = await supabase
    .from('defects')
    .delete()
    .eq('id', id);
  if (error) {
    throw new Error(`Erro ao excluir defeito: ${error.message}`);
  }
  try { await logActivity(`Defeito excluído ${labelDEF(row)}`, `Defeito excluído — Título: ${row?.title || ''}`); } catch {}
};
