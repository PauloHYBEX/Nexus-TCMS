import { supabase } from '@/integrations/supabase/client';
import { 
  AIModel, 
  AIPromptTemplate, 
  AIModelConfig,
  AIModelTask
} from '@/types';
import { generateText, generateStructuredContent, generateStructuredContentWithImages } from '@/integrations/gemini/client';
import { openAIGenerateText } from '@/integrations/openai/client';
import { anthropicGenerateText } from '@/integrations/anthropic/client';
import { groqGenerateText } from '@/integrations/groq/client';
import { ollamaGenerateText } from '@/integrations/ollama/client';
import { openRouterGenerateText } from '@/integrations/openrouter/client';
import { openRouterGenerateTextAdaptive } from '@/integrations/openrouter/adaptive';
import { validateWithSchema, tryRepairWithSchema, SchemaId } from '@/services/aiSchemas';

// Local storage keys (derivadas dinamicamente para segurança)
const getMcpConfigKey = () => `${window.location.hostname}_mcp_config`;
const getApiKeysKey = () => `${window.location.hostname}_mcp_api_keys`;

// Helper to read API key from localStorage store
const getStoredApiKey = (modelId: string): string | undefined => {
  try {
    const stored = JSON.parse(localStorage.getItem(getApiKeysKey()) || '{}');
    return stored[modelId];
  } catch {
    return undefined;
  }
};

// Modelos depreciados que devem ser removidos da config armazenada
const DEPRECATED_MODEL_IDS = [
  'gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.5-pro-002',
  'gemini-1.5-flash-8b', 'gemini-1.5-flash-002', 'gemini-2.0-flash-thinking-exp',
  'groq-llama-3.1-70b', 'gemini-2.5-pro-preview',
];

