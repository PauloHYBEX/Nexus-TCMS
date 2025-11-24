import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, Calendar, User, Sparkles, Loader2, Code, LifeBuoy, Briefcase, Shield, Eye } from 'lucide-react';
import { TestPlan, TestCase, TestExecution, Requirement, Defect } from '@/types';
import { ExportDropdown } from './ExportDropdown';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';

const userRoleLabel: Record<string, string> = {
  master: 'Master',
  admin: 'Administrador',
  manager: 'Gerência',
  tester: 'Testador',
  viewer: 'Visualizador',
};
import * as ModelControlService from '@/services/modelControlService';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  priorityLabel,
  priorityBadgeClass,
  executionStatusLabel,
  executionStatusBadgeClass,
  requirementStatusLabel,
  requirementStatusBadgeClass,
  defectStatusLabel,
  defectStatusBadgeClass,
  testCaseTypeLabel,
  testCaseTypeBadgeClass,
} from '@/lib/labels';
import type { ExecutionStatus, TestCaseType } from '@/lib/labels';
import { UserProfileModal } from './UserProfileModal';
import { useProject } from '@/contexts/ProjectContext';

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: TestPlan | TestCase | TestExecution | Requirement | Defect | null;
  type: 'plan' | 'case' | 'execution' | 'requirement' | 'defect';
  onEdit?: (item: any) => void;
  onDelete?: (id: string) => void;
}

