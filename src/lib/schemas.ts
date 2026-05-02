// Schemas Zod para validacao de entidades no frontend (forms) e uso compartilhado.
// Servidor valida separadamente em server/lib/validation.js com regras equivalentes.

import { z } from 'zod';

// Helpers
const nonEmpty = (field: string, max = 500) =>
  z.string().trim().min(1, `${field} obrigatorio`).max(max, `${field} muito longo (max ${max})`);

const optStr = (max = 5000) =>
  z.string().trim().max(max, `Campo muito longo (max ${max})`).optional().default('');

const uuid = z.string().uuid('UUID invalido');
const uuidOrNull = z.union([uuid, z.null()]);

// ─── Enums ─────────────────────────────────────────────────────────────────
export const PriorityEnum = z.enum(['low', 'medium', 'high', 'critical']);
export const TestCaseTypeEnum = z.enum(['functional', 'integration', 'performance', 'security', 'usability']);
export const ExecutionStatusEnum = z.enum(['passed', 'failed', 'blocked', 'not_tested']);
export const DefectStatusEnum = z.enum(['open', 'in_analysis', 'fixed', 'validated', 'closed']);
export const DefectSeverityEnum = PriorityEnum;
export const RequirementStatusEnum = z.enum(['open', 'in_progress', 'approved', 'deprecated']);

// ─── TestPlan ──────────────────────────────────────────────────────────────
export const TestPlanInputSchema = z.object({
  title: nonEmpty('Titulo', 200),
  description: optStr(),
  objective: optStr(),
  scope: optStr(),
  approach: optStr(),
  criteria: optStr(),
  resources: optStr(),
  schedule: optStr(),
  risks: optStr(),
  status: z.string().trim().min(1).max(50),
  project_id: uuid,
  generated_by_ai: z.boolean().optional().default(false),
  branches: optStr(200),
});
export type TestPlanInput = z.infer<typeof TestPlanInputSchema>;

// ─── TestStep ──────────────────────────────────────────────────────────────
export const TestStepSchema = z.object({
  id: z.string(),
  action: nonEmpty('Acao', 1000),
  expected_result: optStr(1000),
  order: z.number().int().nonnegative(),
});

// ─── TestCase ──────────────────────────────────────────────────────────────
export const TestCaseInputSchema = z.object({
  plan_id: uuid,
  title: nonEmpty('Titulo', 200),
  description: optStr(),
  preconditions: optStr(),
  steps: z.array(TestStepSchema).max(100, 'Maximo 100 passos'),
  expected_result: optStr(),
  priority: PriorityEnum,
  type: TestCaseTypeEnum,
  generated_by_ai: z.boolean().optional().default(false),
  branches: optStr(200),
});
export type TestCaseInput = z.infer<typeof TestCaseInputSchema>;

// ─── TestExecution ─────────────────────────────────────────────────────────
export const TestExecutionInputSchema = z.object({
  case_id: uuid,
  plan_id: uuid,
  status: ExecutionStatusEnum,
  actual_result: optStr(),
  notes: optStr(),
  executed_by: optStr(200),
});
export type TestExecutionInput = z.infer<typeof TestExecutionInputSchema>;

// ─── Defect ────────────────────────────────────────────────────────────────
export const DefectInputSchema = z.object({
  project_id: uuid,
  title: nonEmpty('Titulo', 200),
  description: optStr(),
  status: DefectStatusEnum,
  severity: DefectSeverityEnum,
  case_id: uuidOrNull.optional(),
  execution_id: uuidOrNull.optional(),
  plan_id: uuidOrNull.optional(),
  assigned_to: uuidOrNull.optional(),
});
export type DefectInput = z.infer<typeof DefectInputSchema>;

// ─── Requirement ───────────────────────────────────────────────────────────
export const RequirementInputSchema = z.object({
  title: nonEmpty('Titulo', 200),
  description: optStr(),
  priority: PriorityEnum,
  status: RequirementStatusEnum,
});
export type RequirementInput = z.infer<typeof RequirementInputSchema>;

// ─── Transicoes de estado (state machine) ──────────────────────────────────
// Define quais transicoes de status sao permitidas para cada entidade.
// Retorna true se a transicao e valida.

const DEFECT_TRANSITIONS: Record<string, string[]> = {
  open: ['in_analysis', 'fixed', 'closed'],
  in_analysis: ['open', 'fixed', 'closed'],
  fixed: ['validated', 'in_analysis', 'open'], // reaberto volta para open
  validated: ['closed', 'open'],
  closed: ['open'], // reabertura explicita
};

const REQUIREMENT_TRANSITIONS: Record<string, string[]> = {
  open: ['in_progress', 'deprecated'],
  in_progress: ['approved', 'open', 'deprecated'],
  approved: ['deprecated', 'in_progress'],
  deprecated: ['open'],
};

export function canTransitionDefect(from: string, to: string): boolean {
  if (from === to) return true;
  return (DEFECT_TRANSITIONS[from] || []).includes(to);
}

export function canTransitionRequirement(from: string, to: string): boolean {
  if (from === to) return true;
  return (REQUIREMENT_TRANSITIONS[from] || []).includes(to);
}

// Helper generico para extrair primeiro erro de um ZodError em formato amigavel
export function formatZodError(err: z.ZodError): string {
  const first = err.issues?.[0];
  if (!first) return 'Dados invalidos';
  const path = first.path?.join('.') || 'campo';
  return `${path}: ${first.message}`;
}
