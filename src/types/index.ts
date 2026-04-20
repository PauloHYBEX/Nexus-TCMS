export interface User {
  uid: string;
  email?: string;
  displayName?: string;
}

export interface TestPlan {
  id: string;
  title: string;
  description: string;
  objective: string;
  scope: string;
  approach: string;
  criteria: string;
  resources: string;
  schedule: string;
  risks: string;
  status: string; // status dinâmico por projeto (antes: 'draft' | 'active' | 'review' | 'approved' | 'archived')
  project_id: string;
  created_at: Date;
  updated_at: Date;
  user_id: string;
  generated_by_ai: boolean;
  // Número sequencial opcional para exibição amigável (preenchido via migração)
  sequence?: number;
}

export interface TestCase {
  id: string;
  plan_id: string;
  title: string;
  description: string;
  preconditions: string;
  steps: TestStep[];
  expected_result: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  type: 'functional' | 'integration' | 'performance' | 'security' | 'usability';
  created_at: Date;
  updated_at: Date;
  user_id: string;
  generated_by_ai: boolean;
  // Número sequencial opcional para exibição amigável (preenchido via migração)
  sequence?: number;
}

export interface TestStep {
  id: string;
  action: string;
  expected_result: string;
  order: number;
}

export interface TestExecution {
  id: string;
  case_id: string;
  plan_id: string;
  status: 'passed' | 'failed' | 'blocked' | 'not_tested';
  actual_result: string;
  notes: string;
  executed_at: Date;
  executed_by: string;
  user_id: string;
  // Número sequencial opcional para exibição amigável (preenchido via migração)
  sequence?: number;
}

// =====================
// Fase 1: Requisitos e Defeitos
// =====================

export interface Requirement {
  id: string;
  user_id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'approved' | 'deprecated';
  created_at: Date;
  updated_at: Date;
  sequence?: number;
}

export interface Defect {
  id: string;
  user_id: string;
  project_id?: string; // incluído para compatibilidade com createDefect e filtros por projeto
  plan_id?: string | null;
  title: string;
  description: string;
  status: 'open' | 'in_analysis' | 'fixed' | 'validated' | 'closed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  case_id?: string | null;
  execution_id?: string | null;
  created_at: Date;
  updated_at: Date;
  sequence?: number;
}

export interface Theme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
  };
}

// Model Control Panel types
export interface AIModel {
  id: string;
  name: string;
  provider: 'gemini' | 'openai' | 'anthropic' | 'ollama' | 'groq' | 'openrouter' | 'other';
  description: string;
  version: string;
  capabilities: string[];
  defaultForTask?: AIModelTask;
  apiKey?: string;
  active: boolean;
  settings: Record<string, any>;
}

export type AIModelTask = 
  | 'test-plan-generation'
  | 'test-case-generation'
  | 'test-execution-generation'
  | 'bug-detection'
  | 'code-analysis'
  | 'general-completion';

export interface AIPromptTemplate {
  id: string;
  name: string;
  task: AIModelTask;
  template: string;
  description: string;
  parameters: string[];
  createdAt: Date;
  updatedAt: Date;
  active: boolean;
  // Schema de saída esperado (opcional), usado para validação/repair
  outputSchemaId?: 'plan.v1' | 'case.v1' | 'execution.v1';
}

export interface AIModelConfig {
  models: AIModel[];
  promptTemplates: AIPromptTemplate[];
  defaultModel: string;
  tasks: Record<AIModelTask, string>; // maps task to default model id
}

// =====================
// Estrutura de Projetos
// =====================

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  status: 'active' | 'paused' | 'archived' | 'completed' | 'canceled';
  color: string;
  user_id: string;
  created_at: Date;
  updated_at: Date;
}
