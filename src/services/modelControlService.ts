import { supabase } from '@/integrations/supabase/client';
import { 
  AIModel, 
  AIPromptTemplate, 
  AIModelConfig,
  AIModelTask
} from '@/types';
import { generateText, generateStructuredContent } from '@/integrations/gemini/client';
import { openAIGenerateText } from '@/integrations/openai/client';
import { anthropicGenerateText } from '@/integrations/anthropic/client';
import { groqGenerateText } from '@/integrations/groq/client';
import { ollamaGenerateText } from '@/integrations/ollama/client';
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

// Default configuration
const defaultConfig: AIModelConfig = {
  models: [
    {
      id: 'gemini-1.5-flash',
      name: 'Gemini 1.5 Flash',
      provider: 'gemini',
      description: 'Google Gemini 1.5 Flash - Modelo rápido e eficiente para geração de texto',
      version: '1.5',
      capabilities: ['test-plan-generation', 'test-case-generation', 'test-execution-generation', 'general-completion'],
      defaultForTask: 'test-plan-generation',
      apiKey: undefined,
      active: true,
      settings: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        topK: 40,
        topP: 0.95,
      }
    },
    {
      id: 'gemini-1.5-pro',
      name: 'Gemini 1.5 Pro',
      provider: 'gemini',
      description: 'Google Gemini 1.5 Pro - Modelo avançado com maior precisão e capacidade de raciocínio',
      version: '1.5',
      capabilities: ['test-plan-generation', 'test-case-generation', 'test-execution-generation', 'bug-detection', 'code-analysis', 'general-completion'],
      defaultForTask: 'code-analysis',
      apiKey: undefined,
      active: true,
      settings: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        topK: 40,
        topP: 0.95,
      }
    },
    {
      id: 'gemini-1.5-pro-002',
      name: 'Gemini 1.5 Pro (002)',
      provider: 'gemini',
      description: 'Google Gemini 1.5 Pro versão 002 - Última versão com melhorias de performance',
      version: '1.5-002',
      capabilities: ['test-plan-generation', 'test-case-generation', 'bug-detection', 'code-analysis', 'general-completion'],
      defaultForTask: 'bug-detection',
      apiKey: undefined,
      active: true,
      settings: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        topK: 40,
        topP: 0.95,
      }
    },
    {
      id: 'gemini-2.0-flash-exp',
      name: 'Gemini 2.0 Flash (Experimental)',
      provider: 'gemini',
      description: 'Google Gemini 2.0 Flash Experimental - Modelo de próxima geração (Requer API Premium)',
      version: '2.0-exp',
      capabilities: ['test-plan-generation', 'test-case-generation', 'bug-detection', 'code-analysis', 'general-completion'],
      defaultForTask: 'general-completion',
      apiKey: undefined,
      active: false, // Disabled by default as it requires premium access
      settings: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        topK: 40,
        topP: 0.95,
      }
    },
    {
      id: 'gemini-1.5-flash-8b',
      name: 'Gemini 1.5 Flash 8B',
      provider: 'gemini',
      description: 'Google Gemini 1.5 Flash 8B - Versão otimizada para velocidade com 8 bilhões de parâmetros',
      version: '1.5-8b',
      capabilities: ['test-plan-generation', 'test-case-generation', 'general-completion'],
      defaultForTask: null,
      apiKey: undefined,
      active: false,
      settings: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        topK: 40,
        topP: 0.95,
      }
    },
    {
      id: 'gemini-1.5-flash-002',
      name: 'Gemini 1.5 Flash (002)',
      provider: 'gemini',
      description: 'Google Gemini 1.5 Flash versão 002 - Melhorias de performance e precisão',
      version: '1.5-002',
      capabilities: ['test-plan-generation', 'test-case-generation', 'general-completion'],
      defaultForTask: null,
      apiKey: undefined,
      active: false,
      settings: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        topK: 40,
        topP: 0.95,
      }
    },
    {
      id: 'gemini-2.0-flash-thinking-exp',
      name: 'Gemini 2.0 Flash Thinking (Experimental)',
      provider: 'gemini',
      description: 'Google Gemini 2.0 Flash Thinking - Modelo experimental com capacidades avançadas de raciocínio',
      version: '2.0-thinking-exp',
      capabilities: ['test-plan-generation', 'test-case-generation', 'bug-detection', 'code-analysis', 'general-completion'],
      defaultForTask: null,
      apiKey: undefined,
      active: false,
      settings: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        topK: 40,
        topP: 0.95,
      }
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
  defaultModel: 'gemini-1.5-flash',
  tasks: {
    'test-plan-generation': 'gemini-1.5-flash',
    'test-case-generation': 'gemini-1.5-pro',
    'test-execution-generation': 'gemini-1.5-flash',
    'bug-detection': 'gemini-1.5-pro-002',
    'code-analysis': 'gemini-1.5-pro',
    'general-completion': 'gemini-1.5-flash'
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

// Load configuration from local storage or use default
export const loadConfig = (): AIModelConfig => {
  const storedConfig = localStorage.getItem(getMcpConfigKey());
  return storedConfig ? JSON.parse(storedConfig) : defaultConfig;
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
  
  // Get model with robust fallbacks (user config -> defaultConfig -> first active)
  let model = modelId 
    ? config.models.find(m => m.id === modelId)
    : config.models.find(m => m.id === config.tasks[task]);

  if (!model || !model.active) {
    // Try from defaultConfig
    model = modelId
      ? defaultConfig.models.find(m => m.id === modelId)
      : defaultConfig.models.find(m => m.id === defaultConfig.tasks[task]);
  }

  if (!model || !model.active) {
    // Final fallback: first active from either stored or default
    model = (config.models.find(m => m.active) || defaultConfig.models.find(m => m.active));
  }

  if (!model || !model.active) {
    throw new Error(`No active model found for task: ${task}`);
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
      if (isGeneralCompletion) {
        return generateText(prompt, model.id);
      }
      const raw = await generateStructuredContent<unknown>(prompt, model.id);
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
    
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        key: 'mcp_config',
        // Valor salvo como JSON compatível com Supabase
        value: (configForStorage as unknown),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,key' });
      
    // Tratamento robusto para conflitos (409 / unique_violation)
    if (
      error &&
      (
        error.code === '409' || // HTTP Conflict (via PostgREST)
        error.code === '23505' || // unique_violation
        /duplicate key|unique constraint|conflict/i.test(error.message || '')
      )
    ) {
      const { error: updateError } = await supabase
        .from('user_settings')
        .update({
          // Valor salvo como JSON compatível com Supabase
          value: (configForStorage as unknown),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('key', 'mcp_config');

      if (updateError) {
        const { error: insertError } = await supabase
          .from('user_settings')
          .insert({
            user_id: userId,
            key: 'mcp_config',
            // Valor salvo como JSON compatível com Supabase
            value: (configForStorage as unknown),
            updated_at: new Date().toISOString()
          })
          .select();
        
        if (insertError) throw insertError;
      }
    } else if (error) {
      throw error;
    }
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
      .select('value')
      .eq('user_id', userId)
      .eq('key', 'mcp_config')
      .single();
      
    if (error) {
      if (error.code === 'PGRST116' || error.code === '42P01') {
        // Record not found or table doesn't exist, use default
        console.warn('User settings table not found or no config saved, using default');
        return defaultConfig;
      }
      throw error;
    }
    
    if (!data) return defaultConfig;
    
    // Restore API keys from local storage
    const storedApiKeys = JSON.parse(localStorage.getItem(getApiKeysKey()) || '{}');
    const config = (data.value as unknown) as AIModelConfig;
    
    config.models = config.models.map(model => ({
      ...model,
      apiKey: storedApiKeys[model.id] || model.apiKey
    }));
    
    return config;
  } catch (error) {
    console.error('Error loading MCP config from Supabase:', error);
    return defaultConfig;
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