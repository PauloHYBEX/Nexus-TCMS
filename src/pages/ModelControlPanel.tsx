import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, Trash2, Plus, Save, RefreshCcw, Sparkles, Zap, Loader2, CheckCircle, XCircle, FileText, Copy, ChevronDown, ChevronUp, Bot, Key } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { PermissionGuard } from '@/components/PermissionGuard';
import { AIModel, AIPromptTemplate, AIModelTask, AIModelConfig } from '@/types';
import type { ProviderModel } from '@/services/modelControlService';
import * as ModelControlService from '@/services/modelControlService';
import { generateText, geminiGenerateText } from '@/integrations/gemini/client';
import { openAIGenerateText } from '@/integrations/openai/client';
import { anthropicGenerateText } from '@/integrations/anthropic/client';
import { groqGenerateText } from '@/integrations/groq/client';
import { ollamaGenerateText } from '@/integrations/ollama/client';
import { openRouterGenerateText } from '@/integrations/openrouter/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAISettings } from '@/hooks/useAISettings';

// ─── Constantes de capacidades ───────────────────────────────────────────────
const ALL_CAPABILITIES: { id: string; label: string }[] = [
  { id: 'test-plan-generation',      label: 'Planos de Teste' },
  { id: 'test-case-generation',      label: 'Casos de Teste' },
  { id: 'test-execution-generation', label: 'Execuções de Teste' },
  { id: 'bug-detection',             label: 'Detecção de Bugs' },
  { id: 'code-analysis',             label: 'Análise de Código' },
  { id: 'general-completion',        label: 'Completion Geral' },
];

const capLabel = (id: string) => ALL_CAPABILITIES.find(c => c.id === id)?.label ?? id;

const TASK_LABELS: Record<string, string> = {
  'test-plan-generation':      'Geração de Planos',
  'test-case-generation':      'Geração de Casos',
  'test-execution-generation': 'Geração de Execuções',
  'bug-detection':             'Detecção de Bugs',
  'code-analysis':             'Análise de Código',
  'general-completion':        'Completion Geral',
};

