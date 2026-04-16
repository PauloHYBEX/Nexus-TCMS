import { z } from 'zod';

// Converte qualquer valor recebido da IA para string legível
const toStr = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) {
    return v.map(item =>
      typeof item === 'object' && item !== null
        ? Object.values(item as Record<string, unknown>).filter(x => typeof x === 'string').join(' ')
        : String(item ?? '')
    ).join('\n');
  }
  if (typeof v === 'object') {
    return Object.values(v as Record<string, unknown>)
      .map(x => (typeof x === 'string' ? x : Array.isArray(x) ? x.join(' ') : String(x ?? '')))
      .filter(Boolean)
      .join('\n');
  }
  return String(v);
};

// Schema: Test Plan V1 (shape alinhado ao DB/TestPlan)
export const TestPlanV1 = z.object({
  schemaVersion: z.literal('plan.v1'),
  title: z.preprocess(toStr, z.string().min(1)),
  description: z.preprocess(toStr, z.string().min(1)),
  objective: z.preprocess(toStr, z.string().min(1)),
  scope: z.preprocess(toStr, z.string().min(1)),
  approach: z.preprocess(toStr, z.string().min(1)),
  criteria: z.preprocess(toStr, z.string().min(1)),
  resources: z.preprocess(toStr, z.string().min(1)),
  schedule: z.preprocess(toStr, z.string().min(1)),
  risks: z.preprocess(toStr, z.string().min(1)),
  sequence: z.number().int().positive().optional(),
  metadata: z.object({
    sourceDocId: z.string().optional(),
    modelId: z.string().optional(),
    createdAt: z.string().optional(),
  }).default({}),
});

// Schema: Test Case V1 (shape alinhado ao DB/TestCase)
export const TestCaseV1 = z.object({
  schemaVersion: z.literal('case.v1'),
  title: z.preprocess(toStr, z.string().min(1)),
  description: z.preprocess(toStr, z.string().min(1)),
  preconditions: z.preprocess(toStr, z.string().default('')),
  steps: z.array(z.object({
    id: z.string().optional(),
    action: z.preprocess(toStr, z.string().min(1)),
    expected_result: z.preprocess(toStr, z.string().min(1)),
    order: z.number().int().positive(),
  })).min(1),
  expected_result: z.preprocess(toStr, z.string().min(1)),
  priority: z.enum(['low','medium','high','critical']).default('medium'),
  type: z.enum(['functional','integration','performance','security','usability']).default('functional'),
  sequence: z.number().int().positive().optional(),
  metadata: z.object({
    sourceDocId: z.string().optional(),
    modelId: z.string().optional(),
    createdAt: z.string().optional(),
  }).default({}),
});

// Schema: Test Execution V1 (shape alinhado ao DB/TestExecution)
export const TestExecutionV1 = z.object({
  schemaVersion: z.literal('execution.v1'),
  case_id: z.string().min(1),
  plan_id: z.string().optional(),
  status: z.enum(['passed','failed','blocked','not_tested']).default('not_tested'),
  actual_result: z.string().default(''),
  notes: z.string().default(''),
  executed_by: z.string().optional(),
  user_id: z.string().optional(),
  sequence: z.number().int().positive().optional(),
  metadata: z.object({
    sourceDocId: z.string().optional(),
    modelId: z.string().optional(),
    createdAt: z.string().optional(),
  }).default({}),
});

export type SchemaId = 'plan.v1' | 'case.v1' | 'execution.v1';

export const schemaRegistry: Record<SchemaId, typeof TestPlanV1 | typeof TestCaseV1 | typeof TestExecutionV1> = {
  'plan.v1': TestPlanV1,
  'case.v1': TestCaseV1,
  'execution.v1': TestExecutionV1,
};

export function getSchemaById(id?: string) {
  if (!id) return undefined;
  return schemaRegistry[id as SchemaId];
}

export function validateWithSchema<T = unknown>(id: SchemaId, data: unknown) {
  const schema = getSchemaById(id);
  if (!schema) throw new Error(`Schema não encontrado: ${id}`);
  // Injetar schemaVersion caso a IA não retorne (evita falha no z.literal)
  const input = (typeof data === 'object' && data !== null && !(data as Record<string, unknown>).schemaVersion)
    ? { schemaVersion: id, ...(data as object) }
    : data;
  const parsed = (schema as z.ZodTypeAny).safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Validação falhou (${id}): ${issues}`);
  }
  return parsed.data as T;
}

// Tentativa simples de "reparo": coerções e preenchimento de defaults via parse
export function tryRepairWithSchema<T = unknown>(id: SchemaId, data: unknown) {
  const schema = getSchemaById(id);
  if (!schema) return data as T;
  // Garantir schemaVersion para o literal não falhar caso a IA não o inclua
  const patched = (typeof data === 'object' && data !== null)
    ? { schemaVersion: id, ...(data as object) }
    : data;
  const parsed = (schema as z.ZodTypeAny).safeParse(patched);
  return parsed.success ? parsed.data as T : patched as T;
}
