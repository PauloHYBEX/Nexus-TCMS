import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { Sparkles, Loader2, Zap, Upload, AlertCircle } from 'lucide-react';
import { AIModel } from '@/types';
import * as ModelControlService from '@/services/modelControlService';
import { useAISettings } from '@/hooks/useAISettings';
import { useProject } from '@/contexts/ProjectContext';

interface AIBatchGeneratorFormProps {
  onSuccess?: (data: any) => void;
  type?: 'plan' | 'case';
  // mode:
  // - 'standard': comportamento atual (plan -> vários planos, case -> vários casos)
  // - 'plan-with-cases': gera um único plano com múltiplos casos a partir do documento/tabela
  mode?: 'standard' | 'plan-with-cases';
}

export const AIBatchGeneratorForm = ({ onSuccess, type = 'plan', mode = 'standard' }: AIBatchGeneratorFormProps) => {
  const { user } = useAuth();
  const { settings } = useAISettings();
  const { currentProject } = useProject();
  const [loading, setLoading] = useState(false);
  const [documentContent, setDocumentContent] = useState('');
  const [context, setContext] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selectedModel, setSelectedModel] = useState('default');
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);

  // Persistência de estado do formulário para evitar perda em reloads involuntários
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ai-batch-form-state');
      if (saved) {
        const s = JSON.parse(saved);
        if (typeof s?.documentContent === 'string') setDocumentContent(s.documentContent);
        if (typeof s?.context === 'string') setContext(s.context);
        if (typeof s?.selectedModel === 'string') setSelectedModel(s.selectedModel);
      }
    } catch (e) {
      console.warn('Falha ao restaurar estado do formulário:', e);
    }
  }, []);

  useEffect(() => {
    try {
      const payload = { documentContent, context, selectedModel };
      localStorage.setItem('ai-batch-form-state', JSON.stringify(payload));
    } catch (e) { /* noop: falha ao persistir estado não deve quebrar a UI */ }
  }, [documentContent, context, selectedModel]);

  useEffect(() => {
    loadAvailableModels();
  }, []);

  const loadAvailableModels = () => {
    try {
      const config = ModelControlService.loadConfig();
      const activeModels = config.models.filter(model => model.active);
      setAvailableModels(activeModels);
    } catch (error) {
      console.error('Erro ao carregar modelos:', error);
    }
  };

  // Sanitização básica para evitar caracteres especiais indesejados (ex.: aspas curvas, bullets, emojis)
  const sanitizeText = (txt?: string) => {
    if (!txt) return '';
    let s = txt
      .replace(/[\u2018\u2019\u201C\u201D]/g, '"') // aspas curvas para aspas duplas simples
      .replace(/[\u2013\u2014]/g, '-') // travessões diversos para hífen
      .replace(/[\u2022\u25CF\u25A0\u2219]/g, '-') // bullets em hífen
      .replace(/[\u00A0]/g, ' ') // espaço não separável
      .replace(/[\t ]+/g, ' '); // colapsa espaços
    // remove caracteres de controle e emojis fora dos intervalos comuns
    // eslint-disable-next-line no-control-regex
    s = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '');
    return s.trim();
  };

  // Helpers para normalizar/parsear respostas da IA
  function tryJson(txt: string): any | undefined {
    try { return JSON.parse(txt); } catch { return undefined; }
  }

  function extractFromString(s: string): any | undefined {
    if (!s) return;
    // Bloco cercado por ```json ... ```
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence && fence[1]) {
      const parsed = tryJson(fence[1]);
      if (parsed) return parsed;
    }
    // Primeiro '{' até o último '}'
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      const parsed = tryJson(s.slice(first, last + 1));
      if (parsed) return parsed;
    }
    // Tenta parse direto
    return tryJson(s.trim());
  }

  function extractAndParseJSON(raw: any): any {
    if (raw == null) return {};
    if (typeof raw === 'string') {
      const parsed = extractFromString(raw);
      return parsed ?? {};
    }
    if (typeof raw === 'object') {
      // Candidatos comuns
      const candidates: any[] = [
        raw,
        (raw as any).data,
        (raw as any).response,
        (raw as any).output,
        (raw as any).result,
        (raw as any).message,
        (raw as any).content,
        (raw as any).text,
        (raw as any).choices?.[0]?.message?.content,
      ];
      for (const c of candidates) {
        if (!c) continue;
        if (typeof c === 'object' && (('plan' in c) || ('cases' in c) || ('test_cases' in c) || ('testCases' in c))) {
          return c;
        }
        if (typeof c === 'string') {
          const parsed = extractFromString(c);
          if (parsed) return parsed;
        }
      }
      return raw;
    }
    return {};
  }

  // Novo: gerar um único plano com múltiplos casos a partir do documento/tabela
  const generatePlanWithCases = async (
    documentContent: string,
    context?: string,
    userId?: string,
    projectId?: string
  ) => {
    const prompt = `
      Você receberá um texto ou TABELA com colunas como funcionalidades, objetivos, escopo, ambiente, branches e testes/casos.
      Sua tarefa é gerar UM ÚNICO PLANO DE TESTE contendo campos de plano (sem duplicações) e VÁRIOS CASOS DE TESTE derivados dos pontos/testes descritos.

      DOCUMENTO/TABELA:
      ${documentContent}

      ${context ? `CONTEXTO ADICIONAL: ${context}` : ''}

      REGRAS E FORMATAÇÃO:
      - Consolidar campos do plano (title, description, objective, scope, approach, criteria, resources, schedule, risks) a partir do conteúdo disponível, sem repetir itens linha a linha.
      - Derivar os CASOS DE TESTE a partir das funcionalidades/itens/linhas, criando casos independentes e testáveis com passos claros.
      - EVITAR caracteres especiais indesejados (aspas curvas, bullets, emojis). Use texto simples.
      - Seja direto e objetivo.

      Responda SOMENTE com JSON válido nesta estrutura exata (sem comentários):
      {
        "schemaVersion": "plan_with_cases.v1",
        "plan": {
          "title": "...",
          "description": "...",
          "objective": "...",
          "scope": "...",
          "approach": "...",
          "criteria": "...",
          "resources": "...",
          "schedule": "...",
          "risks": "..."
        },
        "cases": [
          {
            "title": "...",
            "description": "...",
            "preconditions": "...",
            "expected_result": "...",
            "priority": "medium",
            "type": "functional",
            "steps": [
              { "action": "...", "expected_result": "..." }
            ]
          }
        ]
      }
    `;

    try {
      const config = ModelControlService.loadConfig();
      const effectiveModelId = (() => {
        if (selectedModel && selectedModel !== 'default') return selectedModel;
        if (config?.defaultModel) return config.defaultModel;
        const mapped = config?.tasks?.['general-completion'];
        if (mapped) return mapped as string;
        const firstActive = config?.models?.find(m => m.active)?.id;
        return firstActive;
      })();

      const generatedData = await ModelControlService.executeTask(
        'general-completion',
        { prompt },
        effectiveModelId || undefined
      );
      // Normalizar payload vindo do provedor (string com fences, wrappers, etc.)
      const parsed: any = extractAndParseJSON(generatedData);
      const planRaw: any = (parsed?.plan && typeof parsed.plan === 'string')
        ? (tryJson(parsed.plan) ?? { description: parsed.plan })
        : (parsed?.plan || {});
      const casesRaw: any = parsed?.cases || parsed?.test_cases || parsed?.testCases;

      if (!planRaw || !casesRaw || !Array.isArray(casesRaw)) {
        const snippet = typeof generatedData === 'string' ? generatedData.slice(0, 200) : JSON.stringify(parsed).slice(0, 200);
        throw new Error(`Formato de resposta inválido: esperado objeto { plan, cases[] }. Amostra recebida: ${snippet}...`);
      }

      // Sanitizar conteúdos dos casos (coercion de strings quando necessário)
      const cleanCases = (casesRaw as any[]).map((c: any) => {
        const stepsArray = (() => {
          if (Array.isArray(c?.steps)) return c.steps;
          if (typeof c?.steps === 'string') {
            return c.steps.split(/\r?\n/).filter(Boolean).map((line: string) => ({ action: line.trim(), expected_result: '' }));
          }
          return [] as any[];
        })();

        return {
          title: sanitizeText(typeof c?.title === 'string' ? c.title : c?.name || 'Caso de Teste'),
          description: sanitizeText(typeof c?.description === 'string' ? c.description : ''),
          preconditions: sanitizeText(typeof c?.preconditions === 'string' ? c.preconditions : ''),
          expected_result: sanitizeText(typeof c?.expected_result === 'string' ? c.expected_result : ''),
          priority: sanitizeText(typeof c?.priority === 'string' ? c.priority : 'medium'),
          type: sanitizeText(typeof c?.type === 'string' ? c.type : 'functional'),
          steps: stepsArray.map((s: any, idx: number) => ({
            id: crypto.randomUUID(),
            action: sanitizeText(s?.action),
            expected_result: sanitizeText(s?.expected_result),
            order: idx + 1,
          })),
          user_id: userId,
          project_id: projectId,
          generated_by_ai: true,
          created_at: new Date(),
          updated_at: new Date(),
        };
      });

      // Plano: título e descrição consolidada por caso, com objetivo/escopo/critérios derivados
      const consolidatedDescription = (
        [
          'Contexto consolidado por caso:',
          ...cleanCases.map((c: any, idx: number) => {
            const parts = [
              `#${idx + 1} ${c.title}`,
              c.description ? ` - ${c.description}` : '',
              c.preconditions ? ` (Pré-condições: ${c.preconditions})` : ''
            ];
            return sanitizeText(parts.join(''));
          })
        ].join('\n')
      );

      // Deriva campos objetivo/escopo/critérios a partir da IA ou dos casos
      const objectiveFromAI = sanitizeText((planRaw as any).objective);
      const scopeFromAI = sanitizeText((planRaw as any).scope);
      const criteriaFromAI = sanitizeText((planRaw as any).criteria);

      const titles = cleanCases.map((c: any, idx: number) => `#${idx + 1} ${c.title}`);
      const priorityCount = cleanCases.reduce((acc: Record<string, number>, c: any) => {
        const p = (c.priority || 'medium').toLowerCase();
        acc[p] = (acc[p] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const derivedObjective = objectiveFromAI || sanitizeText(
        `Validar ${cleanCases.length} casos de teste derivados do documento/tabela, assegurando o comportamento esperado para: ${titles.slice(0, 5).join(', ')}${titles.length > 5 ? ', ...' : ''}.`
      );

      const derivedScope = scopeFromAI || (
        titles.length
          ? ['Casos contemplados:', ...titles.map((t) => `- ${t}`)].join('\n')
          : ''
      );

      const derivedCriteria = criteriaFromAI || sanitizeText([
        'Aprovação quando:',
        `- 100% dos casos de alta prioridade passarem${priorityCount.high ? ` (${priorityCount.high})` : ''}`,
        `- ≥ 95% dos casos de média prioridade passarem${priorityCount.medium ? ` (${priorityCount.medium})` : ''}`,
        `- Sem bugs críticos abertos`,
        `- Evidências registradas para cada caso`,
      ].join('\n'));

      // Título derivado mais claro/consistente
      const firstCaseTitle = (cleanCases[0]?.title || '').toString();
      const conciseFirst = firstCaseTitle.length > 60 ? `${firstCaseTitle.slice(0, 57)}...` : firstCaseTitle;
      const fallbackTitleRaw = `Plano Único com Casos (IA) — ${cleanCases.length} casos${conciseFirst ? ` — ${conciseFirst}` : ''}`;
      const finalTitle = sanitizeText((planRaw as any).title) || sanitizeText(fallbackTitleRaw);

      const cleanPlan = {
        title: finalTitle,
        description: consolidatedDescription,
        objective: derivedObjective,
        scope: derivedScope,
        approach: '',
        criteria: derivedCriteria,
        resources: '',
        schedule: '',
        risks: '',
        user_id: userId,
        project_id: projectId,
        generated_by_ai: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      return { plan: cleanPlan, cases: cleanCases };
    } catch (error) {
      console.error('Erro na geração de plano com casos:', error);
      // Propaga mensagem amigável para UI
      throw new Error(`Erro na geração de plano com casos: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const savePlanWithCasesToSupabase = async (
    plan: any,
    cases: any[],
  ) => {
    try {
      const planWithProject = { ...plan, project_id: plan?.project_id ?? currentProject?.id };
      // Inserir plano e recuperar ID
      const { data: insertedPlans, error: planErr } = await supabase
        .from('test_plans')
        .insert(planWithProject)
        .select()
        .limit(1);
      if (planErr) throw planErr;
      const planId = insertedPlans?.[0]?.id;
      if (!planId) throw new Error('Falha ao obter ID do plano inserido');

      // Vincular plan_id aos casos e inserir
      const casesToInsert = cases.map((c) => ({ ...c, plan_id: planId, project_id: c?.project_id ?? currentProject?.id }));
      const { error: casesErr } = await supabase
        .from('test_cases')
        .insert(casesToInsert);
      if (casesErr) throw casesErr;

      return { success: true, planId, casesCount: cases.length };
    } catch (error) {
      console.error('Erro ao salvar plano com casos:', error);
      throw error;
    }
  };

  // Aplicar modelo preferido salvo nas configurações quando os modelos estiverem disponíveis
  useEffect(() => {
    const preferred = settings?.preferredModel || 'default';
    const exists = preferred === 'default' || availableModels.some(m => m.id === preferred);
    if (exists && selectedModel !== preferred) {
      setSelectedModel(preferred);
    }
  }, [availableModels, settings?.preferredModel]);

  const providerRequiresApiKey = (provider?: string) => {
    if (!provider) return false;
    return ['openai', 'anthropic', 'groq', 'gemini'].includes(provider);
  };

  const selectedModelObj = selectedModel === 'default' 
    ? undefined 
    : availableModels.find(m => m.id === selectedModel);

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
    const ext = selectedFile.name.toLowerCase().split('.').pop() || '';
    const isPlainText = selectedFile.type === 'text/plain' || ext === 'txt' || ext === 'md';
    if (isPlainText) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setDocumentContent(event.target?.result as string || '');
        toast({ title: 'Documento carregado', description: `${selectedFile.name} carregado com sucesso.` });
      };
      reader.readAsText(selectedFile);
      return;
    }
    try {
      const { text, format } = await extractDocumentViaServer(selectedFile);
      setDocumentContent(text);
      toast({ title: 'Documento carregado', description: `${selectedFile.name} (${format?.toUpperCase()}) extraído com sucesso.` });
    } catch (err: any) {
      toast({ title: 'Erro ao processar', description: err?.message || 'Falha ao extrair conteúdo.', variant: 'destructive' });
    }
  };

  const generateBatchCases = async (
    documentContent: string, 
    context?: string, 
    userId?: string
  ) => {
    const prompt = `
      Analise o seguinte documento e identifique AUTONOMAMENTE diferentes funcionalidades, cenários ou fluxos que necessitam de casos de teste específicos.

      DOCUMENTO:
      ${documentContent}

      ${context ? `CONTEXTO ADICIONAL: ${context}` : ''}

      INSTRUÇÕES IMPORTANTES:
      - Analise o documento e identifique automaticamente as diferentes funcionalidades/cenários
      - Para cada funcionalidade identificada, crie casos de teste específicos e detalhados
      - Seja DIRETO e ESPECÍFICO, evite contexto desnecessário
      - Cada caso deve ser independente e testável
      - Inclua passos de teste detalhados

      Retorne um JSON válido com esta estrutura EXATA:
      {
        "cases": [
          {
            "title": "título específico do caso",
            "description": "descrição direta e objetiva",
            "preconditions": "pré-condições necessárias",
            "expected_result": "resultado esperado final",
            "priority": "medium",
            "type": "functional",
            "steps": [
              {
                "action": "ação a ser executada",
                "expected_result": "resultado esperado do passo"
              }
            ]
          }
        ]
      }

      IMPORTANTE: Gere quantos casos forem necessários baseado na análise do documento, mas seja específico e direto.
    `;

    try {
      const config = ModelControlService.loadConfig();
      const effectiveModelId = (() => {
        if (selectedModel && selectedModel !== 'default') return selectedModel;
        if (config?.defaultModel) return config.defaultModel;
        const mapped = config?.tasks?.['general-completion'];
        if (mapped) return mapped as string;
        const firstActive = config?.models?.find(m => m.active)?.id;
        return firstActive;
      })();

      const generatedData = await ModelControlService.executeTask(
        'general-completion',
        { prompt },
        effectiveModelId || undefined
      );
      // Normalizar payload vindo do provedor (string com fences, wrappers, etc.)
      const parsed: any = extractAndParseJSON(generatedData);
      const casesRaw: any = parsed?.cases || parsed?.test_cases || parsed?.testCases;

      if (!casesRaw || !Array.isArray(casesRaw)) {
        const snippet = typeof generatedData === 'string' ? generatedData.slice(0, 200) : JSON.stringify(parsed).slice(0, 200);
        throw new Error(`Formato de resposta inválido: esperado array "cases". Amostra recebida: ${snippet}...`);
      }

      return (casesRaw as any[]).map((testCase: any) => ({
        ...testCase,
        id: crypto.randomUUID(),
        user_id: userId,
        generated_by_ai: true,
        steps: testCase.steps?.map((step: any, index: number) => ({
          ...step,
          id: crypto.randomUUID(),
          order: index + 1
        })) || [],
        created_at: new Date(),
        updated_at: new Date()
      }));
    } catch (error) {
      console.error('Erro na função de geração em lote de casos:', error);
      throw new Error(`Erro na geração em lote de casos: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const generateBatchPlans = async (
    documentContent: string, 
    context?: string, 
    userId?: string
  ) => {
    const prompt = `
      Analise o seguinte documento e identifique AUTONOMAMENTE diferentes funcionalidades, sistemas ou módulos que necessitam de planos de teste específicos.

      DOCUMENTO:
      ${documentContent}

      ${context ? `CONTEXTO ADICIONAL: ${context}` : ''}

      INSTRUÇÕES IMPORTANTES:
      - Analise o documento e identifique automaticamente as diferentes funcionalidades/sistemas
      - Para cada funcionalidade identificada, crie um plano de teste específico e focado
      - Seja DIRETO e ESPECÍFICO, evite contexto desnecessário
      - Cada plano deve ser independente e testável
      - Gere apenas o essencial baseado nas informações fornecidas

      Retorne um JSON válido com esta estrutura EXATA:
      {
        "plans": [
          {
            "title": "título específico do plano",
            "description": "descrição direta e objetiva",
            "objective": "objetivo claro do teste",
            "scope": "escopo específico a ser testado",
            "approach": "abordagem de teste direta",
            "criteria": "critérios de aceite objetivos",
            "resources": "recursos necessários",
            "schedule": "estimativa de cronograma",
            "risks": "principais riscos identificados"
          }
        ]
      }

      IMPORTANTE: Gere quantos planos forem necessários baseado na análise do documento, mas seja específico e direto.
    `;

    try {
      const config = ModelControlService.loadConfig();
      const effectiveModelId = (() => {
        if (selectedModel && selectedModel !== 'default') return selectedModel;
        if (config?.defaultModel) return config.defaultModel;
        const mapped = config?.tasks?.['general-completion'];
        if (mapped) return mapped as string;
        const firstActive = config?.models?.find(m => m.active)?.id;
        return firstActive;
      })();

      // Usar o ModelControlService para executar a tarefa
      const generatedData = await ModelControlService.executeTask(
        'general-completion',
        { prompt },
        effectiveModelId || undefined
      );
      // Normalizar payload vindo do provedor (string com fences, wrappers, etc.)
      const parsed: any = extractAndParseJSON(generatedData);
      const plansRaw: any = parsed?.plans || parsed?.test_plans || parsed?.items;

      if (!plansRaw || !Array.isArray(plansRaw)) {
        const snippet = typeof generatedData === 'string' ? generatedData.slice(0, 200) : JSON.stringify(parsed).slice(0, 200);
        throw new Error(`Formato de resposta inválido: esperado array "plans". Amostra recebida: ${snippet}...`);
      }

      // Adicionar IDs únicos para cada plano
      return (plansRaw as any[]).map((plan: any) => ({
        ...plan,
        id: crypto.randomUUID(),
        user_id: userId,
        generated_by_ai: true,
        created_at: new Date(),
        updated_at: new Date()
      }));
    } catch (error) {
      console.error('Erro na função de geração em lote:', error);
      throw new Error(`Erro na geração em lote: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const saveCasesToSupabase = async (cases: any[]) => {
    try {
      const payload = cases.map((c) => ({ ...c, project_id: c?.project_id ?? currentProject?.id }));
      const { data, error } = await supabase
        .from('test_cases')
        .insert(payload);
        
      if (error) throw error;
      
      return {
        success: true, 
        cases: payload,
        count: payload.length
      };
    } catch (error) {
      console.error('Erro ao salvar casos em lote:', error);
      throw error;
    }
  };

  const savePlansToSupabase = async (plans: any[]) => {
    try {
      const payload = plans.map((p) => ({ ...p, project_id: p?.project_id ?? currentProject?.id }));
      const { data, error } = await supabase
        .from('test_plans')
        .insert(payload);
        
      if (error) throw error;
      
      return {
        success: true, 
        plans: payload,
        count: payload.length
      };
    } catch (error) {
      console.error('Erro ao salvar planos em lote:', error);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !documentContent.trim()) return;
    if (!currentProject?.id) {
      toast({ title: 'Selecione um projeto', description: 'Selecione um projeto no topo antes de gerar.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      if (type === 'case') {
        // Gerar casos em lote usando a API do Gemini
        const cases = await generateBatchCases(documentContent, context, user.id);
        
        // Salvar casos gerados no Supabase
        const result = await saveCasesToSupabase(cases);

      toast({
        title: "Sucesso",
          description: `Análise do documento concluída! ${cases.length} casos gerados com IA.`
      });

        onSuccess?.(result);
      } else {
        if (mode === 'plan-with-cases') {
          // Gerar um único plano com múltiplos casos
          const { plan, cases } = await generatePlanWithCases(documentContent, context, user.id, currentProject.id);
          const result = await savePlanWithCasesToSupabase(plan, cases);
          toast({
            title: 'Sucesso',
            description: `Plano criado com ${cases.length} casos gerados pela IA.`
          });
          onSuccess?.(result);
        } else {
          // Gerar planos em lote (padrão)
          const plans = await generateBatchPlans(documentContent, context, user.id);
          const result = await savePlansToSupabase(plans);
          toast({
            title: "Sucesso",
            description: `Análise do documento concluída! ${plans.length} planos gerados com IA.`
          });
          onSuccess?.(result);
        }
      }
    } catch (error) {
      console.error(`Erro ao gerar ${type === 'case' ? 'casos' : 'planos'} em lote:`, error);
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Erro",
        description: `Erro ao gerar ${type === 'case' ? 'casos' : (mode === 'plan-with-cases' ? 'plano com casos' : 'planos')}: ${message}`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-busy={loading}>
      {/* Top bar: project badge + mode chip + file upload */}
      <div className="flex items-center justify-between pb-3 border-b border-border/50">
        <div className="flex items-center gap-2">
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
          <Badge variant="outline" className="text-xs">
            {type === 'plan'
              ? (mode === 'plan-with-cases' ? 'Plano + Casos' : 'Lote de Planos')
              : 'Lote de Casos'}
          </Badge>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded-md px-2.5 py-1.5 transition-colors" title="Aceita .txt, .md, .doc, .docx, .pdf, .xlsx, .xls">
          <Upload className="h-3.5 w-3.5" />
          {file ? <span className="max-w-[140px] truncate">{file.name}</span> : 'Importar documento'}
          <input type="file" className="sr-only" accept=".txt,.md,.doc,.docx,.pdf,.xlsx,.xls,.pptx" onChange={handleFileChange} />
        </label>
      </div>

      {/* 2-column main body */}
      <div className="grid grid-cols-[1fr_240px] gap-5">

        {/* LEFT — main content textarea */}
        <div>
          <Label className="text-xs font-medium mb-1.5 block">
            {mode === 'plan-with-cases' ? 'Tabela / Descrição de Funcionalidades' : 'Conteúdo do Documento'}
            {' '}<span className="text-destructive">*</span>
            <span className="text-muted-foreground font-normal ml-1.5">
              {mode === 'plan-with-cases'
                ? '— colunas: Funcionalidade, Objetivo, Escopo, Ambiente, Testes'
                : '— cole o documento completo para análise automática'}
            </span>
          </Label>
          <Textarea
            value={documentContent}
            onChange={(e) => setDocumentContent(e.target.value)}
            rows={12}
            className="text-sm resize-none font-mono"
            placeholder={mode === 'plan-with-cases'
              ? 'Funcionalidade | Objetivo | Escopo | Ambiente | Testes\n---\nLogin        | Autenticar usuário | ...'
              : 'Cole o conteúdo do documento aqui.\nA IA identificará automaticamente os cenários e gerará os itens correspondentes.'}
            required
          />
        </div>

        {/* RIGHT — context, model, info, generate */}
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Contexto Adicional</Label>
            <Textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={4}
              className="text-sm resize-none"
              placeholder="Tecnologias, padrões, ambiente..."
            />
          </div>

          <div>
            <Label className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              Modelo de IA
              <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default" className="text-xs">⚡ Modelo Padrão (Recomendado)</SelectItem>
                {availableModels.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedModelObj && providerRequiresApiKey(selectedModelObj.provider) && (
              <p className="text-xs text-amber-500 mt-1">⚠ Requer API key no Painel de Modelos</p>
            )}
          </div>

          <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1">
            <p className="text-xs font-medium text-foreground/80">Como funciona:</p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              <li>• A IA analisa o documento</li>
              <li>• Identifica cenários/funcionalidades</li>
              <li>• Gera {type === 'case' ? 'casos' : 'planos'} para cada situação</li>
              <li>• Você revisa cada item individualmente</li>
            </ul>
          </div>

          <Button
            type="submit"
            disabled={loading || !documentContent.trim() || !currentProject?.id}
            className="w-full"
            aria-busy={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                {mode === 'plan-with-cases' && type === 'plan'
                  ? 'Gerar Plano com Casos'
                  : `Gerar ${type === 'case' ? 'Casos' : 'Planos'} com IA`}
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
};
