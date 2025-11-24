export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type RequirementStatus = 'open' | 'in_progress' | 'approved' | 'deprecated';
export type DefectStatus = 'open' | 'in_analysis' | 'fixed' | 'validated' | 'closed';
export type ExecutionStatus = 'passed' | 'failed' | 'blocked' | 'not_tested';
export type TestCaseType = 'functional' | 'integration' | 'performance' | 'security' | 'usability';

export const priorityLabel = (p: Priority) => ({
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica',
}[p] || p);

export const priorityBadgeClass = (p: Priority) => ({
  low: 'bg-green-100 text-green-800 dark:bg-green-400/15 dark:text-green-300 dark:ring-1 dark:ring-green-400/25',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-400/15 dark:text-yellow-300 dark:ring-1 dark:ring-yellow-400/25',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-400/15 dark:text-orange-300 dark:ring-1 dark:ring-orange-400/25',
  critical: 'bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-300 dark:ring-1 dark:ring-red-400/25',
}[p] || 'bg-gray-100 text-gray-800 dark:bg-gray-400/15 dark:text-gray-300 dark:ring-1 dark:ring-gray-400/25');

export const severityLabel = priorityLabel;
export const severityBadgeClass = priorityBadgeClass;

export const requirementStatusLabel = (s: RequirementStatus) => ({
  open: 'Aberto',
  in_progress: 'Em andamento',
  approved: 'Aprovado',
  deprecated: 'Obsoleto',
}[s] || s);

export const requirementStatusBadgeClass = (s: RequirementStatus) => ({
  open: 'bg-gray-100 text-gray-800 dark:bg-slate-400/15 dark:text-slate-300 dark:ring-1 dark:ring-slate-400/25',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-400/15 dark:text-blue-300 dark:ring-1 dark:ring-blue-400/25',
  approved: 'bg-green-100 text-green-800 dark:bg-green-400/15 dark:text-green-300 dark:ring-1 dark:ring-green-400/25',
  deprecated: 'bg-slate-200 text-slate-800 dark:bg-slate-400/15 dark:text-slate-300 dark:ring-1 dark:ring-slate-400/25',
}[s] || 'bg-gray-100 text-gray-800 dark:bg-slate-400/15 dark:text-slate-300 dark:ring-1 dark:ring-slate-400/25');

export const defectStatusLabel = (s: DefectStatus) => ({
  open: 'Aberto',
  in_analysis: 'Em análise',
  fixed: 'Corrigido',
  validated: 'Validado',
  closed: 'Fechado',
}[s] || s);

export const defectStatusBadgeClass = (s: DefectStatus) => ({
  open: 'bg-gray-100 text-gray-800 dark:bg-slate-400/15 dark:text-slate-300 dark:ring-1 dark:ring-slate-400/25',
  in_analysis: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-400/15 dark:text-yellow-300 dark:ring-1 dark:ring-yellow-400/25',
  fixed: 'bg-blue-100 text-blue-800 dark:bg-blue-400/15 dark:text-blue-300 dark:ring-1 dark:ring-blue-400/25',
  validated: 'bg-green-100 text-green-800 dark:bg-green-400/15 dark:text-green-300 dark:ring-1 dark:ring-green-400/25',
  closed: 'bg-slate-200 text-slate-800 dark:bg-slate-400/15 dark:text-slate-300 dark:ring-1 dark:ring-slate-400/25',
}[s] || 'bg-gray-100 text-gray-800 dark:bg-slate-400/15 dark:text-slate-300 dark:ring-1 dark:ring-slate-400/25');

export const testCaseTypeLabel = (t: TestCaseType) => ({
  functional: 'Funcional',
  integration: 'Integração',
  performance: 'Desempenho',
  security: 'Segurança',
  usability: 'Usabilidade',
}[t] || (t as string));

export const testCaseTypeBadgeClass = (t: TestCaseType) => ({
  functional: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-400/15 dark:text-indigo-300 dark:ring-1 dark:ring-indigo-400/25',
  integration: 'bg-blue-100 text-blue-800 dark:bg-blue-400/15 dark:text-blue-300 dark:ring-1 dark:ring-blue-400/25',
  performance: 'bg-purple-100 text-purple-800 dark:bg-purple-400/15 dark:text-purple-300 dark:ring-1 dark:ring-purple-400/25',
  security: 'bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-300 dark:ring-1 dark:ring-red-400/25',
  usability: 'bg-teal-100 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300 dark:ring-1 dark:ring-teal-400/25',
}[t] || 'bg-gray-100 text-gray-800 dark:bg-slate-400/15 dark:text-slate-300 dark:ring-1 dark:ring-slate-400/25');

// Execuções de Teste
export const executionStatusLabel = (s: ExecutionStatus) => ({
  passed: 'Aprovado',
  failed: 'Reprovado',
  blocked: 'Bloqueado',
  not_tested: 'Não Testado',
}[s] || (s as string));

export const executionStatusBadgeClass = (s: ExecutionStatus) => ({
  passed: 'bg-green-100 text-green-800 dark:bg-green-400/15 dark:text-green-300 dark:ring-1 dark:ring-green-400/25',
  failed: 'bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-300 dark:ring-1 dark:ring-red-400/25',
  blocked: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-400/15 dark:text-yellow-300 dark:ring-1 dark:ring-yellow-400/25',
  not_tested: 'bg-gray-100 text-gray-800 dark:bg-slate-400/15 dark:text-slate-300 dark:ring-1 dark:ring-slate-400/25',
}[s] || 'bg-gray-100 text-gray-800 dark:bg-slate-400/15 dark:text-slate-300 dark:ring-1 dark:ring-slate-400/25');