// Default configuration
const defaultConfig: AIModelConfig = {
  models: [
    // ── Gemini (chave gratuita em aistudio.google.com)
    {
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      provider: 'gemini',
      description: 'Google Gemini 2.0 Flash — Modelo estável de nova geração, rápido e gratuito com chave de API padrão.',
      version: '2.0-flash',
      capabilities: ['test-plan-generation', 'test-case-generation', 'test-execution-generation', 'bug-detection', 'general-completion'],
      defaultForTask: 'test-plan-generation',
      apiKey: undefined,
      active: true,
      settings: { temperature: 0.7, maxOutputTokens: 8192 }
    },
    {
      id: 'gemini-2.0-flash-lite',
      name: 'Gemini 2.0 Flash Lite',
      provider: 'gemini',
      description: 'Google Gemini 2.0 Flash Lite — Versão mais leve e econômica do Flash 2.0. Ideal para tarefas simples.',
      version: '2.0-flash-lite',
      capabilities: ['test-case-generation', 'general-completion'],
      defaultForTask: null,
      apiKey: undefined,
      active: false,
      settings: { temperature: 0.7, maxOutputTokens: 8192 }
    },
    {
      id: 'gemini-2.5-pro-preview-03-25',
      name: 'Gemini 2.5 Pro Preview',
      provider: 'gemini',
      description: 'Google Gemini 2.5 Pro Preview — Modelo mais capaz do Google, raciocínio avançado (experimental).',
      version: '2.5-pro',
      capabilities: ['test-plan-generation', 'test-case-generation', 'bug-detection', 'code-analysis', 'general-completion'],
      defaultForTask: 'code-analysis',
      apiKey: undefined,
      active: false,
      settings: { temperature: 0.7, maxOutputTokens: 16384 }
    },
    {
      id: 'gemini-2.0-flash-thinking-exp-01-21',
      name: 'Gemini 2.0 Flash Thinking',
      provider: 'gemini',
      description: 'Google Gemini 2.0 Flash Thinking — Raciocínio chain-of-thought avançado, para análises complexas.',
      version: '2.0-thinking',
      capabilities: ['test-plan-generation', 'test-case-generation', 'bug-detection', 'code-analysis', 'general-completion'],
      defaultForTask: null,
      apiKey: undefined,
      active: false,
      settings: { temperature: 0.7, maxOutputTokens: 8192 }
    },
    {
      id: 'gemini-2.0-flash-exp',
      name: 'Gemini 2.0 Flash (Experimental)',
      provider: 'gemini',
      description: 'Google Gemini 2.0 Flash Experimental — Capacidades multimodais avançadas.',
      version: '2.0-flash-exp',
      capabilities: ['test-plan-generation', 'test-case-generation', 'bug-detection', 'code-analysis', 'general-completion'],
      defaultForTask: null,
      apiKey: undefined,
      active: false,
      settings: { temperature: 0.7, maxOutputTokens: 8192 }
    },
    // ── Groq (API gratuita em console.groq.com)
    {
      id: 'groq-llama-3.3-70b',
      name: 'LLaMA 3.3 70B (Groq)',
      provider: 'groq',
      description: 'Meta LLaMA 3.3 70B via Groq — Versão mais recente e precisa, gratuita',
      version: '3.3-70b',
      capabilities: ['test-plan-generation', 'test-case-generation', 'general-completion'],
      defaultForTask: null,
      apiKey: undefined,
      active: false,
      settings: { apiModel: 'llama-3.3-70b-versatile' }
    },
    {
      id: 'groq-llama-3.1-8b',
      name: 'LLaMA 3.1 8B Instant (Groq)',
      provider: 'groq',
      description: 'Meta LLaMA 3.1 8B via Groq — Ultrarrápido para tarefas leves, completamente gratuito',
      version: '3.1-8b',
      capabilities: ['test-case-generation', 'general-completion'],
      defaultForTask: null,
      apiKey: undefined,
      active: false,
      settings: { apiModel: 'llama-3.1-8b-instant' }
    },
    {
      id: 'groq-mixtral-8x7b',
      name: 'Mixtral 8x7B (Groq)',
      provider: 'groq',
      description: 'Mistral Mixtral 8x7B via Groq — Mistura de especialistas, ótima qualidade e velocidade, gratuito',
      version: '8x7b',
      capabilities: ['test-plan-generation', 'test-case-generation', 'general-completion'],
      defaultForTask: null,
      apiKey: undefined,
      active: false,
      settings: { apiModel: 'mixtral-8x7b-32768' }
    },
    {
      id: 'groq-qwen-qwq-32b',
      name: 'QwQ 32B (Groq)',
      provider: 'groq',
      description: 'Alibaba QwQ 32B via Groq — Modelo de raciocínio avançado, excelente para análise de testes, gratuito',
      version: 'qwq-32b',
      capabilities: ['test-plan-generation', 'test-case-generation', 'bug-detection', 'code-analysis', 'general-completion'],
      defaultForTask: null,
      apiKey: undefined,
      active: false,
      settings: { apiModel: 'qwen-qwq-32b' }
    },
    // ── OpenRouter (plano gratuito em openrouter.ai)
    {
      id: 'openrouter-llama-3.1-free',
      name: 'LLaMA 3.1 70B Free (OpenRouter)',
      provider: 'openrouter',
      description: 'Meta LLaMA 3.1 70B via OpenRouter plano free — Sem custo, sem limites restritivos',
      version: '3.1-70b-free',
      capabilities: ['test-plan-generation', 'test-case-generation', 'general-completion'],
      defaultForTask: null,
      apiKey: undefined,
      active: false,
      settings: { apiModel: 'meta-llama/llama-3.1-70b-instruct:free' }
    },
    {
      id: 'openrouter-gemma2-9b-free',
      name: 'Gemma 2 9B Free (OpenRouter)',
      provider: 'openrouter',
      description: 'Google Gemma 2 9B via OpenRouter free — Modelo Google leve e preciso sem custo',
      version: '2-9b-free',
      capabilities: ['test-case-generation', 'general-completion'],
      defaultForTask: null,
      apiKey: undefined,
      active: false,
      settings: { apiModel: 'google/gemma-2-9b-it:free' }
    },
    {
      id: 'openrouter-mistral-7b-free',
      name: 'Mistral 7B Free (OpenRouter)',
      provider: 'openrouter',
      description: 'Mistral 7B via OpenRouter free — Rápido e eficiente para geração de testes simples',
      version: '7b-free',
      capabilities: ['test-case-generation', 'general-completion'],
      defaultForTask: null,
      apiKey: undefined,
      active: false,
      settings: { apiModel: 'mistralai/mistral-7b-instruct:free' }
    },
    // ── Ollama novos modelos locais
    {
      id: 'ollama-qwen25',
      name: 'Qwen 2.5 7B (Ollama Local)',
      provider: 'ollama',
      description: 'Alibaba Qwen 2.5 7B local via Ollama — Excelente desempenho em geração de código e testes',
      version: '2.5-7b',
      capabilities: ['test-plan-generation', 'test-case-generation', 'general-completion'],
      defaultForTask: null,
      apiKey: undefined,
      active: false,
      settings: { apiModel: 'qwen2.5:7b', baseUrl: 'http://localhost:11434' }
    },
    {
      id: 'ollama-phi3-mini',
      name: 'Phi-3 Mini (Ollama Local)',
      provider: 'ollama',
      description: 'Microsoft Phi-3 Mini local via Ollama — Ultra leve e rápido para geração de casos simples',
      version: 'mini-3',
      capabilities: ['test-case-generation', 'general-completion'],
      defaultForTask: null,
      apiKey: undefined,
      active: false,
      settings: { apiModel: 'phi3:mini', baseUrl: 'http://localhost:11434' }
    }
  ],
  promptTemplates: [
    {
      id: 'test-plan-template-1',
      name: 'Template Padrão para Planos de Teste',
      task: 'test-plan-generation',
      template: `
        Gere um plano de teste detalhado em PORTUGUÊS baseado nas seguintes informações:
        - Descrição da Aplicação: {{appDescription}}
        - Contexto Adicional: {{additionalContext}}
        - Requisitos: {{requirements}}
        
        Retorne um objeto JSON com EXATAMENTE esta estrutura:
        - schemaVersion: DEVE ser exatamente "plan.v1"
        - title: Título do plano de teste em português
        - description: Descrição clara dos objetivos do plano em português
        - objective: Objetivo principal do plano em português
        - scope: Escopo detalhado do plano em português
        - approach: Abordagem/metodologia de teste em português
        - criteria: Critérios de entrada e saída em português
        - resources: Recursos necessários em português
        - schedule: Cronograma e marcos em português
        - risks: Riscos potenciais e mitigações em português
        
        IMPORTANTE:
        - Retorne APENAS um objeto JSON, sem comentários ou markdown.
        - O objeto DEVE conter exatamente as chaves acima.
        - TODO o conteúdo deve estar em PORTUGUÊS do Brasil.
      `,
      description: 'Template padrão para gerar planos de teste detalhados',
      parameters: ['appDescription', 'requirements', 'additionalContext'],
      createdAt: new Date(),
      updatedAt: new Date(),
      active: true,
      outputSchemaId: 'plan.v1'
    },
    {
      id: 'test-case-template-1',
      name: 'Template Padrão para Casos de Teste',
      task: 'test-case-generation',
      template: `
        Gere casos de teste em PORTUGUÊS baseados no seguinte plano de teste:
        {{testPlan}}
        
        Gere {{numCases}} caso(s) de teste que cubram diferentes aspectos do plano.
        
        Retorne um objeto JSON com EXATAMENTE esta estrutura:
        - schemaVersion: DEVE ser exatamente "case.v1"
        - title: Título do caso de teste em português
        - description: O que este teste valida em português
        - preconditions: Pré-condições necessárias em português
        - steps: Array de passos, cada um com:
            - order: Número sequencial do passo iniciando em 1
            - action: Ação a ser executada em português
            - expected_result: Resultado esperado para o passo em português
        - expected_result: Resultado esperado geral do caso de teste em português
        - priority: Uma de: 'low', 'medium', 'high', 'critical'
        - type: Uma de: 'functional', 'integration', 'performance', 'security', 'usability'
        
        IMPORTANTE:
        - Retorne APENAS um objeto JSON, sem comentários ou markdown.
        - O objeto DEVE conter exatamente as chaves acima.
        - TODO o conteúdo deve estar em PORTUGUÊS do Brasil.
      `,
      description: 'Template padrão para gerar casos de teste baseados em um plano',
      parameters: ['testPlan', 'numCases'],
      createdAt: new Date(),
      updatedAt: new Date(),
      active: true,
      outputSchemaId: 'case.v1'
    },
    {
      id: 'test-execution-template-1',
      name: 'Template Padrão para Execuções de Teste',
      task: 'test-execution-generation',
      template: `
        Gere uma execução de teste detalhada em PORTUGUÊS baseada no seguinte:
        
        Plano de Teste:
        {{testPlan}}
        
        Caso de Teste:
        {{testCase}}
        
        Contexto da Execução:
        {{executionContext}}
        
        {{#if additionalContext}}
        Contexto Adicional:
        {{additionalContext}}
        {{/if}}
        
        Retorne um objeto JSON com EXATAMENTE esta estrutura:
        - schemaVersion: DEVE ser exatamente "execution.v1"
        - case_id: ID do caso de teste relacionado
        - plan_id: ID do plano de teste relacionado (opcional)
        - status: Um de: 'passed', 'failed', 'blocked', 'not_tested'
        - actual_result: Resultado real obtido durante o teste em português
        - notes: Observações detalhadas sobre a execução em português
        - executed_by: Nome ou identificador de quem executou o teste (opcional)
        - user_id: ID do usuário responsável (opcional)
        
        IMPORTANTE:
        - Retorne APENAS um objeto JSON, sem comentários ou markdown.
        - O objeto DEVE conter exatamente as chaves acima.
        - TODO o conteúdo deve estar em PORTUGUÊS do Brasil.
      `,
      description: 'Template padrão para gerar execuções de teste',
      parameters: ['testPlan', 'testCase', 'executionContext', 'additionalContext'],
      createdAt: new Date(),
      updatedAt: new Date(),
      active: true,
      outputSchemaId: 'execution.v1'
    },
    {
      id: 'general-completion-template-1',
      name: 'Template Padrão para Completion Geral',
      task: 'general-completion',
      template: `
        {{prompt}}
      `,
      description: 'Template para tarefas de completion geral e análise de documentos',
      parameters: ['prompt'],
      createdAt: new Date(),
      updatedAt: new Date(),
      active: true
    }
  ],
  defaultModel: 'gemini-2.0-flash',
  tasks: {
    'test-plan-generation': 'gemini-2.0-flash',
    'test-case-generation': 'gemini-2.0-flash',
    'test-execution-generation': 'gemini-2.0-flash',
    'bug-detection': 'gemini-2.5-pro-preview-03-25',
    'code-analysis': 'gemini-2.5-pro-preview-03-25',
    'general-completion': 'gemini-2.0-flash'
  }
};

