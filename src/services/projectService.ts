import { supabase } from '@/integrations/supabase/client';
import { Project } from '@/types';

// Criar projeto
export const createProject = async (projectData: {
  name: string;
  slug: string;
  description?: string;
  color?: string;
  user_id: string;
}): Promise<Project> => {
  const { data, error } = await supabase
    .from('projects')
    .insert([{
      ...projectData,
      color: projectData.color || '#3b82f6'
    }])
    .select()
    .single();

  if (error) throw error;
  
  return {
    ...data,
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at)
  };
};

// Listar projetos do usuário
export const getProjects = async (): Promise<Project[]> => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data.map(project => ({
    ...project,
    created_at: new Date(project.created_at),
    updated_at: new Date(project.updated_at)
  }));
};

// Buscar projetos arquivados e concluídos (e opcionalmente cancelados, se existir no schema)
export const getArchivedOrCompletedProjects = async (): Promise<Project[]> => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .in('status', ['archived', 'canceled'])
    .order('name', { ascending: true });

  if (error) throw error;

  return (data || []).map(project => ({
    ...project,
    created_at: new Date(project.created_at),
    updated_at: new Date(project.updated_at)
  }));
};

// Buscar projeto por ID
export const getProjectById = async (id: string): Promise<Project | null> => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  if (!data) return null;

  return {
    ...data,
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at)
  };
};

// Atualizar projeto
export const updateProject = async (id: string, updates: Partial<{
  name: string;
  slug: string;
  description: string;
  status: 'active' | 'paused' | 'archived' | 'completed' | 'canceled';
  color: string;
}>): Promise<Project> => {
  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  return {
    ...data,
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at)
  };
};

// Excluir projeto
export const deleteProject = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);

  if (error) throw error;
};

// Exclusão em cascata de um projeto e todos os seus dados relacionados
export const deleteProjectCascade = async (projectId: string): Promise<void> => {
  // 1) Buscar IDs de planos do projeto
  const { data: plans, error: plansErr } = await supabase
    .from('test_plans')
    .select('id')
    .eq('project_id', projectId);
  if (plansErr) throw plansErr;
  const planIds = (plans || []).map(p => p.id);

  // 2) Buscar IDs de casos vinculados aos planos
  let caseIds: string[] = [];
  if (planIds.length) {
    const { data: cases, error: casesErr } = await supabase
      .from('test_cases')
      .select('id')
      .in('plan_id', planIds);
    if (casesErr) throw casesErr;
    caseIds = (cases || []).map(c => c.id);
  }

  // 3) Buscar IDs de execuções vinculadas aos planos (e implicitamente aos casos)
  let executionIds: string[] = [];
  if (planIds.length) {
    const { data: execs, error: execErr } = await supabase
      .from('test_executions')
      .select('id')
      .in('plan_id', planIds);
    if (execErr) throw execErr;
    executionIds = (execs || []).map(e => e.id);
  }

  // IMPORTANTE: Deletar na ordem correta para não violar FKs
  // 4) Defeitos ligados a execuções/casos OU diretamente ao projeto
  try {
    if (executionIds.length) {
      await supabase.from('defects').delete().in('execution_id', executionIds);
    }
  } catch {}
  try {
    if (caseIds.length) {
      await supabase.from('defects').delete().in('case_id', caseIds);
    }
  } catch {}
  try {
    await supabase.from('defects').delete().eq('project_id', projectId);
  } catch {}

  // 5) Requisitos do projeto e vínculos requisito↔caso
  // 5.1) Buscar IDs de requisitos do projeto
  let requirementIds: string[] = [];
  try {
    const { data: reqs, error: reqErr } = await supabase
      .from('requirements')
      .select('id')
      .eq('project_id', projectId);
    if (reqErr) throw reqErr;
    requirementIds = (reqs || []).map(r => r.id);
  } catch {}

  // 5.2) Excluir vínculos por case_id (já filtrado acima) e também por requirement_id
  try {
    if (caseIds.length) {
      await supabase.from('requirements_cases').delete().in('case_id', caseIds);
    }
  } catch {}
  try {
    if (requirementIds.length) {
      await supabase.from('requirements_cases').delete().in('requirement_id', requirementIds);
    }
  } catch {}

  // 5.3) Excluir requisitos do projeto
  try {
    await supabase.from('requirements').delete().eq('project_id', projectId);
  } catch {}

  // 6) Execuções
  try {
    if (executionIds.length) {
      await supabase.from('test_executions').delete().in('id', executionIds);
    }
  } catch {}

  // 7) Casos
  try {
    if (caseIds.length) {
      await supabase.from('test_cases').delete().in('id', caseIds);
    }
  } catch {}

  // 8) Planos
  try {
    if (planIds.length) {
      await supabase.from('test_plans').delete().in('id', planIds);
    }
  } catch {}

  // 9) Projeto
  const { error: projErr } = await supabase.from('projects').delete().eq('id', projectId);
  if (projErr) throw projErr;
};

// Buscar projetos ativos
export const getActiveProjects = async (): Promise<Project[]> => {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .in('status', ['active', 'paused'])
    .order('name', { ascending: true });

  if (error) throw error;

  return data.map(project => ({
    ...project,
    created_at: new Date(project.created_at),
    updated_at: new Date(project.updated_at)
  }));
};

// Gerar slug a partir do nome
export const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove caracteres especiais
    .replace(/[\s_-]+/g, '-') // Substitui espaços e underscores por hífens
    .replace(/^-+|-+$/g, ''); // Remove hífens do início e fim
};

// Verificar se slug já existe
export const checkSlugExists = async (slug: string, excludeId?: string): Promise<boolean> => {
  let query = supabase
    .from('projects')
    .select('id')
    .eq('slug', slug);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data.length > 0;
};
