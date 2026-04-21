import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, Calendar, User, Sparkles, Loader2, Code, LifeBuoy, Briefcase, Shield, Eye, ClipboardList, Link2, Upload, ImageIcon, X, Bug as BugIcon } from 'lucide-react';
import { TestPlan, TestCase, TestExecution, Requirement, Defect } from '@/types';
import { ExportDropdown } from './ExportDropdown';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatLocalDateTime } from '@/lib/utils';

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
  const [linkedPlan, setLinkedPlan] = useState<{ id: string; sequence?: number | null; title?: string } | null>(null);
  const [linkedCase, setLinkedCase] = useState<{ id: string; sequence?: number | null; title?: string } | null>(null);
  const [branchImages, setBranchImages] = useState<{ name: string; dataUrl: string }[]>([]);
  const [branchFile, setBranchFile] = useState<File | null>(null);
  const [loadingBranch, setLoadingBranch] = useState(false);
  const [defectCount, setDefectCount] = useState(0);
  const [linkedReqs, setLinkedReqs] = useState<Array<{ id: string; title: string; sequence?: number | null }>>([]);
  const [linkedCases, setLinkedCases] = useState<Array<{ id: string; title: string; sequence?: number | null }>>([]);
  const { currentProject } = useProject();
  const isProjectInactive = !!currentProject && currentProject.status !== 'active';

  // Reset confirmDelete when modal is closed or item changes
  useEffect(() => {
    if (!isOpen) {
      setConfirmDelete(false);
      setLinkedPlan(null);
      setLinkedCase(null);
      setBranchImages([]);
      setBranchFile(null);
      setDefectCount(0);
      setLinkedReqs([]);
      setLinkedCases([]);
    }
  }, [isOpen]);

  // Buscar casos vinculados ao requisito
  useEffect(() => {
    if (!isOpen || !item || type !== 'requirement') return;
    const reqId = (item as any).id;
    if (!reqId) return;
    supabase
      .from('requirement_cases')
      .select('case_id, test_cases(id, title, sequence)')
      .eq('requirement_id', reqId)
      .then(({ data }) => {
        if (!data) return;
        const cases = data
          .map((row: any) => row.test_cases)
          .filter(Boolean)
          .map((c: any) => ({ id: c.id, title: c.title, sequence: c.sequence ?? null }));
        setLinkedCases(cases);
      });
  }, [isOpen, item, type]);

  // Buscar requisitos vinculados ao caso de teste
  useEffect(() => {
    if (!isOpen || !item || type !== 'case') return;
    const caseId = (item as any).id;
    if (!caseId) return;
    supabase
      .from('requirement_cases')
      .select('requirement_id, requirements(id, title, sequence)')
      .eq('case_id', caseId)
      .then(({ data }) => {
        if (!data) return;
        const reqs = data
          .map((row: any) => row.requirements)
          .filter(Boolean)
          .map((r: any) => ({ id: r.id, title: r.title, sequence: r.sequence ?? null }));
        setLinkedReqs(reqs);
      });
  }, [isOpen, item, type]);

  // Buscar contagem de defeitos para execuções
  useEffect(() => {
    if (!isOpen || !item || type !== 'execution') return;
    const caseId = (item as any).case_id as string | undefined;
    if (!caseId) return;
    supabase.from('defects').select('id', { count: 'exact', head: true })
      .eq('case_id', caseId).neq('status', 'closed')
      .then(({ count }) => setDefectCount(count || 0));
  }, [isOpen, item, type]);

  const handleBranchFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBranchFile(f);
    setBranchImages([]);
    setLoadingBranch(true);
    const ext = f.name.toLowerCase().split('.').pop() || '';
    const isPlainText = f.type === 'text/plain' || ext === 'txt' || ext === 'md';
    if (isPlainText) { setLoadingBranch(false); return; }
    try {
      const token = localStorage.getItem('krg_local_auth_token');
      const form = new FormData();
      form.append('file', f);
      const res = await fetch('/api/documents/extract', {
        method: 'POST', body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error((await res.json()).error?.message || 'Erro ao extrair');
      const { images: extracted } = await res.json();
      setBranchImages(extracted || []);
    } catch (err: any) {
      toast({ title: 'Erro ao extrair branches', description: err?.message, variant: 'destructive' });
    } finally {
      setLoadingBranch(false);
    }
  };

  // Fetch linked plan/case for vínculos section
  useEffect(() => {
    if (!isOpen || !item) return;
    const planId = (item as any).plan_id as string | undefined;
    const caseId = (item as any).case_id as string | undefined;
    if (planId) {
      supabase.from('test_plans').select('id, sequence, title').eq('id', planId).maybeSingle()
        .then(({ data }) => { if (data) setLinkedPlan(data as any); });
    }
    if (caseId) {
      supabase.from('test_cases').select('id, sequence, title').eq('id', caseId).maybeSingle()
        .then(({ data }) => { if (data) setLinkedCase(data as any); });
    }
  }, [isOpen, item]);

  useEffect(() => {
    setConfirmDelete(false);
  }, [item]);

  const formatDate = (date: Date) => {
    return formatLocalDateTime(date);
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
        // Always try profiles table first (works regardless of SINGLE_TENANT)
        try {
          const res = await supabase
            .from('profiles' as any)
            .select('id, email, display_name, avatar_url, github_url, google_url, website_url, tags, role')
            .eq('id', uid)
            .maybeSingle();
          const data = res.data; const error = res.error;
          if (data && !error) {
            const effectiveRole = (data as any).role || (SINGLE_TENANT ? 'master' : undefined);
            setAuthor({
              id: (data as any).id,
              email: (data as any).email,
              display_name: (data as any).display_name,
              avatar_url: (data as any).avatar_url,
              github_url: (data as any).github_url,
              google_url: (data as any).google_url,
              website_url: (data as any).website_url,
              tags: (data as any).tags || [],
              role: effectiveRole,
            });
            if (Array.isArray((data as any).tags) && (data as any).tags.length > 0) {
              setAuthorTags((data as any).tags);
            } else {
              // Fallback: user_metadata.tags (SINGLE_TENANT mode stores tags there)
              try {
                const { data: authData } = await supabase.auth.getUser();
                if (authData?.user?.id === uid) {
                  const mt = (authData.user.user_metadata as any)?.tags;
                  if (Array.isArray(mt)) setAuthorTags(mt);
                }
              } catch {}
            }
            return;
          }
        } catch {}
        // Fallback: auth.getUser() (SINGLE_TENANT or when profile row is missing)
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
            role: SINGLE_TENANT ? 'master' : (me.user_metadata as any)?.role,
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
      if (branchImages.length > 0) parts.push(`Branches da sprint detectadas: ${branchImages.length} imagem(ns) anexadas (ver dados visuais).`);

      // Extrair branches reais do plano para direcionar os casos
      const planBranchesRaw = (plan as any).branches?.toString().trim() || '';
      const branchLines = planBranchesRaw
        .split('\n')
        .map((l: string) => l.replace(/^[\*\-]\s*/, '').trim())
        .filter((l: string) => l && /^[\w\-\/\.]+$/.test(l));

      const documentContent = parts.join('\n\n');

      const branchInstruction = branchLines.length > 0
        ? `\n      BRANCHES DA SPRINT (CRÍTICO): Este plano cobre as seguintes branches: ${branchLines.join(', ')}.\n      - Crie EXATAMENTE um caso de teste para cada branch listada acima.\n      - O título de cada caso deve mencionar explicitamente o nome da branch ou funcionalidade correspondente.\n      - Não crie casos genéricos: cada caso deve ser específico para sua branch/funcionalidade.`
        : '';

      const prompt = `
      Analise o seguinte documento${branchImages.length > 0 ? ' e as imagens de branches da sprint anexadas' : ''} e crie casos de teste específicos para cada funcionalidade/branch identificada.${branchInstruction}

      DOCUMENTO:
      ${documentContent}

      INSTRUÇÕES IMPORTANTES:
      - Para cada branch ou funcionalidade, crie UM caso de teste específico e detalhado
      - Seja DIRETO e ESPECÍFICO, o título do caso deve refletir a branch/funcionalidade
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
            "branch": "<nome exato da branch deste caso — copie da lista acima, sem # ou prefixo>",
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
        { prompt, images: branchImages.length > 0 ? branchImages.map(i => i.dataUrl) : undefined },
        effectiveModelId || undefined
      );

      const parsed: any = extractAndParseJSON(generatedData);
      const casesRaw: any = (parsed?.cases || parsed?.test_cases || parsed?.testCases);
      if (!casesRaw || !Array.isArray(casesRaw)) {
        const snippet = typeof generatedData === 'string' ? generatedData.slice(0, 200) : JSON.stringify(parsed).slice(0, 200);
        throw new Error(`Formato de resposta inválido: esperado array "cases". Amostra recebida: ${snippet}...`);
      }

      console.log('[AI Cases] branches do plano:', branchLines);
      console.log('[AI Cases] casos recebidos da IA:', (casesRaw as any[]).map((c: any) => ({ title: c?.title, branch: c?.branch || c?.branches })));

      const casesToInsert = (casesRaw as any[]).map((c: any, idx: number) => {
        const stepsArray = Array.isArray(c?.steps) ? c.steps : (
          typeof c?.steps === 'string'
            ? c.steps.split(/\r?\n/).filter(Boolean).map((line: string) => ({ action: line.trim(), expected_result: '' }))
            : []
        );
        // Associa branch: 1) campo retornado pela IA (se for token valido) 2) round-robin
        const isValidBranch = (s: string) => !!s && s.length >= 3 && s.length <= 100
          && !/\*\*/.test(s) && !/\s/.test(s) && /^[\w\-\/\.\u00C0-\u017F]+$/.test(s);
        const iaBranchRaw = (typeof c?.branch === 'string' && c.branch.trim()) || (typeof c?.branches === 'string' && c.branches.trim()) || '';
        const iaBranch = isValidBranch(iaBranchRaw) ? iaBranchRaw : '';
        const fallbackBranch = branchLines.length > 0 ? branchLines[idx % branchLines.length] : '';
        const caseBranch = iaBranch || fallbackBranch || '';
        return {
          plan_id: plan.id,
          title: sanitizeText(typeof c?.title === 'string' ? c.title : c?.name || `Caso ${idx + 1}`),
          description: sanitizeText(typeof c?.description === 'string' ? c.description : ''),
          preconditions: sanitizeText(typeof c?.preconditions === 'string' ? c.preconditions : ''),
          expected_result: sanitizeText(typeof c?.expected_result === 'string' ? c.expected_result : ''),
          priority: sanitizeText(typeof c?.priority === 'string' ? c.priority : 'medium'),
          type: sanitizeText(typeof c?.type === 'string' ? c.type : 'functional'),
          branches: sanitizeText(caseBranch),
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

      console.log('[AI Cases] payload enviado ao DB (branches por caso):', casesToInsert.map((c: any) => ({ title: c.title, branches: c.branches })));

      const { data: insertedCases, error } = await supabase
        .from('test_cases')
        .insert(casesToInsert)
        .select();
      if (error) throw error;

      console.log('[AI Cases] casos persistidos (verificar se coluna branches existe no DB):', (insertedCases || []).map((c: any) => ({ id: c.id, title: c.title, branches: c.branches })));
      if (insertedCases && insertedCases.length > 0 && !('branches' in insertedCases[0])) {
        toast({ title: 'Aviso', description: 'Coluna "branches" não existe em test_cases — reinicie o servidor (npm run dev:all) para aplicar a migration.', variant: 'destructive' });
      }

      // Auto-criar requisito + vínculo para cada caso gerado
      let reqCount = 0;
      if (Array.isArray(insertedCases) && insertedCases.length > 0) {
        const { createRequirement, linkCaseToRequirement } = await import('@/services/supabaseService');
        await Promise.all(insertedCases.map(async (tc: any) => {
          try {
            const newReq = await createRequirement({
              user_id: plan.user_id,
              project_id: (plan as any).project_id,
              title: tc.title,
              description: `Requisito gerado automaticamente a partir do caso: ${tc.title}`,
              priority: (tc.priority || 'medium') as any,
              status: 'open',
            } as any);
            await linkCaseToRequirement(plan.user_id, newReq.id, tc.id);
            reqCount++;
          } catch (err) {
            console.warn('[AI Cases] falha ao criar requisito para caso', tc.id, err);
          }
        }));
      }

      toast({
        title: 'Sucesso',
        description: `${casesToInsert.length} caso(s) e ${reqCount} requisito(s) criados e vinculados ao plano.`
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
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogTitle className="sr-only">{getTypeLabel()} — {getItemTitle()}</DialogTitle>

        {/* ── Header ── */}
        <div className="mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-foreground leading-snug">
              {getTypeLabel()} — {getItemTitle()}
            </h2>
            {type === 'execution' && defectCount > 0 && (
              <span className="inline-flex items-center gap-1 text-destructive text-xs font-semibold shrink-0" title={`${defectCount} defeito(s) aberto(s)`}>
                <BugIcon className="h-4 w-4" />
                {defectCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {('status' in item && item.status) && (
              <Badge className={
                type === 'execution' ? executionStatusBadgeClass(item.status as ExecutionStatus)
                : type === 'requirement' ? requirementStatusBadgeClass(item.status as any)
                : type === 'defect' ? defectStatusBadgeClass(item.status as any)
                : planStatusClasses(item.status as string)
              }>
                {type === 'execution' ? executionStatusLabel(item.status as ExecutionStatus)
                : type === 'requirement' ? requirementStatusLabel(item.status as any)
                : type === 'defect' ? defectStatusLabel(item.status as any)
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
            {('generated_by_ai' in item && Boolean(item.generated_by_ai)) && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                IA
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-5 text-sm text-muted-foreground mt-2.5 flex-wrap">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              {type === 'execution' ? 'Executado em:' : 'Criado em:'}{' '}
              {formatDate(getItemDate())}
            </span>
            <span className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 shrink-0" />
              Autor:{' '}
              <button
                type="button"
                className="text-brand hover:underline font-medium ml-0.5 focus:outline-none bg-transparent border-0 p-0"
                onClick={() => setShowAuthorModal(true)}
              >
                {author?.display_name || author?.email || 'ver perfil'}
              </button>
              {author?.role && (
                <span className="ml-0.5">({userRoleLabel[author.role] || author.role})</span>
              )}
            </span>
          </div>
        </div>

        <hr className="border-border" />

        <div className="py-5 space-y-5">

          {/* Descrição */}
          {desc && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1.5">Descrição</h3>
              {renderListOrParagraph(desc)}
            </div>
          )}

          {type === 'plan' && (() => {
            const obj       = (item as any).objective?.toString().trim();
            const scope     = (item as any).scope?.toString().trim();
            const approach  = (item as any).approach?.toString().trim();
            const criteria  = (item as any).criteria?.toString().trim();
            const resources = (item as any).resources?.toString().trim();
            const schedule  = (item as any).schedule?.toString().trim();
            const risks     = (item as any).risks?.toString().trim();
            const branchesRaw = ((item as any).branches?.toString().trim()) || '';

            // Testa se um token isolado parece nome de branch real
            const isBranchName = (s: string): boolean => {
              if (!s || s.length > 100 || s.length < 3) return false;
              if (/\*\*/.test(s)) return false; // markdown bold
              if (/\s/.test(s)) return false;   // sem espacos — sempre token unico
              // snake_case, kebab-case, slash, pontos, acentos
              return /^[\w\-\/\.\u00C0-\u017F]+$/.test(s);
            };

            const parseBranchGroups = (raw: string): { group: string; items: string[] }[] => {
              if (!raw) return [];
              const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
              const groups: { group: string; items: string[] }[] = [];
              let current: { group: string; items: string[] } | null = null;
              const groupHeaderRex = /^([A-Za-zÀ-ú\s\-]+):$/;
              for (const line of lines) {
                if (groupHeaderRex.test(line) && !line.startsWith('*') && !line.startsWith('-')) {
                  current = { group: line.replace(/:$/, '').trim(), items: [] };
                  groups.push(current);
                  continue;
                }
                // Remove marcadores de lista e divide por espaco/virgula/ponto-e-virgula
                const cleaned = line.replace(/^[\*\-\u2022]\s*/, '').trim();
                const tokens = cleaned.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean);
                for (const tk of tokens) {
                  if (isBranchName(tk)) {
                    if (!current) { current = { group: 'Geral', items: [] }; groups.push(current); }
                    if (!current.items.includes(tk)) current.items.push(tk);
                  }
                }
              }
              return groups.filter(g => g.items.length > 0);
            };

            const branchGroups = parseBranchGroups(branchesRaw);
            const legacyBranchGroups = branchGroups.length === 0 && resources ? parseBranchGroups(resources) : [];
            const allBranchGroups = branchGroups.length > 0 ? branchGroups : legacyBranchGroups;
            const totalBranches = allBranchGroups.reduce((acc, g) => acc + g.items.length, 0);

            if (!obj && !scope && !approach && !criteria && !schedule && !risks && allBranchGroups.length === 0) return null;

            // Ordenar campos por tamanho (curtos primeiro) para masonry natural
            const gridItems: { label: string; content: string }[] = [
              obj      ? { label: 'Objetivo',   content: obj }      : null,
              approach ? { label: 'Abordagem',  content: approach } : null,
              schedule ? { label: 'Cronograma', content: schedule } : null,
              scope    ? { label: 'Escopo',     content: scope }    : null,
              criteria ? { label: 'Critérios',  content: criteria } : null,
              risks    ? { label: 'Riscos',     content: risks }    : null,
            ].filter(Boolean) as { label: string; content: string }[];

            return (
              <>
                {gridItems.length > 0 && (
                  <div className="md:columns-2 md:gap-5 space-y-5 md:space-y-0">
                    {gridItems.map((field) => (
                      <div key={field.label} className="break-inside-avoid md:mb-5">
                        <h3 className="text-sm font-semibold text-foreground mb-1.5">{field.label}</h3>
                        {renderListOrParagraph(field.content)}
                      </div>
                    ))}
                  </div>
                )}
                {allBranchGroups.length > 0 && (
                  <div className="rounded-lg border border-brand/30 bg-brand/5 p-3.5">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
                      <span className="h-2 w-2 rounded-full bg-brand inline-block" />
                      Branches de Entrega
                      <span className="ml-auto text-xs font-normal text-muted-foreground">{totalBranches} branch{totalBranches !== 1 ? 'es' : ''}</span>
                    </h3>
                    <div className="space-y-2.5">
                      {allBranchGroups.map((group, gi) => (
                        <div key={gi}>
                          {allBranchGroups.length > 1 && (
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">{group.group}</p>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {group.items.map((b, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(b);
                                    toast({ title: 'Branch copiada', description: b });
                                  } catch {
                                    toast({ title: 'Falha ao copiar', description: b, variant: 'destructive' });
                                  }
                                }}
                                title={`Copiar ${b}`}
                                className="inline-flex items-center gap-1 rounded-md bg-brand/10 border border-brand/20 hover:bg-brand/20 active:scale-95 transition px-2 py-0.5 text-xs font-mono text-brand cursor-pointer"
                              >
                                <span className="opacity-60">#</span>{b}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {type === 'case' && 'steps' in item && (
            <div className="space-y-4">
              {(() => {
                const raw = (item as any).branches?.toString().trim() || '';
                if (!raw) return null;
                // Aceita so tokens que parecem branch real (sem espacos, pelo menos 3 chars)
                const isValid = (s: string) => !!s && s.length >= 3 && s.length <= 100
                  && !/\*\*/.test(s) && /^[\w\-\/\.\u00C0-\u017F]+$/.test(s);
                const tokens = raw.split(/[\s,;]+/).map((b: string) => b.trim()).filter(isValid);
                if (tokens.length === 0) return null;
                return (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1.5">Branch</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {tokens.map((b: string, i: number) => (
                      <button
                        key={i}
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(b);
                            toast({ title: 'Branch copiada', description: b });
                          } catch {
                            toast({ title: 'Falha ao copiar', description: b, variant: 'destructive' });
                          }
                        }}
                        title={`Copiar ${b}`}
                        className="inline-flex items-center gap-1 rounded-md bg-brand/10 border border-brand/20 hover:bg-brand/20 active:scale-95 transition px-2 py-0.5 text-xs font-mono text-brand cursor-pointer"
                      >
                        <span className="opacity-60">#</span>{b}
                      </button>
                    ))}
                  </div>
                </div>
                );
              })()}
              {item.preconditions && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1.5">Pré-condições</h3>
                  {renderListOrParagraph(item.preconditions)}
                </div>
              )}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Passos</h3>
                <div className="space-y-2">
                  {item.steps?.map((step: any, index: number) => (
                    <div key={index} className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                        Passo {step.order || index + 1}
                      </div>
                      <div className="text-sm"><span className="font-medium">Ação: </span><span className="text-muted-foreground">{step.action}</span></div>
                      <div className="text-sm mt-0.5"><span className="font-medium">Resultado esperado: </span><span className="text-muted-foreground">{step.expected_result}</span></div>
                    </div>
                  ))}
                </div>
              </div>
              {item.expected_result && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1.5">Resultado Final Esperado</h3>
                  {renderListOrParagraph(item.expected_result)}
                </div>
              )}
            </div>
          )}

          {type === 'execution' && 'actual_result' in item && (
            <div className="space-y-4">
              {item.actual_result && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1.5">Resultado Obtido</h3>
                  {renderListOrParagraph(item.actual_result)}
                </div>
              )}
              {item.executed_by && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-1.5">Executado por</h3>
                  <p className="text-sm text-muted-foreground">{item.executed_by}</p>
                </div>
              )}
            </div>
          )}

          {/* Imagens de branches — apenas quando geração IA está disponível */}
          {false && type === 'case' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  Imagens de Referência
                </h3>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded-md px-2.5 py-1.5 transition-colors">
                  {loadingBranch ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {branchFile ? <span className="max-w-[140px] truncate">{branchFile.name}</span> : 'Importar documento'}
                  <input type="file" className="sr-only" accept=".pptx,.pdf,.docx,.doc" onChange={handleBranchFileChange} disabled={loadingBranch} />
                </label>
              </div>
              {branchImages.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2 p-2 bg-muted/30 rounded-md border border-border/40 max-h-48 overflow-y-auto">
                    {branchImages.map((img, idx) => (
                      <div key={idx} className="relative flex-shrink-0">
                        <img
                          src={img.dataUrl}
                          alt={`Ref ${idx + 1}`}
                          className="h-20 w-28 object-cover rounded border border-border/60 cursor-pointer hover:opacity-90 transition-opacity"
                          title={img.name}
                          onClick={() => window.open(img.dataUrl, '_blank')}
                        />
                        <span className="absolute top-1 left-1 h-4 w-4 bg-brand text-white text-[10px] rounded-full flex items-center justify-center font-mono">
                          {idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground">
                      {branchImages.length} imagem(ns) — clique para ampliar. Serão enviadas para a IA na geração de casos.
                    </p>
                    <button type="button" onClick={() => { setBranchImages([]); setBranchFile(null); }}
                      className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-0.5 transition-colors">
                      <X className="h-3 w-3" /> Limpar
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Importe um documento com imagens de referência para usá-las na geração de casos com IA.
                </p>
              )}
            </div>
          )}

          {/* Vínculos para requisito — casos vinculados */}
          {type === 'requirement' && linkedCases.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Casos Vinculados</h3>
              <div className="flex flex-wrap gap-1.5">
                {linkedCases.map(c => (
                  <Link
                    key={c.id}
                    to={`/cases?id=${c.id}`}
                    className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded font-mono hover:bg-brand/20 transition-colors"
                    onClick={handleClose}
                  >
                    {c.sequence != null ? `CT-${String(c.sequence).padStart(3, '0')}` : c.title}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Vínculos */}
          {(type === 'case' || type === 'execution') &&
            (('plan_id' in item && (item as any).plan_id) ||
            (type === 'execution' && 'case_id' in item && (item as any).case_id) ||
            (type === 'case' && linkedReqs.length > 0)) && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Vínculos</h3>
              <div className="space-y-1.5">
                {'plan_id' in item && (item as any).plan_id && (
                  <div className="flex items-center gap-2 text-sm">
                    <ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-foreground">Plano de Teste:</span>{' '}
                    <Link to={`/plans?id=${(item as any).plan_id}`} className="text-brand hover:underline" onClick={handleClose}>
                      {linkedPlan
                        ? (linkedPlan.sequence != null ? `PT-${String(linkedPlan.sequence).padStart(3, '0')} — ${linkedPlan.title || ''}` : linkedPlan.title || (item as any).plan_id)
                        : (item as any).plan_id}
                    </Link>
                  </div>
                )}
                {type === 'case' && linkedReqs.length > 0 && (
                  <div className="flex items-start gap-2 text-sm">
                    <Link2 className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <span className="font-medium text-foreground">Requisitos vinculados:</span>{' '}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {linkedReqs.map(r => (
                          <Link
                            key={r.id}
                            to={`/management?tab=requirements&id=${r.id}&modal=req:view`}
                            className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded font-mono hover:bg-brand/20 transition-colors"
                            onClick={handleClose}
                          >
                            {r.sequence != null ? `REQ-${String(r.sequence).padStart(3, '0')}` : r.title}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {type === 'execution' && 'case_id' in item && (item as any).case_id && (
                  <div className="flex items-center gap-2 text-sm">
                    <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium text-foreground">Caso de Teste:</span>{' '}
                    <Link to={`/cases?id=${(item as any).case_id}`} className="text-brand hover:underline" onClick={handleClose}>
                      {linkedCase
                        ? (linkedCase.sequence != null ? `CT-${String(linkedCase.sequence).padStart(3, '0')} — ${linkedCase.title || ''}` : linkedCase.title || (item as any).case_id)
                        : (item as any).case_id}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <hr className="border-border" />

        {/* ── Footer ── */}
        <div className="flex items-center justify-between pt-4">
          <ExportDropdown item={item} type={type} />
          <div className="flex gap-2">
            {type === 'plan' && ('generated_by_ai' in item && Boolean(item.generated_by_ai)) && (
              <Button onClick={openGenerateDialog} disabled={generating || isProjectInactive} title={isProjectInactive ? 'Projeto não ativo — geração desabilitada' : undefined}>
                {generating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando...</>
                ) : (
                  <><Sparkles className="h-4 w-4 mr-1" />Gerar Casos</>
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