// Normaliza payload validado pelo schema para o formato do DB
// Remove campos de controle que não existem na tabela
const normalizeForDb = <T>(schemaId: SchemaId | undefined, data: T): T => {
  if (!schemaId) return data;
  if (data && typeof data === 'object') {
    const { schemaVersion, metadata, ...rest } = (data as Record<string, unknown>);
    return rest as T;
  }
  return data;
};

// Carrega config, migra modelos depreciados e mescla novos modelos do defaultConfig
export const loadConfig = (): AIModelConfig => {
  const raw = localStorage.getItem(getMcpConfigKey());
  if (!raw) return defaultConfig;
  let stored: AIModelConfig;
  try { stored = JSON.parse(raw); } catch { return defaultConfig; }

  // Remove modelos depreciados
  let models = stored.models.filter(m => !DEPRECATED_MODEL_IDS.includes(m.id));

  // Adiciona novos modelos do defaultConfig que ainda não existem
  const knownIds = new Set(models.map(m => m.id));
  const newModels = defaultConfig.models.filter(m => !knownIds.has(m.id));
  models = [...models, ...newModels];

  // Corrige referências de tarefas que apontavam para modelos depreciados
  const validIds = new Set(models.map(m => m.id));
  const tasks = { ...stored.tasks } as Record<AIModelTask, string>;
  (Object.keys(tasks) as AIModelTask[]).forEach(task => {
    if (!validIds.has(tasks[task]) || DEPRECATED_MODEL_IDS.includes(tasks[task])) {
      const fallback = defaultConfig.tasks[task];
      tasks[task] = validIds.has(fallback) ? fallback : (models[0]?.id ?? '');
    }
  });

  const merged = { ...stored, models, tasks };
  localStorage.setItem(getMcpConfigKey(), JSON.stringify(merged));
  return merged;
};

