import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import { Sparkles, Loader2, Zap, FileText, FlaskConical, Play, Upload, AlertCircle } from 'lucide-react';
import { getTestPlans, getTestCases, createTestPlan, createTestCase, createTestExecution, createRequirement, linkCaseToRequirement } from '@/services/supabaseService';
import { TestPlan, TestCase, AIModelTask, AIModel } from '@/types';
import * as ModelControlService from '@/services/modelControlService';
import { cn } from '@/lib/utils';
import { useAISettings } from '@/hooks/useAISettings';
import { useProject } from '@/contexts/ProjectContext';

interface AIGeneratorFormProps {
  onSuccess?: (data: any) => void;
  initialType?: 'plan' | 'case' | 'execution';
}

export const AIGeneratorForm = ({ onSuccess, initialType = 'plan' }: AIGeneratorFormProps) => {
  const { user } = useAuth();
  const { settings } = useAISettings();
  const { currentProject } = useProject();
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  const [formData, setFormData] = useState({
    type: initialType,
    description: '',
    context: '',
    requirements: '',
    planId: '',
    caseId: '',
    selectedModel: 'auto'
  });
  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<{ name: string; dataUrl: string }[]>([]);

  useEffect(() => {
    if (user) {
      loadPlans();
      loadAvailableModels();
    }
  }, [user, currentProject?.id]);

  useEffect(() => {
    if (formData.planId && formData.type === 'execution') {
      loadCases(formData.planId);
    }
  }, [formData.planId, formData.type]);

  const loadPlans = async () => {
    try {
      const data = await getTestPlans(user!.id, currentProject?.id);
      setPlans(data);
    } catch (error) {
      console.error('Erro ao carregar planos:', error);
    }
  };

  const loadAvailableModels = () => {
    try {
      const config = ModelControlService.loadConfig();
      // Show active models; mark which ones have a key configured
      const activeModels = config.models.filter(model => model.active);
      setAvailableModels(activeModels);
    } catch (error) {
      console.error('Erro ao carregar modelos:', error);
    }
  };

  // Aplicar modelo preferido salvo nas configurações quando os modelos estiverem disponíveis
  useEffect(() => {
    const preferred = settings?.preferredModel || 'auto';
    setFormData(prev => {
      const exists = preferred === 'auto' || availableModels.some(m => m.id === preferred);
      if (!exists) return prev;
      if (prev.selectedModel === preferred) return prev;
      return { ...prev, selectedModel: preferred };
    });
  }, [availableModels, settings?.preferredModel]);

  const providerRequiresApiKey = (provider?: string) => {
    if (!provider) return false;
    return ['openai', 'anthropic', 'groq', 'gemini', 'openrouter'].includes(provider);
  };

  // Detect if a model has a key stored
  const modelHasKey = (model: AIModel): boolean => {
    if (model.provider === 'ollama') return true;
    try {
      const host = window.location.hostname;
      const keys = JSON.parse(localStorage.getItem(`${host}_mcp_api_keys`) || localStorage.getItem('mcp_api_keys') || '{}');
      return Boolean(keys[model.id] || model.apiKey);
    } catch { return Boolean(model.apiKey); }
  };

  const selectedModelObj = (formData.selectedModel === 'auto' || formData.selectedModel === 'default')
    ? undefined
    : availableModels.find(m => m.id === formData.selectedModel);

  const extractDocumentViaServer = async (selectedFile: File) => {
    const token = localStorage.getItem('krg_local_auth_token');
    const form = new FormData();
    form.append('file', selectedFile);
    const res = await fetch('/api/documents/extract', {
      method: 'POST',
      body: form,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error((await res.json()).error?.message || 'Erro ao extrair documento');
    return res.json() as Promise<{ text: string; images: { name: string; dataUrl: string }[]; filename: string; format: string }>;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setImages([]);
    const ext = selectedFile.name.toLowerCase().split('.').pop() || '';
    const isPlainText = selectedFile.type === 'text/plain' || ext === 'txt' || ext === 'md';
    // Arquivos de texto puro: ler diretamente no browser
    if (isPlainText) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = (event.target?.result as string) || '';
        setFormData(prev => ({ ...prev, requirements: content }));
        toast({ title: 'Documento carregado', description: `${selectedFile.name} carregado com sucesso.` });
      };
      reader.readAsText(selectedFile);
      return;
    }
    // Todos os demais formatos (PPTX, PDF, DOCX, DOC, etc.): enviar para o servidor
    try {
      const { text, images: extractedImages, format } = await extractDocumentViaServer(selectedFile);
      setFormData(prev => ({ ...prev, requirements: text }));
      if (extractedImages?.length > 0) {
        setImages(extractedImages);
        toast({
          title: 'Documento analisado',
          description: `${extractedImages.length} imagem(s) e texto extraídos de ${selectedFile.name}.`
        });
      } else {
        toast({ title: 'Documento carregado', description: `${selectedFile.name} (${format?.toUpperCase()}) analisado com sucesso.` });
      }
    } catch (err: any) {
      toast({ title: 'Erro ao processar', description: err?.message || 'Falha ao extrair conteúdo.', variant: 'destructive' });
    }
  };

  const loadCases = async (planId: string) => {
    try {
      const data = await getTestCases(user!.id, planId);
      setCases(data);
    } catch (error) {
      console.error('Erro ao carregar casos:', error);
    }
  };

  const generateWithAI = async () => {
    if (!user) return null;
    if (!currentProject?.id) throw new Error('Selecione um projeto antes de gerar.');

    const taskType: AIModelTask = 
      formData.type === 'plan' ? 'test-plan-generation' : 
      formData.type === 'case' ? 'test-case-generation' : 
      'test-execution-generation';

    // Mapear variáveis conforme templates padrão
    const variables: any = {
      // Para plano: o template usa appDescription/additionalContext
      appDescription: formData.description,
      additionalContext: formData.context,
      requirements: formData.requirements,
      // Incluir imagens extraídas do PPTX para análise visual pela IA
      images: images.length > 0 ? images.map(img => img.dataUrl) : undefined,
    };

    if (formData.type === 'execution') {
      // Buscar detalhes do caso e plano selecionados
      const selectedCase = cases.find(c => c.id === formData.caseId);
      const selectedPlan = plans.find(p => p.id === formData.planId);
      
      if (!selectedCase || !selectedPlan) {
        throw new Error('Caso ou plano de teste não encontrado');
      }
      
      variables.testCase = selectedCase;
      variables.testPlan = selectedPlan;
      // Enriquecer prompt com contexto explícito da execução
      variables.executionContext = formData.description;
      variables.additionalContext = formData.context;
    } else if (formData.type === 'case' && formData.planId) {
      const selectedPlan = plans.find(p => p.id === formData.planId);
      if (selectedPlan) {
        variables.testPlan = selectedPlan;
        // Template aceita numCases, mas por padrão geraremos 1
        variables.numCases = 1;
      }
    }

    try {
      // 'auto' → let executeTask use selectBestModelForTask internally
      const modelId = (formData.selectedModel && formData.selectedModel !== 'auto' && formData.selectedModel !== 'default')
        ? formData.selectedModel
        : 'auto';

      const effectiveTotal = 1; // gerar apenas 1 item por vez neste formulário
      const results: any[] = [];

      for (let i = 0; i < effectiveTotal; i++) {
        // Para evitar respostas agregadas, pedimos 1 item por iteração
        if (formData.type === 'case') {
          variables.numCases = 1;
        }

        // Usar ModelControlService para gerar o conteúdo com AI
        const result = await ModelControlService.executeTask(
          taskType,
          variables,
          modelId || undefined
        );
        const payload = (typeof result === 'object' && result !== null) ? (result as any) : {};

        if (formData.type === 'plan') {
          // Debug: mostra o que a IA retornou (campo branches em especial)
          console.log('[AI Plan] payload recebido:', {
            title: payload?.title,
            branches: payload?.branches,
            hasBranches: !!payload?.branches,
            keys: Object.keys(payload || {}),
          });
          const newPlan = await createTestPlan({
            ...payload,
            user_id: user.id,
            project_id: currentProject.id,
            generated_by_ai: true
          });
          console.log('[AI Plan] plano salvo no DB:', { id: newPlan.id, branches: (newPlan as any).branches });
          results.push({ ...newPlan, type: 'plan' });
        } else if (formData.type === 'case') {
          // Alguns templates podem retornar um array ou um objeto com `cases`
          const source: any = Array.isArray(payload)
            ? (payload as any[])[0]
            : Array.isArray((payload as any)?.cases)
              ? (payload as any).cases[0]
              : payload;

          const newCase = await createTestCase({
            title: (source as any)?.title,
            description: (source as any)?.description,
            preconditions: (source as any)?.preconditions,
            expected_result: (source as any)?.expected_result,
            priority: (source as any)?.priority,
            type: (source as any)?.type,
            steps: (source as any)?.steps,
            plan_id: formData.planId || null,
            user_id: user.id,
            project_id: currentProject.id,
            generated_by_ai: true
          } as any);
          // Auto-criar requisito + vínculo para o caso gerado
          try {
            const newReq = await createRequirement({
              user_id: user.id,
              project_id: currentProject.id,
              title: newCase.title,
              description: `Requisito gerado automaticamente a partir do caso: ${newCase.title}`,
              priority: (newCase.priority || 'medium') as any,
              status: 'open',
            } as any);
            await linkCaseToRequirement(user.id, newReq.id, newCase.id);
          } catch (err) {
            console.warn('[AI Case] falha ao criar requisito automatico:', err);
          }
          results.push({ ...newCase, type: 'case' });
        } else if (formData.type === 'execution') {
          const newExecution = await createTestExecution({
            status: (payload as any).status,
            actual_result: (payload as any).actual_result,
            notes: (payload as any).notes,
            plan_id: formData.planId,
            case_id: formData.caseId,
            user_id: user.id,
            executed_by: user.id
          });
          results.push({ ...newExecution, type: 'execution' });
        }
      }

      return results.length === 1 ? results[0] : results;
    } catch (error) {
      console.error('Erro ao gerar com IA:', error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setLastError(null);
    try {
      const result = await generateWithAI();

      toast({
        title: "Sucesso",
        description: `${formData.type === 'plan' ? 'Plano' : formData.type === 'case' ? 'Caso' : 'Execução'} de teste gerado com IA!`
      });

      onSuccess?.(result);
    } catch (error: any) {
      console.error('Erro ao gerar com IA:', error);
      const message: string = error?.message || 'Erro ao gerar conteúdo com IA. Verifique a chave da API e o schema de saída.';
      setLastError(message);
      toast({
        title: "Erro",
        description: message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const TYPE_OPTIONS = [
    { value: 'plan' as const, label: 'Plano de Teste', icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/40' },
    { value: 'case' as const, label: 'Caso de Teste', icon: FlaskConical, color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/40' },
    { value: 'execution' as const, label: 'Execução', icon: Play, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/40' },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4 overflow-x-hidden" aria-busy={loading}>
      {/* Top bar: project + file upload */}
      <div className="flex items-center justify-between pb-3 border-b border-border/50">
        <div>
          {currentProject?.name ? (
            <Badge variant="secondary" className="gap-1.5 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
              {currentProject.name}
            </Badge>
          ) : (
            <span className="text-xs text-amber-500 flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              Selecione um projeto antes de gerar
            </span>
          )}
        </div>
      <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded-md px-2.5 py-1.5 transition-colors" title="Aceita .txt, .md, .doc, .docx, .pdf, .xlsx, .xls, .pptx">
          <Upload className="h-3.5 w-3.5" />
          {file ? <span className="max-w-[140px] truncate">{file.name}</span> : 'Importar documento'}
          <input type="file" className="sr-only" accept=".txt,.md,.doc,.docx,.pdf,.xlsx,.xls,.pptx" onChange={handleFileChange} />
        </label>
      </div>

      {/* Type selector pills */}
      <div className="flex gap-2">
        {TYPE_OPTIONS.map(({ value, label, icon: Icon, color, bg }) => (
          <button
            key={value}
            type="button"
            onClick={() => handleChange('type', value)}
            className={cn(
              'flex items-center gap-1.5 flex-1 justify-center py-2 px-3 rounded-lg text-xs font-medium border transition-all',
              formData.type === value ? `${bg} ${color}` : 'border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* 2-column main body */}
      <div className="grid grid-cols-2 gap-5">

        {/* LEFT — primary inputs */}
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-medium mb-1.5 block">
              {formData.type === 'execution' ? 'Contexto da Execução' : 'Descrição do Sistema / Funcionalidade'}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={formData.type === 'execution' ? 4 : 5}
              className="text-sm resize-none"
              placeholder={
                formData.type === 'execution'
                  ? 'Descreva o contexto e ambiente de execução...'
                  : 'Descreva o sistema ou funcionalidade que será testada'
              }
              required
            />
          </div>

          {formData.type !== 'execution' && (
            <div>
              <Label className="text-xs font-medium mb-1.5 block">Requisitos / Cenários a Cobrir</Label>
              <Textarea
                value={formData.requirements}
                onChange={(e) => handleChange('requirements', e.target.value)}
                rows={3}
                className="text-sm resize-none"
                placeholder="Liste requisitos ou cenários específicos a serem cobertos..."
              />
            </div>
          )}

          {/* Preview das imagens extraídas do PPTX */}
          {images.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">Imagens do documento ({images.length})</Label>
                <button
                  type="button"
                  onClick={() => setImages([])}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                >
                  Remover imagens
                </button>
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-muted/30 rounded-md">
                {images.map((img, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={img.dataUrl}
                      alt={`Imagem ${idx + 1}`}
                      className="h-16 w-16 object-cover rounded border border-border/60"
                      title={img.name}
                    />
                    <span className="absolute -top-1 -right-1 h-4 w-4 bg-brand text-white text-[10px] rounded-full flex items-center justify-center">
                      {idx + 1}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Estas imagens serão enviadas junto com o texto para análise pela IA.
              </p>
            </div>
          )}

          {formData.type === 'execution' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-medium mb-1.5 block">
                  Plano <span className="text-destructive">*</span>
                </Label>
                <Select value={formData.planId} onValueChange={(v) => handleChange('planId', v)} required>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecionar plano" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium mb-1.5 block">
                  Caso <span className="text-destructive">*</span>
                </Label>
                <Select value={formData.caseId} onValueChange={(v) => handleChange('caseId', v)} required disabled={!formData.planId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecionar caso" />
                  </SelectTrigger>
                  <SelectContent>
                    {cases.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">{c.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {formData.type === 'case' && (
            <div>
              <Label className="text-xs font-medium mb-1.5 block">
                Vincular ao Plano <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Select value={formData.planId} onValueChange={(v) => handleChange('planId', v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Sem plano associado" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* RIGHT — context, model, action */}
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Contexto Adicional</Label>
            <Textarea
              value={formData.context}
              onChange={(e) => handleChange('context', e.target.value)}
              rows={4}
              className="text-sm resize-none"
              placeholder="Tecnologias, padrões, restrições, ambiente..."
            />
          </div>

          <div>
            <Label className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              Modelo de IA
              <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Select value={formData.selectedModel} onValueChange={(v) => handleChange('selectedModel', v)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto" className="text-xs">
                  <span className="flex items-center gap-1.5">✨ Automático (seleção inteligente)</span>
                </SelectItem>
                {availableModels.map((m) => {
                  const task = formData.type === 'plan' ? 'test-plan-generation' : formData.type === 'case' ? 'test-case-generation' : 'test-execution-generation';
                  const hasCap = m.capabilities?.includes(task);
                  const hasKey = modelHasKey(m);
                  return (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.name}{hasCap && hasKey ? ' ✓' : hasCap && !hasKey ? ' ⚠' : ''}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {selectedModelObj && providerRequiresApiKey(selectedModelObj.provider) && (
              <p className="text-xs text-amber-500 mt-1">⚠ Requer API key no Painel de Modelos</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading || !currentProject?.id || (formData.type === 'execution' && (!formData.planId || !formData.caseId))}
            className="w-full"
            aria-busy={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Gerar com IA
              </>
            )}
          </Button>

          {lastError && (
            <div
              id="ai-error-details"
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
            >
              <p className="font-medium flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" /> Falha na geração
              </p>
              <p className="mt-1 break-words opacity-80 line-clamp-4">{lastError}</p>
            </div>
          )}
        </div>
      </div>
    </form>
  );
};
