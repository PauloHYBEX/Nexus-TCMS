import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import { Sparkles, Loader2, Zap, ChevronsUpDown, Check, FileText } from 'lucide-react';
import { getTestPlans, getTestCases, createTestPlan, createTestCase, createTestExecution } from '@/services/supabaseService';
import { TestPlan, TestCase, AIModelTask, AIModel } from '@/types';
import * as ModelControlService from '@/services/modelControlService';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { useAISettings } from '@/hooks/useAISettings';
import { useProject } from '@/contexts/ProjectContext';

interface AIGeneratorFormProps {
  onSuccess?: (data: any) => void;
  initialType?: 'plan' | 'case' | 'execution';
}

export const AIGeneratorForm = ({ onSuccess, initialType = 'plan' }: AIGeneratorFormProps) => {
  const { user } = useAuth();
  const { settings, updateSettings } = useAISettings();
  const { currentProject } = useProject();
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [plans, setPlans] = useState<TestPlan[]>([]);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [formData, setFormData] = useState({
    type: initialType,
    description: '',
    context: '',
    requirements: '',
    planId: '',
    caseId: '',
    selectedModel: 'default'
  });
  const [file, setFile] = useState<File | null>(null);

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
      const activeModels = config.models.filter(model => model.active);
      setAvailableModels(activeModels);
    } catch (error) {
      console.error('Erro ao carregar modelos:', error);
    }
  };

  // Aplicar modelo preferido salvo nas configurações quando os modelos estiverem disponíveis
  useEffect(() => {
    const preferred = settings?.preferredModel || 'default';
    setFormData(prev => {
      const exists = preferred === 'default' || availableModels.some(m => m.id === preferred);
      if (!exists) return prev;
      if (prev.selectedModel === preferred) return prev;
      return { ...prev, selectedModel: preferred };
    });
  }, [availableModels, settings?.preferredModel]);

  const providerRequiresApiKey = (provider?: string) => {
    if (!provider) return false;
    return ['openai', 'anthropic', 'groq', 'gemini'].includes(provider);
  };

  const selectedModelObj = formData.selectedModel === 'default'
    ? undefined
    : availableModels.find(m => m.id === formData.selectedModel);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      if (selectedFile.type === 'text/plain') {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = (event.target?.result as string) || '';
          setFormData(prev => ({ ...prev, requirements: content }));
        };
        reader.readAsText(selectedFile);
      } else {
        toast({
          title: 'Aviso',
          description: 'Para arquivos que não são texto puro, cole o conteúdo manualmente nos campos abaixo (ex.: Requisitos Específicos).',
          variant: 'default'
        });
      }
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
      // Resolver modelo efetivo:
      // 1) Se o usuário selecionou explicitamente, usa o selecionado
      // 2) Caso contrário, usa o defaultModel da configuração ("base")
      // 3) Fallback: mapeamento por tarefa
      // 4) Fallback final: primeiro modelo ativo
      const config = ModelControlService.loadConfig();
      const modelId = (() => {
        if (formData.selectedModel && formData.selectedModel !== 'default') return formData.selectedModel;
        if (config?.defaultModel) return config.defaultModel;
        const mapped = config?.tasks?.[taskType];
        if (mapped) return mapped as string;
        const firstActive = config?.models?.find(m => m.active)?.id;
        return firstActive;
      })();

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
          const newPlan = await createTestPlan({
            ...payload,
            user_id: user.id,
            project_id: currentProject.id,
            generated_by_ai: true
          });
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

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Gerador de Testes com IA
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading} aria-describedby={lastError ? 'ai-error-details' : undefined}>
          {currentProject?.name ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Projeto: {currentProject.name}</Badge>
            </div>
          ) : (
            <div className="text-sm text-amber-600">Selecione um projeto no topo antes de gerar.</div>
          )}
          <div>
            <Label htmlFor="file-upload">Upload de Documento (Opcional)</Label>
            <div className="flex items-center gap-4">
              <Input
                id="file-upload"
                type="file"
                accept=".txt,.md,.doc,.docx,.pdf,.xlsx,.xls"
                onChange={handleFileChange}
                className="flex-1"
              />
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <FileText className="h-4 w-4" />
                .txt, .md, .doc, .docx, .pdf, .xlsx, .xls
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="type">Tipo de Geração *</Label>
            <Select value={formData.type} onValueChange={(value) => handleChange('type', value)} required>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="plan">Plano de Teste</SelectItem>
                <SelectItem value="case">Caso de Teste</SelectItem>
                <SelectItem value="execution">Execução de Teste</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="selectedModel" className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-500" />
              Modelo de IA
              <Badge variant="outline" className="text-xs">Opcional</Badge>
            </Label>
            <Popover open={modelPickerOpen} onOpenChange={setModelPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={modelPickerOpen}
                  className="w-full justify-between"
                >
                  {formData.selectedModel === 'default' ? (
                    'Modelo Padrão (Recomendado)'
                  ) : (
                    <span className="flex items-center gap-2">
                      <span>{selectedModelObj?.name || 'Modelo selecionado'}</span>
                      {selectedModelObj && (
                        <Badge variant="outline" className="text-xs capitalize">
                          {selectedModelObj.provider}
                        </Badge>
                      )}
                    </span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Buscar modelo..." />
                  <CommandList>
                    <CommandEmpty>Nenhum modelo encontrado.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        key="default"
                        value="default"
                        onSelect={() => {
                          handleChange('selectedModel', 'default');
                          setModelPickerOpen(false);
                        }}
                      >
                        <Check className={cn('mr-2 h-4 w-4', formData.selectedModel === 'default' ? 'opacity-100' : 'opacity-0')} />
                        Modelo Padrão (Recomendado)
                        <span
                          className="ml-auto flex items-center gap-2"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            aria-label="Definir como padrão"
                            checked={(settings?.preferredModel || 'default') === 'default'}
                            onCheckedChange={(checked) => {
                              const isChecked = checked === true;
                              if (isChecked) {
                                updateSettings({ preferredModel: 'default' });
                                toast({ title: 'Preferência salva', description: 'Modelo padrão do sistema selecionado.' });
                              } else {
                                // Manter como default; desmarcar não define outro modelo
                                updateSettings({ preferredModel: 'default' });
                              }
                            }}
                          />
                          <span className="text-xs text-muted-foreground">Padrão</span>
                        </span>
                      </CommandItem>
                      {availableModels.map(model => (
                        <CommandItem
                          key={model.id}
                          value={`${model.name} ${model.provider}`}
                          onSelect={() => {
                            handleChange('selectedModel', model.id);
                            setModelPickerOpen(false);
                          }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', formData.selectedModel === model.id ? 'opacity-100' : 'opacity-0')} />
                          <span className="flex items-center gap-2">
                            <span>{model.name}</span>
                            <Badge variant="outline" className="text-xs capitalize">{model.provider}</Badge>
                            {model.capabilities?.includes(
                              formData.type === 'plan' ? 'test-plan-generation' : 
                              formData.type === 'case' ? 'test-case-generation' : 
                              'test-execution-generation'
                            ) && (
                              <Badge variant="outline" className="text-green-600 text-xs">Otimizado</Badge>
                            )}
                          </span>
                          <span
                            className="ml-auto flex items-center gap-2"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              aria-label="Definir como padrão"
                              checked={(settings?.preferredModel || 'default') === model.id}
                              onCheckedChange={(checked) => {
                                const isChecked = checked === true;
                                if (isChecked) {
                                  updateSettings({ preferredModel: model.id });
                                  toast({ title: 'Preferência salva', description: `Modelo "${model.name}" definido como padrão.` });
                                } else {
                                  updateSettings({ preferredModel: 'default' });
                                }
                              }}
                            />
                            <span className="text-xs text-muted-foreground">Padrão</span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-sm text-gray-500 mt-1">
              Escolha um modelo específico ou deixe em branco para usar o <strong>modelo base</strong> configurado no Painel de Modelos.
            </p>
            {selectedModelObj && providerRequiresApiKey(selectedModelObj.provider) && (
              <p className="text-xs text-amber-600 mt-1">Este provedor requer uma chave de API configurada no Painel de Modelos.</p>
            )}
          </div>

          {formData.type === 'execution' && (
            <>
              <div>
                <Label htmlFor="planId">Plano de Teste *</Label>
                <Select value={formData.planId} onValueChange={(value) => handleChange('planId', value)} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um plano" />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="caseId">Caso de Teste *</Label>
                <Select 
                  value={formData.caseId} 
                  onValueChange={(value) => handleChange('caseId', value)} 
                  required
                  disabled={!formData.planId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um caso" />
                  </SelectTrigger>
                  <SelectContent>
                    {cases.map((testCase) => (
                      <SelectItem key={testCase.id} value={testCase.id}>
                        {testCase.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {formData.type === 'case' && (
            <div>
              <Label htmlFor="planId">Plano de Teste (Opcional)</Label>
              <Select value={formData.planId} onValueChange={(value) => handleChange('planId', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um plano (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label htmlFor="description">
              {formData.type === 'execution' 
                ? 'Contexto da Execução *' 
                : 'Descrição do Sistema/Funcionalidade *'
              }
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={4}
              placeholder={
                formData.type === 'execution'
                  ? "Descreva o contexto da execução, ambiente de teste, etc."
                  : "Descreva o sistema ou funcionalidade que será testada"
              }
              required
            />
          </div>

          <div>
            <Label htmlFor="context">Contexto Adicional</Label>
            <Textarea
              id="context"
              value={formData.context}
              onChange={(e) => handleChange('context', e.target.value)}
              rows={3}
              placeholder="Forneça informações adicionais sobre o contexto, tecnologias utilizadas, etc."
            />
          </div>

          {formData.type !== 'execution' && (
            <div>
              <Label htmlFor="requirements">Requisitos Específicos</Label>
              <Textarea
                id="requirements"
                value={formData.requirements}
                onChange={(e) => handleChange('requirements', e.target.value)}
                rows={3}
                placeholder="Liste requisitos específicos ou cenários que devem ser cobertos"
              />
            </div>
          )}

          <div className="flex justify-end">
            <Button 
              type="submit" 
              disabled={loading || !currentProject?.id || (formData.type === 'execution' && (!formData.planId || !formData.caseId))} 
              className="min-w-[200px]"
              aria-busy={loading}
              aria-live="polite"
              aria-label={loading ? 'Gerando com IA, aguarde' : 'Gerar com IA'}
              role={loading ? 'status' : undefined}
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
          </div>
          {lastError && (
            <div
              id="ai-error-details"
              role="alert"
              className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              <p className="font-medium">Falha na geração/validação do schema</p>
              <pre className="whitespace-pre-wrap break-words mt-1">{lastError}</pre>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
};