// Save configuration to local storage
export const saveConfig = (config: AIModelConfig): void => {
  localStorage.setItem(getMcpConfigKey(), JSON.stringify(config));
};

// Reset configuration to default
export const resetConfig = (): AIModelConfig => {
  localStorage.setItem(getMcpConfigKey(), JSON.stringify(defaultConfig));
  return defaultConfig;
};

// ── Seleção automática inteligente de modelo ──────────────────────────────
// Prioridade: gemini > groq > openrouter > ollama > other
const PROVIDER_PRIORITY: Record<string, number> = {
  gemini: 10, groq: 8, openrouter: 6, anthropic: 7, openai: 9, ollama: 4, other: 1
};

// Verifica se um modelo tem API key válida configurada
const modelHasKey = (model: AIModel): boolean => {
  if (model.provider === 'ollama') return true; // local, sem chave
  const stored = getStoredApiKey(model.id);
  return Boolean(stored || model.apiKey);
};

// Seleciona automaticamente o melhor modelo disponível para uma tarefa
export const selectBestModelForTask = (task: AIModelTask, config?: AIModelConfig): AIModel | null => {
  const cfg = config || loadConfig();
  const candidates = cfg.models
    .filter(m => m.active && m.capabilities.includes(task) && modelHasKey(m))
    .sort((a, b) => (PROVIDER_PRIORITY[b.provider] ?? 0) - (PROVIDER_PRIORITY[a.provider] ?? 0));
  return candidates[0] ?? null;
};

// Get model by ID
export const getModelById = (modelId: string): AIModel | undefined => {
  const config = loadConfig();
  return config.models.find(model => model.id === modelId);
};

// Get default model for a task
export const getDefaultModelForTask = (task: AIModelTask): AIModel | undefined => {
  const config = loadConfig();
  const modelId = config.tasks[task];
  return config.models.find(model => model.id === modelId);
};

// Set default model for a task
export const setDefaultModelForTask = (task: AIModelTask, modelId: string): void => {
  const config = loadConfig();
  config.tasks[task] = modelId;
  saveConfig(config);
};

// Add a new model
export const addModel = (model: Omit<AIModel, 'id'>): AIModel => {
  const config = loadConfig();
  const newModel: AIModel = {
    ...model,
    id: `model-${Date.now()}`
  };
  config.models.push(newModel);
  saveConfig(config);
  return newModel;
};

// Update an existing model
export const updateModel = (modelId: string, updates: Partial<AIModel>): AIModel | undefined => {
  const config = loadConfig();
  const modelIndex = config.models.findIndex(model => model.id === modelId);
  
  if (modelIndex !== -1) {
    config.models[modelIndex] = {
      ...config.models[modelIndex],
      ...updates
    };
    saveConfig(config);
    return config.models[modelIndex];
  }
  
  return undefined;
};

