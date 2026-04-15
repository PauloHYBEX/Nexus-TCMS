import { z } from 'zod';

// Schema: Test Plan V1 (shape alinhado ao DB/TestPlan)
export const TestPlanV1 = z.object({
  schemaVersion: z.literal('plan.v1'),
  title: z.string().min(1),
  description: z.string().min(1),
  objective: z.string().min(1),
  scope: z.string().min(1),
  approach: z.string().min(1),
  criteria: z.preprocess(v => Array.isArray(v) ? (v as unknown[]).join('\n') : v, z.string().min(1)),
  resources: z.preprocess(v => Array.isArray(v) ? (v as unknown[]).join('\n') : v, z.string().min(1)),
  schedule: z.preprocess(v => Array.isArray(v) ? (v as unknown[]).join('\n') : v, z.string().min(1)),
  risks: z.preprocess(v => Array.isArray(v) ? (v as unknown[]).join('\n') : v, z.string().min(1)),
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
  title: z.string().min(1),
  description: z.string().min(1),
  preconditions: z.string().default(''),
  steps: z.array(z.object({
    id: z.string().optional(),
    action: z.string().min(1),
    expected_result: z.string().min(1),
    order: z.number().int().positive(),
  })).min(1),
  expected_result: z.string().min(1),
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
  const parsed = (schema as z.ZodTypeAny).safeParse(data);
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
  // zod já aplica defaults/coerções definidas no schema
  const parsed = (schema as z.ZodTypeAny).safeParse(data);
  return parsed.success ? parsed.data as T : data as T;
}