export const DetailModal = ({ isOpen, onClose, item, type, onEdit, onDelete }: DetailModalProps) => {
  const SINGLE_TENANT = String((import.meta as any).env?.VITE_SINGLE_TENANT ?? 'true') === 'true';
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [additionalContext, setAdditionalContext] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string>('default');
  const [author, setAuthor] = useState<{ id: string; email?: string; display_name?: string; avatar_url?: string; github_url?: string; google_url?: string; website_url?: string; tags?: any[]; role?: string } | null>(null);
  const [showAuthorModal, setShowAuthorModal] = useState(false);
  const [authorTags, setAuthorTags] = useState<Array<{ label: string; icon?: string }>>([]);
  const { currentProject } = useProject();
  const isProjectInactive = !!currentProject && currentProject.status !== 'active';

  // Reset confirmDelete when modal is closed or item changes
  useEffect(() => {
    if (!isOpen) {
      setConfirmDelete(false);
    }
  }, [isOpen]);

  useEffect(() => {
    setConfirmDelete(false);
  }, [item]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  };

  // Classes para status de Plano/Caso (reuso do padrão aplicado em TestPlans)
  const planStatusClasses = (status: string) => (
    status === 'active'
      ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-400/15 dark:text-green-300 dark:border-transparent dark:ring-1 dark:ring-green-400/25'
      : status === 'review'
      ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-400/15 dark:text-yellow-300 dark:border-transparent dark:ring-1 dark:ring-yellow-400/25'
      : status === 'approved'
      ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-400/15 dark:text-blue-300 dark:border-transparent dark:ring-1 dark:ring-blue-400/25'
      : status === 'archived'
      ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-400/15 dark:text-red-300 dark:border-transparent dark:ring-1 dark:ring-red-400/25'
      : status === 'draft'
      ? 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-slate-400/15 dark:text-slate-300 dark:border-transparent dark:ring-1 dark:ring-slate-400/25'
      : 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-slate-400/15 dark:text-slate-300 dark:border-transparent dark:ring-1 dark:ring-slate-400/25'
  );

  // Abre o modal de confirmação de geração
  const openGenerateDialog = () => {
    setShowGenerateDialog(true);
  };

  // Confirma e dispara a geração com as opções escolhidas
  const confirmAndGenerate = async () => {
    const modelOverride = selectedModelId === 'default' ? undefined : selectedModelId;
    setShowGenerateDialog(false);
    await handleGenerateCasesForPlan({ additionalContext, modelId: modelOverride });
  };

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete?.(item.id);
      onClose();
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
    }
  };

  const handleClose = () => {
    setConfirmDelete(false);
    onClose();
  };

  const getTypeLabel = () => {
    switch (type) {
      case 'plan': return 'Plano de Teste';
      case 'case': return 'Caso de Teste';
      case 'execution': return 'Execução de Teste';
      case 'requirement': return 'Requisito';
      case 'defect': return 'Defeito';
      default: return '';
    }
  };

  const getItemTitle = () => {
    if (type === 'execution') {
      const seq = 'sequence' in item && (item as any).sequence ? (item as any).sequence : item.id.slice(0, 8);
      return `Execução #${seq}`;
    }
    if (type === 'defect' || type === 'requirement') {
      return (item as Defect | Requirement).title;
    }
    const baseTitle = (item as TestPlan | TestCase).title;
    const seq = 'sequence' in item && (item as any).sequence ? (item as any).sequence : null;
    return seq ? `#${seq} — ${baseTitle}` : baseTitle;
  };

  const getItemDescription = () => {
    if (type === 'execution') {
      return (item as TestExecution).notes || '';
    }
    return (item as TestPlan | TestCase | Requirement | Defect).description || '';
  };

  // Carrega informações do autor para exibir e-mail/link do perfil
  useEffect(() => {
    const loadAuthor = async () => {
      if (!isOpen || !item || !('user_id' in (item as any))) return;
      const uid = (item as any).user_id as string;
      try {
        if (!SINGLE_TENANT) {
          let data: any | null = null;
          let error: any | null = null;
          try {
            const res = await supabase
              .from('profiles' as any)
              .select('id, email, display_name, avatar_url, github_url, google_url, website_url, tags, role')
              .eq('id', uid)
              .maybeSingle();
            data = res.data; error = res.error;
          } catch (e) {
            error = e;
          }
          if (data && !error) {
            setAuthor({
              id: data.id,
              email: (data as any).email,
              display_name: (data as any).display_name,
              avatar_url: (data as any).avatar_url,
              github_url: (data as any).github_url,
              google_url: (data as any).google_url,
              website_url: (data as any).website_url,
              tags: (data as any).tags || [],
              role: (data as any).role,
            });
            if (Array.isArray((data as any).tags)) setAuthorTags((data as any).tags);
            return;
          }
          // Fallback para colunas básicas caso algumas não existam ainda
          try {
            const resBasic = await supabase
              .from('profiles' as any)
              .select('id, email, display_name, tags, role')
              .eq('id', uid)
              .maybeSingle();
            if (resBasic.data && !resBasic.error) {
              setAuthor({ id: resBasic.data.id, email: resBasic.data.email, display_name: resBasic.data.display_name, tags: (resBasic.data as any).tags || [], role: (resBasic.data as any).role });
              const t = (resBasic.data as any).tags; if (Array.isArray(t)) setAuthorTags(t);
              return;
            }
          } catch {}
        }
        const { data: authData } = await supabase.auth.getUser();
        const me = authData?.user;
        if (me && me.id === uid) {
          setAuthor({
            id: me.id,
            email: me.email || undefined,
            display_name: (me.user_metadata as any)?.full_name,
            avatar_url: (me.user_metadata as any)?.avatar_url,
            github_url: (me.user_metadata as any)?.github_url,
            google_url: (me.user_metadata as any)?.google_url,
            website_url: (me.user_metadata as any)?.website_url,
            tags: (me.user_metadata as any)?.tags || [],
          });
          const rawT = (me.user_metadata as any)?.tags; if (Array.isArray(rawT)) setAuthorTags(rawT);
        } else {
          setAuthor({ id: uid });
          setAuthorTags([]);
        }
      } catch {
        setAuthor({ id: uid });
        setAuthorTags([]);
      }
    };
    loadAuthor();
  }, [isOpen, item]);

  if (!item) return null;

  const getItemDate = () => {
    if (type === 'execution') {
      return (item as TestExecution).executed_at;
    }
    return (item as TestPlan | TestCase | Requirement | Defect).created_at;
  };

  const translateStatus = (status: string) => {
    const statusMap: { [key: string]: string } = {
      'open': 'aberto',
      'closed': 'fechado',
      'in_progress': 'em andamento',
      'resolved': 'resolvido',
      'pending': 'pendente',
      'approved': 'aprovado',
      'rejected': 'rejeitado',
      'active': 'ativo',
      'inactive': 'inativo',
      'draft': 'rascunho',
      'review': 'em revisão'
    };
    return statusMap[status] || status;
  };

  // Renderizador: converte texto em lista (ul/li) quando detecta marcadores ('-', '•', 'º', '#N ')
  // Comportamento extra: quando opts.centerShort=true centraliza textos curtos (<15 char) sem marcadores
  const renderListOrParagraph = (raw?: string, opts?: { centerShort?: boolean }) => {
    const text = (raw ?? '').toString().trim();
    if (!text) return null;

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    // Caso especial: bloco consolidado por caso
    if (text.startsWith('Contexto consolidado por caso:')) {
      const [label, ...rest] = lines;
      const items = rest.map(l => l.replace(/^#\d+\s*/, '').trim()).filter(Boolean);
      return (
        <div>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-2 text-left">{label}</p>
          <ol className="list-decimal list-outside ml-5 text-gray-600 dark:text-gray-400 text-sm text-left">
            {items.map((i, idx) => (<li key={idx}>{i}</li>))}
          </ol>
        </div>
      );
    }

    const hasMarkers = lines.some(l => /^[-•\u00BA]/.test(l) || /^#\d+\s+/.test(l));
    if (opts?.centerShort && !hasMarkers) {
      const isVeryShort = text.length < 80 && !/\r?\n/.test(text);
      if (isVeryShort) {
        return (
          <p className="text-gray-600 dark:text-gray-400 text-sm text-center">{text}</p>
        );
      }
    }
    if (hasMarkers) {
      const items = lines.map(l => {
        if (/^[-•]/.test(l)) return l.replace(/^[-•]\s*/, '');
        if (/^\u00BA/.test(l)) return 'º ' + l.replace(/^\u00BA\s*/, ''); // preserva prefixo 'º '
        if (/^#\d+\s+/.test(l)) return l.replace(/^#\d+\s+/, '');
        return l;
      });
      return (
        <ul className="list-disc list-outside ml-5 text-gray-600 dark:text-gray-400 text-sm text-left">
          {items.map((i, idx) => (<li key={idx}>{i}</li>))}
        </ul>
      );
    }

    // Heurística para branches: contém 'branch' e vírgulas -> lista com prefixo 'º '
    if (/branch/i.test(text) && text.includes(',')) {
      const [label, rest] = text.split(/:/, 2);
      const items = (rest || '')
        .split(',')
        .map(p => p.replace(/^e\s+/i, '').trim())
        .filter(Boolean);
      if (items.length) {
        return (
          <div>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-2 text-left">{label}:</p>
            <ul className="list-none ml-0 text-gray-600 dark:text-gray-400 text-sm text-left">
              {items.map((i, idx) => (<li key={idx}>º {i}</li>))}
            </ul>
          </div>
        );
      }
    }

    return (
      <p className="text-gray-600 dark:text-gray-400 text-sm whitespace-pre-wrap text-left">{text}</p>
    );
  };

  // Helpers simples para sanitizar e extrair JSON de respostas de IA
  const sanitizeText = (txt?: string) => {
    if (!txt) return '';
    let s = txt
      .replace(/[\u2018\u2019\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[\u2022\u25CF\u25A0\u2219]/g, '-')
      .replace(/[\u00A0]/g, ' ')
      .replace(/[\t ]+/g, ' ');
    // eslint-disable-next-line no-control-regex
    s = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '');
    return s.trim();
  };

  function tryJson(txt: string): any | undefined {
    try { return JSON.parse(txt); } catch { return undefined; }
  }

  function extractFromString(s: string): any | undefined {
    if (!s) return;
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence && fence[1]) {
      const parsed = tryJson(fence[1]);
      if (parsed) return parsed;
    }
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      const parsed = tryJson(s.slice(first, last + 1));
      if (parsed) return parsed;
    }
    return tryJson(s.trim());
  }

  function extractAndParseJSON(raw: any): any {
    if (raw == null) return {};
    if (typeof raw === 'string') {
      const parsed = extractFromString(raw);
      return parsed ?? {};
    }
    if (typeof raw === 'object') {
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
        if (typeof c === 'object' && (('cases' in c) || ('test_cases' in c) || ('testCases' in c))) {
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

  const handleGenerateCasesForPlan = async (opts?: { additionalContext?: string; modelId?: string }) => {
    if (!item || type !== 'plan') return;
    const plan = item as TestPlan;
    setGenerating(true);
    try {
      // Monta conteúdo do documento a partir do plano atual
      const parts: string[] = [];
      parts.push(`# Plano: ${plan.title}`);
      if (plan.description) parts.push(`Descrição:\n${plan.description}`);
      if (plan.objective?.trim()) parts.push(`Objetivo:\n${plan.objective}`);
      if (plan.scope?.trim()) parts.push(`Escopo:\n${plan.scope}`);
      if (plan.criteria?.trim()) parts.push(`Critérios:\n${plan.criteria}`);
      if (opts?.additionalContext?.trim()) parts.push(`Contexto adicional (usuário):\n${opts.additionalContext.trim()}`);
      const documentContent = parts.join('\n\n');

      const prompt = `
      Analise o seguinte documento e identifique AUTONOMAMENTE diferentes funcionalidades, cenários ou fluxos que necessitam de casos de teste específicos.

      DOCUMENTO:
      ${documentContent}

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

      // Seleção de modelo (mesma lógica de fallback do formulário de IA) com override opcional
      const config = ModelControlService.loadConfig();
      const effectiveModelId = (() => {
        if (opts?.modelId && opts.modelId !== 'default') return opts.modelId;
        const mapped = config?.tasks?.['general-completion'];
        if (mapped) return mapped as string;
        if (config?.defaultModel) return config.defaultModel;
        const firstActive = config?.models?.find(m => m.active)?.id;
        return firstActive;
      })();

      const generatedData = await ModelControlService.executeTask(
        'general-completion',
        { prompt },
        effectiveModelId || undefined
      );

      const parsed: any = extractAndParseJSON(generatedData);
      const casesRaw: any = (parsed?.cases || parsed?.test_cases || parsed?.testCases);
      if (!casesRaw || !Array.isArray(casesRaw)) {
        const snippet = typeof generatedData === 'string' ? generatedData.slice(0, 200) : JSON.stringify(parsed).slice(0, 200);
        throw new Error(`Formato de resposta inválido: esperado array "cases". Amostra recebida: ${snippet}...`);
      }

      const casesToInsert = (casesRaw as any[]).map((c: any, idx: number) => {
        const stepsArray = Array.isArray(c?.steps) ? c.steps : (
          typeof c?.steps === 'string'
            ? c.steps.split(/\r?\n/).filter(Boolean).map((line: string) => ({ action: line.trim(), expected_result: '' }))
            : []
        );
        return {
          plan_id: plan.id,
          title: sanitizeText(typeof c?.title === 'string' ? c.title : c?.name || `Caso ${idx + 1}`),
          description: sanitizeText(typeof c?.description === 'string' ? c.description : ''),
          preconditions: sanitizeText(typeof c?.preconditions === 'string' ? c.preconditions : ''),
          expected_result: sanitizeText(typeof c?.expected_result === 'string' ? c.expected_result : ''),
          priority: sanitizeText(typeof c?.priority === 'string' ? c.priority : 'medium'),
          type: sanitizeText(typeof c?.type === 'string' ? c.type : 'functional'),
          steps: stepsArray.map((s: any, i: number) => ({
            id: crypto.randomUUID(),
            action: sanitizeText(s?.action),
            expected_result: sanitizeText(s?.expected_result),
            order: i + 1,
          })),
          user_id: plan.user_id,
          generated_by_ai: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });

      const { error } = await supabase
        .from('test_cases')
        .insert(casesToInsert);
      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: `${casesToInsert.length} casos gerados pela IA e vinculados a este plano.`
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: 'Erro', description: `Falha ao gerar casos: ${msg}`, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const desc = getItemDescription();
  const isShortDesc = (() => {
    const t = (desc || '').toString().trim();
    if (!t) return false;
    if (t.length >= 80) return false;
    // se houver quebras ou marcadores, trata como texto longo/lista
    if (/\r?\n/.test(t)) return false;
    if (/^[-•\u00BA]|^#\d+\s+/.test(t)) return false;
    return true;
  })();

  return (<>
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto text-center">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 justify-center">
            {getTypeLabel()} - {getItemTitle()}
            {('generated_by_ai' in item && item.generated_by_ai) && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                IA
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Visualize os detalhes completos {type === 'plan' ? 'do plano de teste' : type === 'case' ? 'do caso de teste' : type === 'execution' ? 'da execução de teste' : type === 'requirement' ? 'do requisito' : 'do defeito'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações básicas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Calendar className="h-4 w-4" />
              {type === 'execution' ? 'Executado em:' : 'Criado em:'} {formatDate(getItemDate())}
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 justify-center md:justify-start flex-wrap">
              <User className="h-4 w-4" />
              <span>Autor:</span>
              <button type="button" className="text-brand hover:underline focus:outline-none bg-transparent border-0 p-0 h-auto" onClick={() => setShowAuthorModal(true)} title="Abrir perfil">
                {author?.display_name || author?.email || 'ver perfil'}
              </button>
              {author?.role && (
                <span className="flex items-center gap-1 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground border">
                    {userRoleLabel[author.role] || author.role}
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* Removido: exibição duplicada de roles/tags. Mantemos apenas as tags de cargo ao lado do nome do autor. */}

          {/* Badges de status e prioridade */}
          <div className="flex gap-2 flex-wrap">
            {('status' in item && item.status) && (
              <Badge className={
                type === 'execution'
                  ? executionStatusBadgeClass(item.status as ExecutionStatus)
                  : type === 'requirement'
                  ? requirementStatusBadgeClass(item.status as any)
                  : type === 'defect'
                  ? defectStatusBadgeClass(item.status as any)
                  : planStatusClasses(item.status as string)
              }>
                {type === 'execution'
                  ? executionStatusLabel(item.status as ExecutionStatus)
                  : type === 'requirement'
                  ? requirementStatusLabel(item.status as any)
                  : type === 'defect'
                  ? defectStatusLabel(item.status as any)
                  : translateStatus(item.status as string)}
              </Badge>
            )}
            {('priority' in item && (item as any).priority) && (
              <Badge className={priorityBadgeClass((item as any).priority)}>
                {priorityLabel((item as any).priority)}
              </Badge>
            )}
            {type === 'case' && 'type' in item && item.type && (
              <Badge className={testCaseTypeBadgeClass(item.type as TestCaseType)}>
                {testCaseTypeLabel(item.type as TestCaseType)}
              </Badge>
            )}
            {type === 'defect' && 'severity' in item && (item as any).severity && (
              <Badge className={priorityBadgeClass((item as any).severity)}>
                {priorityLabel((item as any).severity)}
              </Badge>
            )}
          </div>

          {/* Descrição */}
          {desc && (
            <div>
              <h3 className={`font-medium mb-2 ${isShortDesc ? 'text-center' : ''}`}>
                Descrição
              </h3>
              {isShortDesc ? (
                <p className="text-sm text-gray-600 dark:text-gray-400 text-center">{desc}</p>
              ) : (
                renderListOrParagraph(desc)
              )}
            </div>
          )}

          {/* Conteúdo específico por tipo */}
          {type === 'plan' && (() => {
            const obj = (item as any).objective?.toString().trim();
            const scope = (item as any).scope?.toString().trim();
            const approach = (item as any).approach?.toString().trim();
            const criteria = (item as any).criteria?.toString().trim();
            const hasAny = Boolean(obj || scope || approach || criteria);
            if (!hasAny) return null;
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {obj && (
                  <div>
                    <h3 className="font-medium mb-2">Objetivo</h3>
                    {renderListOrParagraph(obj, { centerShort: true })}
                  </div>
                )}
                {scope && (
                  <div>
                    <h3 className="font-medium mb-2">Escopo</h3>
                    {renderListOrParagraph(scope, { centerShort: true })}
                  </div>
                )}
                {approach && (
                  <div>
                    <h3 className="font-medium mb-2">Abordagem</h3>
                    {renderListOrParagraph(approach, { centerShort: true })}
                  </div>
                )}
                {criteria && (
                  <div>
                    <h3 className="font-medium mb-2">Critérios</h3>
                    {renderListOrParagraph(criteria, { centerShort: true })}
                  </div>
                )}
              </div>
            );
          })()}

          {type === 'case' && 'steps' in item && (
            <div className="space-y-4">
              {item.preconditions && (
                <div>
                  <h3 className="font-medium mb-2">Pré-condições</h3>
                  {renderListOrParagraph(item.preconditions, { centerShort: true })}
                </div>
              )}
              
              <div>
                <h3 className="font-medium mb-2">Passos</h3>
                <div className="space-y-2">
                  {item.steps?.map((step: any, index: number) => (
                    <div key={index} className="border rounded-lg p-3">
                      <div className="font-medium text-sm">Passo {step.order || index + 1}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <strong>Ação:</strong> {step.action}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        <strong>Resultado esperado:</strong> {step.expected_result}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {item.expected_result && (
                <div>
                  <h3 className="font-medium mb-2">Resultado Final Esperado</h3>
                  {renderListOrParagraph(item.expected_result, { centerShort: true })}
                </div>
              )}
            </div>
          )}

          {type === 'execution' && 'actual_result' in item && (
            <div className="space-y-4">
              {item.actual_result && (
                <div>
                  <h3 className="font-medium mb-2">Resultado Obtido</h3>
                  {renderListOrParagraph(item.actual_result, { centerShort: true })}
                </div>
              )}

              {item.executed_by && (
                <div>
                  <h3 className="font-medium mb-2">Executado por</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm">{item.executed_by}</p>
                </div>
              )}
            </div>
          )}

          {/* Vínculos section */}
          {(type === 'case' || type === 'execution') && (
            <div>
              <h3 className="font-medium mb-2">Vínculos</h3>
              <div className="space-y-2">
                {'plan_id' in item && item.plan_id && (
                  <div className="text-sm">
                    <span className="font-medium">Plano de Teste:</span>{' '}
                    <Link to={`/plans?id=${item.plan_id}`} className="text-blue-600 hover:underline dark:text-blue-400" onClick={handleClose}>
                      {item.plan_id}
                    </Link>
                  </div>
                )}
                {type === 'execution' && 'case_id' in item && item.case_id && (
                  <div className="text-sm">
                    <span className="font-medium">Caso de Teste:</span>{' '}
                    <Link to={`/cases?id=${item.case_id}`} className="text-blue-600 hover:underline dark:text-blue-400" onClick={handleClose}>
                      {item.case_id}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Botões de ação */}
          <div className="flex justify-between pt-4 border-t">
            <ExportDropdown item={item} type={type} />
            
            <div className="flex gap-2">
              {type === 'plan' && ('generated_by_ai' in item && item.generated_by_ai) && (
                <Button onClick={openGenerateDialog} disabled={generating || isProjectInactive} title={isProjectInactive ? 'Projeto não ativo — geração desabilitada' : undefined}>
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-1" />
                      Gerar Casos
                    </>
                  )}
                </Button>
              )}
              {onEdit && (
                <Button variant="outline" onClick={() => onEdit(item)} disabled={isProjectInactive} title={isProjectInactive ? 'Projeto não ativo — edição desabilitada' : undefined}>
                  <Edit className="h-4 w-4 mr-1" />
                  Editar
                </Button>
              )}
              {onDelete && (
                <Button 
                  variant={confirmDelete ? "destructive" : "outline"}
                  onClick={handleDelete}
                  disabled={isProjectInactive}
                  title={isProjectInactive ? 'Projeto não ativo — exclusão desabilitada' : undefined}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  {confirmDelete ? 'Confirmar Exclusão' : 'Excluir'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Modal de Perfil do Autor */}
    <UserProfileModal
      isOpen={showAuthorModal}
      onClose={() => setShowAuthorModal(false)}
      userId={author?.id || (item as any).user_id}
      initialProfile={author || undefined}
    />

    <AlertDialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Gerar casos com IA?</AlertDialogTitle>
          <AlertDialogDescription>
            Confirme a geração de casos para este plano. Você pode adicionar um contexto extra e, opcionalmente, escolher um modelo de IA diferente.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 text-left">
          {/* Seleção de modelo */}
          {(() => {
            const cfg = ModelControlService.loadConfig();
            const activeModels = cfg?.models?.filter(m => m.active) || [];
            const defaultGeneral = cfg?.tasks?.['general-completion'];
            const defaultModel = activeModels.find(m => m.id === defaultGeneral)
              || activeModels.find(m => m.id === cfg?.defaultModel)
              || activeModels[0];
            return (
              <div className="space-y-2">
                <Label htmlFor="model-select">Modelo (opcional)</Label>
                <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                  <SelectTrigger id="model-select">
                    <SelectValue placeholder="Selecionar modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Padrão do Painel{defaultModel ? ` — ${defaultModel.name || defaultModel.id}` : ''}</SelectItem>
                    {activeModels.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name || m.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })()}

          {/* Contexto adicional */}
          <div className="space-y-2">
            <Label htmlFor="extra-context">Contexto adicional (opcional)</Label>
            <Textarea
              id="extra-context"
              placeholder="Ex.: focar nos relatórios de peças, validar permissões específicas, etc."
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
              className="min-h-[120px]"
            />
          </div>
        </div>

        <AlertDialogFooter className="pt-4">
          <AlertDialogCancel disabled={generating}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={confirmAndGenerate} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Gerando...
              </>
            ) : (
              <>Confirmar e Gerar</>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>);
};