// Delete a model
export const deleteModel = (modelId: string): boolean => {
  const config = loadConfig();
  const initialLength = config.models.length;
  config.models = config.models.filter(model => model.id !== modelId);
  
  // If default model is deleted, set a new default
  if (config.defaultModel === modelId && config.models.length > 0) {
    config.defaultModel = config.models[0].id;
  }
  
  // Update task mappings if they point to the deleted model
  Object.keys(config.tasks).forEach(task => {
    if (config.tasks[task as AIModelTask] === modelId && config.models.length > 0) {
      config.tasks[task as AIModelTask] = config.models[0].id;
    }
  });
  
  saveConfig(config);
  return config.models.length < initialLength;
};

// Get prompt template by ID
export const getPromptTemplateById = (templateId: string): AIPromptTemplate | undefined => {
  const config = loadConfig();
  return config.promptTemplates.find(template => template.id === templateId);
};

// Get prompt templates for a task
export const getPromptTemplatesForTask = (task: AIModelTask): AIPromptTemplate[] => {
  const config = loadConfig();
  return config.promptTemplates.filter(template => template.task === task && template.active);
};

// Add a new prompt template
export const addPromptTemplate = (template: Omit<AIPromptTemplate, 'id' | 'createdAt' | 'updatedAt'>): AIPromptTemplate => {
  const config = loadConfig();
  const now = new Date();
  const newTemplate: AIPromptTemplate = {
    ...template,
    id: `template-${Date.now()}`,
    createdAt: now,
    updatedAt: now
  };
  config.promptTemplates.push(newTemplate);
  saveConfig(config);
  return newTemplate;
};

// Update an existing prompt template
export const updatePromptTemplate = (templateId: string, updates: Partial<AIPromptTemplate>): AIPromptTemplate | undefined => {
  const config = loadConfig();
  const templateIndex = config.promptTemplates.findIndex(template => template.id === templateId);
  
  if (templateIndex !== -1) {
    config.promptTemplates[templateIndex] = {
      ...config.promptTemplates[templateIndex],
      ...updates,
      updatedAt: new Date()
    };
    saveConfig(config);
    return config.promptTemplates[templateIndex];
  }
  
  return undefined;
};

// Delete a prompt template
export const deletePromptTemplate = (templateId: string): boolean => {
  const config = loadConfig();
  const initialLength = config.promptTemplates.length;
  config.promptTemplates = config.promptTemplates.filter(template => template.id !== templateId);
  saveConfig(config);
  return config.promptTemplates.length < initialLength;
};