const providerLabel = (p: AIModel['provider']) =>
  ({ gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Anthropic', groq: 'Groq', ollama: 'Ollama', openrouter: 'OpenRouter', other: 'Outro' } as any)[p] ?? p;

const providerRequiresApiKey = (p: AIModel['provider']) => p !== 'ollama' && p !== 'other';

const PROVIDER_SUGGESTIONS: Record<string, string[]> = {
  gemini:      [],
  openai:      ['gpt-4o-mini', 'gpt-4o'],
  anthropic:   ['claude-3-5-sonnet-20240620', 'claude-3-haiku-20240307'],
  groq:        ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'qwen-qwq-32b', 'gemma2-9b-it'],
  openrouter:  ['openai/gpt-4o-mini', 'anthropic/claude-3-haiku', 'meta-llama/llama-3.1-70b-instruct:free', 'google/gemma-2-9b-it:free', 'mistralai/mistral-7b-instruct:free'],
  ollama:      ['llama3:8b', 'llama3.1:8b', 'mistral:latest', 'qwen2.5:7b', 'phi3:mini', 'gemma2:9b'],
  other:       [],
};

// ─── Componente principal ─────────────────────────────────────────────────────
export const ModelControlPanel = () => {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AIModelConfig | null>(null);
  const [openSections, setOpenSections] = useState({ models: true, templates: false, tests: false });
  const [activeTab, setActiveTab] = useState<'models' | 'templates' | 'tests' | 'settings'>('models');
  const { settings: aiSettings, updateSettings: updateAISettings } = useAISettings();

  // Models list state
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [inlineForms, setInlineForms] = useState<Record<string, Partial<AIModel>>>({});
  const [showApiKeyFor, setShowApiKeyFor] = useState<Record<string, boolean>>({});
  const [capInput, setCapInput] = useState<Record<string, string>>({});

  // Fetch provider models
  const [fetchedModels, setFetchedModels] = useState<Record<string, ProviderModel[]>>({}); // keyed by ctx ('new' or modelId)
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({});
  const [fetchModelError, setFetchModelError] = useState<Record<string, string | null>>({});

  // Add-new-model form
  const [addingModel, setAddingModel] = useState(false);
  const [newModelForm, setNewModelForm] = useState<Partial<AIModel>>({});
  const [showNewApiKey, setShowNewApiKey] = useState(false);
  const [newCapInput, setNewCapInput] = useState('');

  // Template form
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState<Partial<AIPromptTemplate>>({});
  const [templateFilterTask, setTemplateFilterTask] = useState('all');
  const [templateFilterStatus, setTemplateFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');

  // Test tab
  const [testPrompt, setTestPrompt] = useState('Diga olá em português e explique em 2 frases o que é teste de software.');
  const [testApiKey, setTestApiKey] = useState('');
  const [testModelId, setTestModelId] = useState('auto');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; response?: string; error?: string; modelUsed?: string } | null>(null);

  useEffect(() => { if (user) loadConfigData(); }, [user]);

  const loadConfigData = async () => {
    try {
      setLoading(true);
      let local = ModelControlService.loadConfig();
      if (user) {
        try {
          const remote = await ModelControlService.loadMCPConfigFromSupabase(user.id);
          if (remote) {
            // Preserve user-added models that exist locally but not in the remote (Supabase) config
            const remoteIds = new Set(remote.models.map(m => m.id));
            const localOnlyModels = local.models.filter(m => !remoteIds.has(m.id));
            const merged: typeof remote = {
              ...remote,
              models: [...remote.models, ...localOnlyModels],
            };
            local = merged;
            ModelControlService.saveConfig(merged);
          }
        } catch {}
      }
      setConfig(local);
    } finally { setLoading(false); }
  };

  // ─── Helpers ───────────────────────────────────────────────────────────────
  const modelHasKey = (model: AIModel): boolean => {
    if (model.provider === 'ollama') return true;
    try {
      const host = window.location.hostname;
      const keys = JSON.parse(localStorage.getItem(`${host}_mcp_api_keys`) || localStorage.getItem('mcp_api_keys') || '{}');
      return Boolean(keys[model.id] || model.apiKey);
    } catch { return Boolean(model.apiKey); }
  };

  const refreshConfig = () => setConfig(ModelControlService.loadConfig());

  // ─── Model operations ─────────────────────────────────────────────────────
  const toggleModelActive = (model: AIModel, checked: boolean) => {
    ModelControlService.updateModel(model.id, { active: checked });
    refreshConfig();
  };

  const openInlineForm = (model: AIModel) => {
    setInlineForms(p => ({ ...p, [model.id]: { ...model } }));
    setExpandedModelId(model.id);
  };

  const closeInlineForm = (modelId: string) => {
    setInlineForms(p => { const n = { ...p }; delete n[modelId]; return n; });
    setExpandedModelId(null);
  };

  const updateInlineForm = (modelId: string, patch: Partial<AIModel>) =>
    setInlineForms(p => ({ ...p, [modelId]: { ...p[modelId], ...patch } }));

  const toggleInlineCapability = (modelId: string, capId: string) => {
    const form = inlineForms[modelId] || {};
    const caps = form.capabilities || [];
    const next = caps.includes(capId) ? caps.filter(c => c !== capId) : [...caps, capId];
    updateInlineForm(modelId, { capabilities: next });
  };

  const saveInlineModel = (modelId: string) => {
    const form = inlineForms[modelId];
    if (!form) return;
    ModelControlService.updateModel(modelId, form);
    refreshConfig();
    closeInlineForm(modelId);
  };

  // Busca modelos disponíveis pelo provedor via API
  const handleFetchModels = async (ctx: string, provider: AIModel['provider'], apiKey: string, baseUrl?: string) => {
    if (!apiKey.trim() && provider !== 'ollama' && provider !== 'anthropic') return;
    setFetchingModels(p => ({ ...p, [ctx]: true }));
    setFetchModelError(p => ({ ...p, [ctx]: null }));
    try {
      const models = await ModelControlService.fetchProviderModels(provider, apiKey.trim(), baseUrl);
      setFetchedModels(p => ({ ...p, [ctx]: models }));
    } catch (e: any) {
      setFetchModelError(p => ({ ...p, [ctx]: e.message }));
    } finally {
      setFetchingModels(p => ({ ...p, [ctx]: false }));
    }
  };

  const deleteModel = (modelId: string) => {
    if (!window.confirm('Excluir este modelo?')) return;
    ModelControlService.deleteModel(modelId);
    refreshConfig();
    if (expandedModelId === modelId) setExpandedModelId(null);
  };

  // ─── Add new model ────────────────────────────────────────────────────────
  const startAddingModel = () => {
    setNewModelForm({ name: '', provider: 'gemini', description: '', version: '1.0', capabilities: [], active: true, settings: {} });
    setAddingModel(true);
  };

  const toggleNewCap = (capId: string) => {
    const caps = newModelForm.capabilities || [];
    setNewModelForm(p => ({ ...p, capabilities: caps.includes(capId) ? caps.filter(c => c !== capId) : [...caps, capId] }));
  };

  const saveNewModel = () => {
    if (!newModelForm.name?.trim()) return;
    ModelControlService.addModel(newModelForm as Omit<AIModel, 'id'>);
    refreshConfig();
    setAddingModel(false);
    setNewModelForm({});
  };

  // ─── Task assignment ──────────────────────────────────────────────────────
  const setDefaultModelForTask = (task: AIModelTask, modelId: string) => {
    if (!config) return;
    ModelControlService.setDefaultModelForTask(task, modelId);
    setConfig({ ...config, tasks: { ...config.tasks, [task]: modelId } });
  };

  // ─── Templates ────────────────────────────────────────────────────────────
  const saveTemplate = () => {
    if (!config) return;
    if (editingTemplateId === 'new') {
      const t = ModelControlService.addPromptTemplate(templateForm as any);
      setConfig({ ...config, promptTemplates: [...config.promptTemplates, t] });
    } else {
      const t = ModelControlService.updatePromptTemplate(editingTemplateId!, templateForm);
      if (t) setConfig({ ...config, promptTemplates: config.promptTemplates.map(x => x.id === t.id ? t : x) });
    }
    setEditingTemplateId(null); setTemplateForm({});
  };

  const deleteTemplate = (id: string) => {
    if (!config || !window.confirm('Excluir este template?')) return;
    ModelControlService.deletePromptTemplate(id);
    setConfig({ ...config, promptTemplates: config.promptTemplates.filter(t => t.id !== id) });
  };

  const duplicateTemplate = (t: AIPromptTemplate) => {
    if (!config) return;
    const n = ModelControlService.addPromptTemplate({ name: `${t.name} (Cópia)`, task: t.task, template: t.template, description: t.description, parameters: t.parameters, active: t.active });
    setConfig({ ...config, promptTemplates: [...config.promptTemplates, n] });
  };

  // ─── API test ─────────────────────────────────────────────────────────────
  const resolveModelForTest = (): AIModel | undefined => {
    if (!config) return;
    if (testModelId === 'auto') return ModelControlService.selectBestModelForTask('general-completion', config) ?? config.models.find(m => m.active);
    return config.models.find(m => m.id === testModelId);
  };

  const testApiConnection = async (overrideModelId?: string) => {
    setTestLoading(true); setTestResult(null);
    try {
      const model = overrideModelId ? config?.models.find(m => m.id === overrideModelId) : resolveModelForTest();
      if (!model) throw new Error('Nenhum modelo selecionado');

      // Lê a chave salva no localStorage (igual ao modelControlService)
      const host = window.location.hostname;
      const storedKeys: Record<string, string> = JSON.parse(
        localStorage.getItem(`${host}_mcp_api_keys`) || localStorage.getItem('mcp_api_keys') || '{}'
      );
      const resolvedKey = testApiKey.trim() || storedKeys[model.id] || model.apiKey || '';

      // Se o usuário digitou uma chave de teste, persiste para uso futuro
      if (testApiKey.trim() && providerRequiresApiKey(model.provider)) {
        storedKeys[model.id] = testApiKey.trim();
        localStorage.setItem(`${host}_mcp_api_keys`, JSON.stringify(storedKeys));
        refreshConfig();
      }

      const slug = typeof model.settings?.apiModel === 'string' && model.settings.apiModel.trim() ? model.settings.apiModel.trim() : model.id;
      const baseUrl = typeof model.settings?.baseUrl === 'string' ? model.settings.baseUrl : undefined;
      let text = '';
      switch (model.provider) {
        case 'gemini':     text = await geminiGenerateText(testPrompt, slug, resolvedKey); break;
        case 'openai':     text = await openAIGenerateText(testPrompt, slug, resolvedKey); break;
        case 'anthropic':  text = await anthropicGenerateText(testPrompt, slug, resolvedKey); break;
        case 'groq':       text = await groqGenerateText(testPrompt, slug, resolvedKey); break;
        case 'openrouter': text = await openRouterGenerateText(testPrompt, slug, resolvedKey); break;
        case 'ollama':     text = await ollamaGenerateText(testPrompt, slug, baseUrl); break;
        default: throw new Error(`Provedor não suportado: ${model.provider}`);
      }
      setTestResult({ success: true, message: 'Conexão estabelecida com sucesso!', response: text.slice(0, 400) + (text.length > 400 ? '…' : ''), modelUsed: model.name });
    } catch (e: any) {
      setTestResult({ success: false, message: 'Falha na conexão', error: e.message, modelUsed: resolveModelForTest()?.name });
    } finally { setTestLoading(false); }
  };

  const saveConfigToSupabase = async () => {
    if (!user || !config) return;
    try { await ModelControlService.saveMCPConfigToSupabase(user.id, config); ModelControlService.saveApiKeys(config); alert('Configurações salvas!'); }
    catch { alert('Erro ao salvar configurações.'); }
  };

  const resetConfig = () => {
    if (!window.confirm('Redefinir todas as configurações para o padrão?')) return;
    setConfig(ModelControlService.resetConfig());
    setTimeout(() => window.location.reload(), 800);
  };

  // ─── Inline form renderer ─────────────────────────────────────────────────
  const renderInlineForm = (modelId: string) => {
    const form = inlineForms[modelId] || {};
    const provider = (form.provider || 'gemini') as AIModel['provider'];
    const caps = form.capabilities || [];
    const relatedTemplates = config?.promptTemplates.filter(t => caps.includes(t.task)) || [];

    const patchSettings = (patch: Record<string, any>) =>
      updateInlineForm(modelId, { settings: { ...(form.settings || {}), ...patch } });

    return (
      <div className="border border-t-0 rounded-b-lg p-4 space-y-4 bg-muted/20">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Nome</Label>
            <Input value={form.name || ''} onChange={e => updateInlineForm(modelId, { name: e.target.value })} className="h-8 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Provedor</Label>
            <Select value={provider} onValueChange={v => updateInlineForm(modelId, { provider: v as any, settings: { ...(form.settings || {}), apiModel: PROVIDER_SUGGESTIONS[v]?.[0] || '' } })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini">Google Gemini</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="groq">Groq</SelectItem>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
                <SelectItem value="ollama">Ollama</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs">Descrição</Label>
          <Textarea value={form.description || ''} onChange={e => updateInlineForm(modelId, { description: e.target.value })} className="text-sm min-h-[60px]" />
        </div>

        {providerRequiresApiKey(provider) && (
          <div className="space-y-2">
            <Label className="text-xs flex items-center gap-1"><Key className="h-3 w-3" /> Chave de API</Label>
            <div className="flex gap-2">
              <Input type={showApiKeyFor[modelId] ? 'text' : 'password'} value={form.apiKey || ''} onChange={e => updateInlineForm(modelId, { apiKey: e.target.value })} className="h-8 text-sm font-mono flex-1" placeholder="sk-..." />
              <Button type="button" variant="outline" size="sm" onClick={() => setShowApiKeyFor(p => ({ ...p, [modelId]: !p[modelId] }))}>{showApiKeyFor[modelId] ? 'Ocultar' : 'Mostrar'}</Button>
              <Button type="button" variant="secondary" size="sm" disabled={fetchingModels[modelId]} onClick={() => handleFetchModels(modelId, provider, form.apiKey || '', (form.settings?.baseUrl as string) || '')}>
                {fetchingModels[modelId] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                <span className="ml-1 hidden sm:inline">Buscar Modelos</span>
              </Button>
            </div>
            {fetchModelError[modelId] && <p className="text-xs text-destructive">{fetchModelError[modelId]}</p>}
          </div>
        )}

        {provider !== 'other' && (
          <div>
            <Label className="text-xs">Slug do Modelo (ID exato da API)</Label>
            {fetchedModels[modelId]?.length > 0 ? (
              <Select value={(form.settings?.apiModel as string) || (provider === 'gemini' ? '' : '')} onValueChange={v => provider === 'gemini' ? updateInlineForm(modelId, { id: v, settings: { ...(form.settings || {}), apiModel: v } }) : patchSettings({ apiModel: v })}>
                <SelectTrigger className="h-8 text-sm font-mono"><SelectValue placeholder="Selecione o modelo" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {fetchedModels[modelId].map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      <div><div className="text-sm font-mono">{m.id}</div>{m.name !== m.id && <div className="text-xs text-muted-foreground">{m.name}</div>}</div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <>
                <Input value={provider === 'gemini' ? (form.id || modelId) : ((form.settings?.apiModel as string) || '')} onChange={e => provider === 'gemini' ? updateInlineForm(modelId, { id: e.target.value }) : patchSettings({ apiModel: e.target.value })} className="h-8 text-sm font-mono" placeholder={provider === 'gemini' ? 'gemini-2.0-flash' : (PROVIDER_SUGGESTIONS[provider]?.[0] || '')} />
                {PROVIDER_SUGGESTIONS[provider]?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {PROVIDER_SUGGESTIONS[provider].map(s => (
                      <button key={s} type="button" className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-accent border text-muted-foreground" onClick={() => provider === 'gemini' ? updateInlineForm(modelId, { id: s }) : patchSettings({ apiModel: s })}>{s}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {provider === 'ollama' && (
          <div className="space-y-1">
            <Label className="text-xs">Base URL (Ollama)</Label>
            <div className="flex gap-2">
              <Input value={(form.settings?.baseUrl as string) || 'http://localhost:11434'} onChange={e => patchSettings({ baseUrl: e.target.value })} className="h-8 text-sm flex-1" />
              <Button type="button" variant="secondary" size="sm" disabled={fetchingModels[modelId]} onClick={() => handleFetchModels(modelId, 'ollama', '', (form.settings?.baseUrl as string) || 'http://localhost:11434')}>
                {fetchingModels[modelId] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                <span className="ml-1 hidden sm:inline">Buscar Modelos</span>
              </Button>
            </div>
          </div>
        )}

        <div>
          <Label className="text-xs mb-2 block">Capacidades</Label>
          <div className="grid grid-cols-2 gap-2">
            {ALL_CAPABILITIES.map(cap => (
              <label key={cap.id} className="flex items-center gap-2 cursor-pointer text-sm">
                <Checkbox checked={caps.includes(cap.id)} onCheckedChange={() => toggleInlineCapability(modelId, cap.id)} />
                <span>{cap.label}</span>
              </label>
            ))}
          </div>
        </div>

        {relatedTemplates.length > 0 && (
          <div className="rounded-md bg-blue-50 dark:bg-blue-950/40 p-3">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">Templates associados ({relatedTemplates.length})</p>
            <div className="flex flex-wrap gap-1">
              {relatedTemplates.map(t => (
                <Badge key={t.id} variant="secondary" className="text-xs">{t.name}</Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => closeInlineForm(modelId)}>Cancelar</Button>
          <Button size="sm" onClick={() => saveInlineModel(modelId)}><Save className="h-3.5 w-3.5 mr-1" /> Salvar</Button>
        </div>
      </div>
    );
  };

  // ─── New model form renderer ───────────────────────────────────────────────
  const renderNewModelForm = () => {
    const form = newModelForm;
    const provider = (form.provider || 'gemini') as AIModel['provider'];
    const caps = form.capabilities || [];

    const patchSettings = (patch: Record<string, any>) =>
      setNewModelForm(p => ({ ...p, settings: { ...(p.settings || {}), ...patch } }));

    return (
      <Card className="border-dashed border-2 border-brand/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4" /> Novo Modelo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nome *</Label>
              <Input value={form.name || ''} onChange={e => setNewModelForm(p => ({ ...p, name: e.target.value }))} className="h-8 text-sm" placeholder="Ex.: Meu Modelo GPT" />
            </div>
            <div>
              <Label className="text-xs">Provedor *</Label>
              <Select value={provider} onValueChange={v => setNewModelForm(p => ({ ...p, provider: v as any, settings: { ...(p.settings || {}), apiModel: PROVIDER_SUGGESTIONS[v]?.[0] || '' } }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">Google Gemini</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="groq">Groq</SelectItem>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                  <SelectItem value="ollama">Ollama</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Descrição</Label>
            <Textarea value={form.description || ''} onChange={e => setNewModelForm(p => ({ ...p, description: e.target.value }))} className="text-sm min-h-[60px]" />
          </div>

          {providerRequiresApiKey(provider) && (
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1"><Key className="h-3 w-3" /> Chave de API *</Label>
              <div className="flex gap-2">
                <Input type={showNewApiKey ? 'text' : 'password'} value={form.apiKey || ''} onChange={e => setNewModelForm(p => ({ ...p, apiKey: e.target.value }))} className="h-8 text-sm font-mono flex-1" placeholder="sk-..." />
                <Button type="button" variant="outline" size="sm" onClick={() => setShowNewApiKey(v => !v)}>{showNewApiKey ? 'Ocultar' : 'Mostrar'}</Button>
                <Button type="button" variant="secondary" size="sm" disabled={fetchingModels['new']} onClick={() => handleFetchModels('new', provider, form.apiKey || '', (form.settings?.baseUrl as string) || '')}>
                  {fetchingModels['new'] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  <span className="ml-1 hidden sm:inline">Buscar Modelos</span>
                </Button>
              </div>
              {fetchModelError['new'] && <p className="text-xs text-destructive">{fetchModelError['new']}</p>}
            </div>
          )}

          {provider !== 'other' && (
            <div>
              <Label className="text-xs">Slug do Modelo (ID exato da API) *</Label>
              {fetchedModels['new']?.length > 0 ? (
                <Select value={(form.settings?.apiModel as string) || ''} onValueChange={v => patchSettings({ apiModel: v })}>
                  <SelectTrigger className="h-8 text-sm font-mono"><SelectValue placeholder="Selecione o modelo disponível" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {fetchedModels['new'].map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        <div><div className="text-sm font-mono">{m.id}</div>{m.name !== m.id && <div className="text-xs text-muted-foreground">{m.name}</div>}</div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <>
                  <Input value={(form.settings?.apiModel as string) || ''} onChange={e => patchSettings({ apiModel: e.target.value })} className="h-8 text-sm font-mono" placeholder={PROVIDER_SUGGESTIONS[provider]?.[0] || (provider === 'gemini' ? 'gemini-2.0-flash' : '')} />
                  <p className="text-xs text-muted-foreground mt-0.5">Insira a chave e clique em "Buscar Modelos" para ver a lista disponível.</p>
                  {PROVIDER_SUGGESTIONS[provider]?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {PROVIDER_SUGGESTIONS[provider].map(s => (
                        <button key={s} type="button" className="text-xs px-2 py-0.5 rounded bg-muted hover:bg-accent border text-muted-foreground" onClick={() => patchSettings({ apiModel: s })}>{s}</button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {provider === 'ollama' && (
            <div className="space-y-1">
              <Label className="text-xs">Base URL (Ollama)</Label>
              <div className="flex gap-2">
                <Input value={(form.settings?.baseUrl as string) || 'http://localhost:11434'} onChange={e => patchSettings({ baseUrl: e.target.value })} className="h-8 text-sm flex-1" />
                <Button type="button" variant="secondary" size="sm" disabled={fetchingModels['new']} onClick={() => handleFetchModels('new', 'ollama', '', (form.settings?.baseUrl as string) || 'http://localhost:11434')}>
                  {fetchingModels['new'] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                  <span className="ml-1 hidden sm:inline">Buscar Modelos</span>
                </Button>
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs mb-2 block">Capacidades (selecione as suportadas) *</Label>
            <div className="grid grid-cols-2 gap-2">
              {ALL_CAPABILITIES.map(cap => (
                <label key={cap.id} className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox checked={caps.includes(cap.id)} onCheckedChange={() => toggleNewCap(cap.id)} />
                  <span>{cap.label}</span>
                </label>
              ))}
            </div>
            {caps.length > 0 && (
              <div className="mt-2 rounded-md bg-blue-50 dark:bg-blue-950/40 p-2 text-xs text-blue-700 dark:text-blue-300">
                Templates disponíveis: {config?.promptTemplates.filter(t => caps.includes(t.task)).map(t => t.name).join(', ') || '—'}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Versão</Label>
              <Input value={form.version || '1.0'} onChange={e => setNewModelForm(p => ({ ...p, version: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="flex items-center gap-2 mt-5">
              <Switch checked={!!form.active} onCheckedChange={v => setNewModelForm(p => ({ ...p, active: v }))} />
              <Label className="text-xs">Ativo</Label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onClick={() => { setAddingModel(false); setNewModelForm({}); }}>Cancelar</Button>
            <Button size="sm" disabled={!form.name?.trim() || caps.length === 0} onClick={saveNewModel}>
              <Save className="h-3.5 w-3.5 mr-1" /> Adicionar Modelo
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="h-10 w-10 animate-spin text-brand" />
    </div>
  );

  const activeModelsWithKey = config?.models.filter(m => m.active && modelHasKey(m)).length ?? 0;

  return (
    <PermissionGuard requiredPermission="can_access_model_control">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Model Control Panel</h2>
            <p className="text-muted-foreground">Gerenciamento de modelos e templates de IA</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={resetConfig} className="flex items-center gap-2">
              <RefreshCcw className="h-4 w-4" /> Redefinir
            </Button>
            <Button onClick={saveConfigToSupabase} className="flex items-center gap-2">
              <Save className="h-4 w-4" /> Salvar
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={v => { const val = v as any; setActiveTab(val); setOpenSections({ models: val === 'models', templates: val === 'templates', tests: val === 'tests' }); }}>
          <TabsList className="bg-muted">
            <TabsTrigger value="models">Modelos</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="tests">Testes</TabsTrigger>
            <TabsTrigger value="settings">Configurações</TabsTrigger>
          </TabsList>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB: MODELOS                                                    */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <TabsContent value="models">
            <Collapsible open={openSections.models} onOpenChange={() => setOpenSections(s => ({ ...s, models: !s.models }))} className="border rounded-lg">
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-brand" />
                    <h3 className="text-lg font-semibold">Modelos</h3>
                    <Badge variant="secondary">{config?.models.length ?? 0} cadastrados</Badge>
                    <Badge variant="outline" className="text-green-600 border-green-600">{activeModelsWithKey} prontos</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="flex items-center gap-1" onClick={e => { e.stopPropagation(); startAddingModel(); }} disabled={!hasPermission('can_configure_ai_models')}>
                      <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Adicionar</span>
                    </Button>
                  </div>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent className="p-4 pt-0 space-y-3">
                {/* Add new model form */}
                {addingModel && renderNewModelForm()}

                {/* Model list */}
                <div className="space-y-1.5">
                  {config?.models.map(model => {
                    const isExpanded = expandedModelId === model.id;
                    const hasKey = modelHasKey(model);
                    const form = inlineForms[model.id];

                    return (
                      <Collapsible
                        key={model.id}
                        open={isExpanded}
                        onOpenChange={open => {
                          if (open) openInlineForm(model);
                          else closeInlineForm(model.id);
                        }}
                      >
                        <div className={`flex items-center gap-2 px-3 py-2.5 border rounded-lg ${isExpanded ? 'rounded-b-none border-b-0 bg-muted/30' : 'hover:bg-muted/20'} transition-colors`}>
                          {/* Toggle active */}
                          <Switch
                            checked={model.active}
                            onCheckedChange={checked => toggleModelActive(model, checked)}
                            disabled={!hasPermission('can_configure_ai_models')}
                          />
                          {/* Provider badge */}
                          <Badge variant="outline" className="flex-shrink-0 text-xs">{providerLabel(model.provider)}</Badge>
                          {/* Name + capabilities */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-sm truncate">{model.name}</span>
                              {hasKey && <span title="Chave configurada"><Check className="h-3 w-3 text-green-500 flex-shrink-0" /></span>}
                              {!model.active && <Badge variant="secondary" className="text-xs">Inativo</Badge>}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {model.capabilities.slice(0, 3).map(c => (
                                <span key={c} className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{capLabel(c)}</span>
                              ))}
                              {model.capabilities.length > 3 && (
                                <span className="text-xs text-muted-foreground">+{model.capabilities.length - 3}</span>
                              )}
                            </div>
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Testar" onClick={e => { e.stopPropagation(); setActiveTab('tests'); setOpenSections({ models: false, templates: false, tests: true }); testApiConnection(model.id); }}>
                              <Zap className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Excluir" onClick={e => { e.stopPropagation(); deleteModel(model.id); }} disabled={!hasPermission('can_configure_ai_models')}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!hasPermission('can_configure_ai_models')}>
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </Button>
                            </CollapsibleTrigger>
                          </div>
                        </div>
                        <CollapsibleContent>
                          {form && renderInlineForm(model.id)}
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>

                {/* Task Assignment */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2"><Bot className="h-4 w-4" /> Atribuição de Tarefas</CardTitle>
                    <CardDescription className="text-xs">Defina o modelo padrão para cada tipo de geração. "Automático" seleciona o melhor disponível com chave configurada.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {Object.entries(config?.tasks || {}).map(([task, modelId]) => (
                      <div key={task} className="flex items-center gap-3">
                        <Label className="w-40 text-xs flex-shrink-0">{TASK_LABELS[task] ?? task}</Label>
                        <Select value={modelId} onValueChange={v => setDefaultModelForTask(task as AIModelTask, v)}>
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">
                              <div className="flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-yellow-500" /> Automático (seleção inteligente)</div>
                            </SelectItem>
                            {config?.models
                              .filter(m => m.active && m.capabilities.includes(task) && modelHasKey(m))
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map(m => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.name} ✓
                                </SelectItem>
                              ))}
                            {config?.models.filter(m => m.active && m.capabilities.includes(task) && !modelHasKey(m)).length > 0 && (
                              <>
                                <div className="px-2 py-1 text-xs text-muted-foreground border-t mt-1 pt-1">Sem chave configurada</div>
                                {config?.models
                                  .filter(m => m.active && m.capabilities.includes(task) && !modelHasKey(m))
                                  .map(m => (
                                    <SelectItem key={m.id} value={m.id} className="opacity-60">
                                      {m.name} ⚠
                                    </SelectItem>
                                  ))}
                              </>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB: TEMPLATES                                                  */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <TabsContent value="templates">
            <Collapsible open={openSections.templates} onOpenChange={() => setOpenSections(s => ({ ...s, templates: !s.templates }))} className="border rounded-lg">
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    <h3 className="text-lg font-semibold">Templates</h3>
                    <Badge variant="secondary">{config?.promptTemplates.length ?? 0}</Badge>
                  </div>
                  <Button size="sm" onClick={e => { e.stopPropagation(); setEditingTemplateId('new'); setTemplateForm({ name: '', task: 'test-plan-generation', template: '', description: '', parameters: [], active: true }); }} disabled={!hasPermission('can_configure_ai_models')}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
                  </Button>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="p-4 pt-0 space-y-4">
                {/* Filters */}
                <div className="flex gap-3">
                  <div className="w-52">
                    <Label className="text-xs">Tarefa</Label>
                    <Select value={templateFilterTask} onValueChange={setTemplateFilterTask}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {Object.entries(TASK_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-40">
                    <Label className="text-xs">Status</Label>
                    <Select value={templateFilterStatus} onValueChange={v => setTemplateFilterStatus(v as any)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="active">Ativos</SelectItem>
                        <SelectItem value="inactive">Inativos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* New/Edit form */}
                {editingTemplateId && (
                  <Card className="border-dashed border-2">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">{editingTemplateId === 'new' ? 'Novo Template' : 'Editar Template'}</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Nome</Label>
                          <Input value={templateForm.name || ''} onChange={e => setTemplateForm(p => ({ ...p, name: e.target.value }))} className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-xs">Tarefa</Label>
                          <Select value={templateForm.task || 'test-plan-generation'} onValueChange={v => setTemplateForm(p => ({ ...p, task: v as any }))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(TASK_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Descrição</Label>
                        <Input value={templateForm.description || ''} onChange={e => setTemplateForm(p => ({ ...p, description: e.target.value }))} className="h-8 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs">Template (use {`{{variavel}}`} para parâmetros)</Label>
                        <Textarea value={templateForm.template || ''} onChange={e => setTemplateForm(p => ({ ...p, template: e.target.value }))} className="text-sm min-h-[140px] font-mono" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={!!templateForm.active} onCheckedChange={v => setTemplateForm(p => ({ ...p, active: v }))} />
                        <Label className="text-xs">Ativo</Label>
                      </div>
                      <div className="flex justify-end gap-2 pt-2 border-t">
                        <Button variant="outline" size="sm" onClick={() => { setEditingTemplateId(null); setTemplateForm({}); }}>Cancelar</Button>
                        <Button size="sm" onClick={saveTemplate}><Save className="h-3.5 w-3.5 mr-1" /> Salvar</Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Template list */}
                <div className="space-y-2">
                  {config?.promptTemplates
                    .filter(t => (templateFilterTask === 'all' || t.task === templateFilterTask) && (templateFilterStatus === 'all' || (templateFilterStatus === 'active' ? t.active : !t.active)))
                    .map(t => (
                      <div key={t.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/20">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{t.name}</span>
                            <Badge variant="outline" className="text-xs">{TASK_LABELS[t.task] ?? t.task}</Badge>
                            {t.active ? <Badge className="text-xs bg-green-100 text-green-800 border-green-200">Ativo</Badge> : <Badge variant="secondary" className="text-xs">Inativo</Badge>}
                          </div>
                          {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                          {t.parameters?.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {t.parameters.map(p => <code key={p} className="text-xs bg-muted px-1 rounded">{`{{${p}}}`}</code>)}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Switch checked={t.active} onCheckedChange={() => { const upd = ModelControlService.updatePromptTemplate(t.id, { active: !t.active }); if (upd && config) setConfig({ ...config, promptTemplates: config.promptTemplates.map(x => x.id === upd.id ? upd : x) }); }} />
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicateTemplate(t)}><Copy className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingTemplateId(t.id); setTemplateForm({ ...t }); }}><FileText className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTemplate(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB: TESTES                                                     */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <TabsContent value="tests">
            <Collapsible open={openSections.tests} onOpenChange={() => setOpenSections(s => ({ ...s, tests: !s.tests }))} className="border rounded-lg">
              <CollapsibleTrigger asChild>
                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50">
                  <div className="flex items-center gap-2"><Zap className="h-5 w-5 text-yellow-500" /><h3 className="text-lg font-semibold">Testar Conexão</h3></div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="p-4 pt-0 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Modelo para Teste</Label>
                    <Select value={testModelId} onValueChange={setTestModelId}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto"><div className="flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-yellow-500" /> Automático</div></SelectItem>
                        {config?.models.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name} ({providerLabel(m.provider)}){modelHasKey(m) ? ' ✓' : ' ⚠'}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Chave de API (opcional — sobrescreve a configurada)</Label>
                    <Input type="password" value={testApiKey} onChange={e => setTestApiKey(e.target.value)} placeholder="Deixe em branco para usar a chave salva" className="h-9" />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Prompt de Teste</Label>
                  <Textarea value={testPrompt} onChange={e => setTestPrompt(e.target.value)} className="min-h-[80px] text-sm" />
                </div>

                <Button onClick={() => testApiConnection()} disabled={testLoading || !hasPermission('can_test_ai_connections')} className="w-full">
                  {testLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testando...</> : <><Zap className="h-4 w-4 mr-2" /> Testar Conexão</>}
                </Button>

                {testResult && (
                  <Alert variant={testResult.success ? 'default' : 'destructive'} className={testResult.success ? 'border-green-500 bg-green-50 dark:bg-green-950/20' : ''}>
                    <div className="flex items-start gap-2">
                      {testResult.success ? <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
                      <AlertDescription className="text-sm">
                        <p className="font-medium">{testResult.message}</p>
                        {testResult.modelUsed && <p className="text-xs opacity-70 mt-0.5">Modelo: {testResult.modelUsed}</p>}
                        {testResult.response && <pre className="mt-2 p-2 bg-background/60 rounded text-xs whitespace-pre-wrap border">{testResult.response}</pre>}
                        {testResult.error && <p className="mt-1 text-xs font-mono opacity-80">{testResult.error}</p>}
                      </AlertDescription>
                    </div>
                  </Alert>
                )}
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>

          {/* ═══════════════════════════════════════════════════════════════ */}
          {/* TAB: CONFIGURAÇÕES                                                   */}
          {/* ═══════════════════════════════════════════════════════════════ */}
          <TabsContent value="settings">
            <div className="border rounded-lg p-5 space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-1">Geração em Lote</h3>
                <p className="text-xs text-muted-foreground mb-4">Controla o modo padrão ao abrir o gerador de IA nas páginas.</p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">Gerar planos em lote</Label>
                      <p className="text-xs text-muted-foreground">Habilita o modo lote para Planos de Teste no gerador IA</p>
                    </div>
                    <Switch
                      checked={aiSettings.batchGenerationEnabled}
                      onCheckedChange={v => updateAISettings({ batchGenerationEnabled: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">Gerar casos em lote</Label>
                      <p className="text-xs text-muted-foreground">Habilita o modo lote para Casos de Teste no gerador IA</p>
                    </div>
                    <Switch
                      checked={aiSettings.batchCaseGenerationEnabled}
                      onCheckedChange={v => updateAISettings({ batchCaseGenerationEnabled: v })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-1">Modelo Preferido</h3>
                <p className="text-xs text-muted-foreground mb-3">Modelo padrão selecionado automaticamente ao abrir o gerador.</p>
                <Select
                  value={aiSettings.preferredModel || 'default'}
                  onValueChange={v => updateAISettings({ preferredModel: v })}
                >
                  <SelectTrigger className="h-8 text-sm w-64">
                    <SelectValue placeholder="Automático" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Automático (seleção inteligente)</SelectItem>
                    {(config?.models || []).filter(m => m.active).map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name} <span className="text-muted-foreground ml-1">({providerLabel(m.provider)})</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PermissionGuard>
  );
};