// Process a template with variables
const processTemplate = (template: string, variables: Record<string, unknown>): string => {
  let processedTemplate = template;
  
  // Replace simple variables
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    const value = variables[key];
    processedTemplate = processedTemplate.replace(regex, String(value ?? ''));
  });
  
  // Process conditional blocks
  const conditionalRegex = /{{#if ([^}]+)}}([\s\S]*?){{\/if}}/g;
  processedTemplate = processedTemplate.replace(conditionalRegex, (match, condition, content) => {
    return variables[condition] ? content : '';
  });
  
  return processedTemplate;
};

// Helper: tenta extrair JSON de uma resposta textual
const parseJsonFromText = <T = unknown>(text: string): T => {
  const fenced = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (fenced && fenced[1]) {
    return JSON.parse(fenced[1].trim()) as T;
  }
  const anyJson = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (anyJson) {
    return JSON.parse(anyJson[0]) as T;
  }
  // fallback: tenta parsear tudo
  return JSON.parse(text) as T;
};

// Execute a task with a specific model and template
export const executeTask = async (
  task: AIModelTask,
  variables: Record<string, unknown>,
  modelId?: string,
  templateId?: string
): Promise<unknown> => {
  const config = loadConfig();

  // Seleção automática inteligente quando modelId = 'auto' ou não especificado
  const useAuto = !modelId || modelId === 'auto' || modelId === 'default';
  let model: AIModel | undefined;

  if (useAuto) {
    // 1) Tenta seleção inteligente: modelo ativo + chave configurada + capability correta
    const best = selectBestModelForTask(task, config);
    if (best) { model = best; }
    else {
      // 2) Modelo atribuído para a tarefa (mesmo sem chave confirmada)
      model = config.models.find(m => m.id === config.tasks[task] && m.active)
        || defaultConfig.models.find(m => m.id === defaultConfig.tasks[task] && m.active);
    }
  } else {
    model = config.models.find(m => m.id === modelId)
      || defaultConfig.models.find(m => m.id === modelId);
  }

  if (!model || !model.active) {
    // Último recurso: primeiro ativo disponível
    model = config.models.find(m => m.active) || defaultConfig.models.find(m => m.active);
  }

  if (!model || !model.active) {
    throw new Error(`Nenhum modelo ativo encontrado para a tarefa: ${task}`);
  }
  
  // Debug logging of resolved model and API key presence (does not reveal the key value)
  try {
    const hasApiKey = model.provider === 'gemini'
      ? Boolean(getStoredApiKey(model.id))
      : Boolean(getStoredApiKey(model.id) || model.apiKey);
    console.debug('[MCP] executeTask:model', { task, modelId: model.id, provider: model.provider, hasApiKey });
  } catch {
    // noop
  }
  
  // Get template with fallback to defaultConfig when none active in stored config
  let templates = config.promptTemplates.filter(t => t.task === task && t.active);
  if (!templates || templates.length === 0) {
    templates = defaultConfig.promptTemplates.filter(t => t.task === task && t.active);
  }
  const template = templateId
    ? templates.find(t => t.id === templateId)
    : templates[0];

  if (!template) {
    throw new Error(`No active template found for task: ${task}`);
  }
  
  // Se a tarefa for completion geral, retornamos TEXTO;
  // caso contrário, esperamos conteúdo estruturado (JSON).
  const isGeneralCompletion = task === 'general-completion';
  const schemaId = (template.outputSchemaId as SchemaId | undefined);

  // Process template with variables
  const basePrompt = processTemplate(template.template, variables);
  // Enforce PT-BR language for all tasks regardless of template text
  const languageGuard = '\n\n[IDIOMA]\nResponda ESTRITAMENTE em PORTUGUÊS do Brasil (pt-BR) em todo o conteúdo gerado. Nunca use inglês.\n';
  const prompt = `${basePrompt}${languageGuard}`;

  // Execute baseado no provider
  switch (model.provider) {
    case 'gemini': {
      const geminiModelName = (model.settings && typeof model.settings.apiModel === 'string' && model.settings.apiModel.trim())
        ? model.settings.apiModel.trim()
        : model.id;

      // Verificar se há imagens nas variáveis para análise multimodal
      const hasImages = variables.images && Array.isArray(variables.images) && variables.images.length > 0;

      if (isGeneralCompletion) {
        return generateText(prompt, geminiModelName);
      }

      let raw: unknown;
      if (hasImages) {
        // Usar função multimodal quando houver imagens
        const imageUrls = variables.images as string[];
        raw = await generateStructuredContentWithImages<unknown>(prompt, imageUrls, geminiModelName);
      } else {
        raw = await generateStructuredContent<unknown>(prompt, geminiModelName);
      }

      if (schemaId) {
        try {
          const valid = validateWithSchema(schemaId, raw);
          return normalizeForDb(schemaId, valid);
        } catch (err: unknown) {
          const repaired = tryRepairWithSchema(schemaId, raw);
          try {
            const valid = validateWithSchema(schemaId, repaired);
            return normalizeForDb(schemaId, valid);
          } catch (err2: unknown) {
            const msg = err2 instanceof Error ? err2.message : String(err2);
            throw new Error(`Validação de schema (${schemaId}) falhou após tentativa de reparo: ${msg}`);
          }
        }
      }
      return raw;
    }
    case 'openai': {
      const apiModelName = (model.settings && typeof model.settings.apiModel === 'string' && model.settings.apiModel.trim())
        ? model.settings.apiModel.trim()
        : model.id;
      const apiKey = getStoredApiKey(model.id) || model.apiKey;
      const text = await openAIGenerateText(prompt, apiModelName, apiKey);
      if (isGeneralCompletion) return text;
      try {
        const parsed = parseJsonFromText<unknown>(text);
        if (!schemaId) return parsed;
        try {
          const valid = validateWithSchema(schemaId, parsed);
          return normalizeForDb(schemaId, valid);
        } catch (err: unknown) {
          const repaired = tryRepairWithSchema(schemaId, parsed);
          try {
            const valid = validateWithSchema(schemaId, repaired);
            return normalizeForDb(schemaId, valid);
          } catch (err2: unknown) {
            const msg = err2 instanceof Error ? err2.message : String(err2);
            throw new Error(`Validação de schema (${schemaId}) falhou após tentativa de reparo: ${msg}`);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Erro ao analisar JSON da resposta OpenAI: ${msg}`);
      }
    }
    case 'anthropic': {
      const apiModelName = (model.settings && typeof model.settings.apiModel === 'string' && model.settings.apiModel.trim())
        ? model.settings.apiModel.trim()
        : model.id;
      const apiKey = getStoredApiKey(model.id) || model.apiKey;
      const text = await anthropicGenerateText(prompt, apiModelName, apiKey);
      if (isGeneralCompletion) return text;
      try {
        const parsed = parseJsonFromText<unknown>(text);
        if (!schemaId) return parsed;
        try {
          const valid = validateWithSchema(schemaId, parsed);
          return normalizeForDb(schemaId, valid);
        } catch (err: unknown) {
          const repaired = tryRepairWithSchema(schemaId, parsed);
          try {
            const valid = validateWithSchema(schemaId, repaired);
            return normalizeForDb(schemaId, valid);
          } catch (err2: unknown) {
            const msg = err2 instanceof Error ? err2.message : String(err2);
            throw new Error(`Validação de schema (${schemaId}) falhou após tentativa de reparo: ${msg}`);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Erro ao analisar JSON da resposta Anthropic: ${msg}`);
      }
    }
    case 'groq': {
      const apiModelName = (model.settings && typeof model.settings.apiModel === 'string' && model.settings.apiModel.trim())
        ? model.settings.apiModel.trim()
        : model.id;
      const apiKey = getStoredApiKey(model.id) || model.apiKey;
      const text = await groqGenerateText(prompt, apiModelName, apiKey);
      if (isGeneralCompletion) return text;
      try {
        const parsed = parseJsonFromText<unknown>(text);
        if (!schemaId) return parsed;
        try {
          const valid = validateWithSchema(schemaId, parsed);
          return normalizeForDb(schemaId, valid);
        } catch (err: unknown) {
          const repaired = tryRepairWithSchema(schemaId, parsed);
          try {
            const valid = validateWithSchema(schemaId, repaired);
            return normalizeForDb(schemaId, valid);
          } catch (err2: unknown) {
            const msg = err2 instanceof Error ? err2.message : String(err2);
            throw new Error(`Validação de schema (${schemaId}) falhou após tentativa de reparo: ${msg}`);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Erro ao analisar JSON da resposta Groq: ${msg}`);
      }
    }
    case 'openrouter': {
      const apiModelName = (model.settings && typeof model.settings.apiModel === 'string' && model.settings.apiModel.trim())
        ? model.settings.apiModel.trim()
        : model.id;
      const apiKey = getStoredApiKey(model.id) || model.apiKey;

      // Verifica se há slugs alternativos configurados para fallback
      const adaptiveSlugs = model.settings?.adaptiveSlugs;
      const customSlugs = Array.isArray(adaptiveSlugs)
        ? adaptiveSlugs.filter((s: unknown) => typeof s === 'string')
        : undefined;

      // Usa modo adaptativo quando houver slugs customizados ou quando explícito
      const useAdaptive = model.settings?.adaptiveMode === true || customSlugs?.length > 0;

      let text: string;

      if (useAdaptive) {
        // Modo adaptativo: tenta múltiplos slugs
        const result = await openRouterGenerateTextAdaptive(prompt, apiModelName, apiKey, {
          customSlugs,
          temperature: 0.7,
          maxRetries: 3,
          onSlugAttempt: (slug, attempt, total) => {
            console.debug(`[OpenRouter Adaptive] Tentativa ${attempt}/${total}: ${slug}`);
          },
          onFallback: (failed, next) => {
            console.debug(`[OpenRouter Adaptive] ${failed} falhou, tentando ${next}`);
          },
        });
        text = result.content;
      } else {
        // Modo simples: um único slug
        text = await openRouterGenerateText(prompt, apiModelName, apiKey);
      }

      if (isGeneralCompletion) return text;
      try {
        const parsed = parseJsonFromText<unknown>(text);
        if (!schemaId) return parsed;
        try {
          const valid = validateWithSchema(schemaId, parsed);
          return normalizeForDb(schemaId, valid);
        } catch (err: unknown) {
          const repaired = tryRepairWithSchema(schemaId, parsed);
          try {
            const valid = validateWithSchema(schemaId, repaired);
            return normalizeForDb(schemaId, valid);
          } catch (err2: unknown) {
            const msg = err2 instanceof Error ? err2.message : String(err2);
            throw new Error(`Validação de schema (${schemaId}) falhou após tentativa de reparo: ${msg}`);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Erro ao analisar JSON da resposta OpenRouter: ${msg}`);
      }
    }
    case 'ollama': {
      const baseUrl = (model.settings && model.settings.baseUrl) ? model.settings.baseUrl : undefined;
      const apiModelName = (model.settings && typeof model.settings.apiModel === 'string' && model.settings.apiModel.trim())
        ? model.settings.apiModel.trim()
        : model.id;
      const text = await ollamaGenerateText(prompt, apiModelName, baseUrl);
      if (isGeneralCompletion) return text;
      try {
        const parsed = parseJsonFromText<unknown>(text);
        if (!schemaId) return parsed;
        try {
          const valid = validateWithSchema(schemaId, parsed);
          return normalizeForDb(schemaId, valid);
        } catch (err: unknown) {
          const repaired = tryRepairWithSchema(schemaId, parsed);
          try {
            const valid = validateWithSchema(schemaId, repaired);
            return normalizeForDb(schemaId, valid);
          } catch (err2: unknown) {
            const msg = err2 instanceof Error ? err2.message : String(err2);
            throw new Error(`Validação de schema (${schemaId}) falhou após tentativa de reparo: ${msg}`);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Erro ao analisar JSON da resposta Ollama: ${msg}`);
      }
    }
    default:
      throw new Error(`Unsupported model provider: ${model.provider}`);
  }
};

// Save MCP config to Supabase for the user
export const saveMCPConfigToSupabase = async (userId: string, config: AIModelConfig): Promise<void> => {
  try {
    // Remove sensitive API keys before saving to database
    const configForStorage = {
      ...config,
      models: config.models.map(model => ({
        ...model,
        apiKey: undefined
      }))
    };

    // Load existing settings blob first so we don't overwrite other keys
    const { data: existing } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', userId)
      .maybeSingle();

    const existingSettings = (() => {
      try { return JSON.parse((existing as any)?.settings || '{}'); } catch { return {}; }
    })();

    const merged = { ...existingSettings, mcp_config: configForStorage };

    const { error } = await supabase
      .from('user_settings')
      .upsert({ user_id: userId, settings: JSON.stringify(merged), updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    if (error) throw error;
  } catch (error) {
    console.error('Error saving MCP config to Supabase:', error);
    throw error;
  }
};

// Load MCP config from Supabase for the user
export const loadMCPConfigFromSupabase = async (userId: string): Promise<AIModelConfig | null> => {
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.warn('User settings table not accessible, using local config');
      return null;
    }

    if (!data) return null;

    const parsed = (() => {
      try { return JSON.parse((data as any).settings || '{}'); } catch { return {}; }
    })();

    const config = parsed.mcp_config as AIModelConfig | undefined;
    if (!config?.models) return null;

    // Restore API keys from local storage
    const storedApiKeys = JSON.parse(localStorage.getItem(getApiKeysKey()) || '{}');
    config.models = config.models.map(model => ({
      ...model,
      apiKey: storedApiKeys[model.id] || model.apiKey
    }));

    return config;
  } catch (error) {
    console.error('Error loading MCP config from Supabase:', error);
    return null;
  }
};

// Save API keys to local storage
export const saveApiKeys = (config: AIModelConfig): void => {
  const apiKeys: Record<string, string> = {};

  config.models.forEach(model => {
    if (model.apiKey) {
      apiKeys[model.id] = model.apiKey;
    }
  });

  localStorage.setItem(getApiKeysKey(), JSON.stringify(apiKeys));
};

// ── Busca de modelos disponíveis via API do provedor ────────────────────────
export interface ProviderModel {
  id: string;
  name: string;
  description?: string;
}

export const fetchProviderModels = async (
  provider: AIModel['provider'],
  apiKey: string,
  baseUrl?: string
): Promise<ProviderModel[]> => {
  switch (provider) {
    case 'gemini': {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(`Gemini ${res.status}: ${(err as any)?.error?.message || res.statusText}`);
      }
      const data = await res.json();
      return ((data.models ?? []) as any[])
        .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
        .map((m: any) => ({
          id: (m.name as string).replace('models/', ''),
          name: m.displayName || (m.name as string).replace('models/', ''),
          description: m.description,
        }));
    }
    case 'openai': {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${res.statusText}`);
      const data = await res.json();
      return ((data.data ?? []) as any[])
        .filter((m: any) => /^gpt/.test(m.id))
        .sort((a: any, b: any) => b.created - a.created)
        .slice(0, 30)
        .map((m: any) => ({ id: m.id, name: m.id }));
    }
    case 'groq': {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error(`Groq ${res.status}: ${res.statusText}`);
      const data = await res.json();
      return ((data.data ?? []) as any[]).map((m: any) => ({ id: m.id, name: m.id }));
    }
    case 'openrouter': {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}`, 'HTTP-Referer': window.location.origin },
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${res.statusText}`);
      const data = await res.json();
      return ((data.data ?? []) as any[]).map((m: any) => ({
        id: m.id,
        name: m.name || m.id,
        description: m.description,
      }));
    }
    case 'anthropic': {
      // Anthropic não tem endpoint público de listagem; retorna modelos conhecidos
      return [
        { id: 'claude-opus-4-5',              name: 'Claude Opus 4.5 (mais capaz)' },
        { id: 'claude-sonnet-4-5',             name: 'Claude Sonnet 4.5' },
        { id: 'claude-3-7-sonnet-20250219',    name: 'Claude 3.7 Sonnet' },
        { id: 'claude-3-5-sonnet-20241022',    name: 'Claude 3.5 Sonnet' },
        { id: 'claude-3-5-haiku-20241022',     name: 'Claude 3.5 Haiku (rápido)' },
        { id: 'claude-3-opus-20240229',        name: 'Claude 3 Opus' },
      ];
    }
    case 'ollama': {
      const base = baseUrl || 'http://localhost:11434';
      const res = await fetch(`${base}/api/tags`);
      if (!res.ok) throw new Error(`Ollama ${res.status}: ${res.statusText}`);
      const data = await res.json();
      return ((data.models ?? []) as any[]).map((m: any) => ({ id: m.name, name: m.name }));
    }
    default:
      return [];
  }
};