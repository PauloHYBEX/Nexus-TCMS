
import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { createTestPlan, updateTestPlan } from '@/services/supabaseService';
import { toast } from '@/components/ui/use-toast';
import { TestPlan } from '@/types';
import { ProjectSelectField } from '@/components/forms/ProjectSelectField';
import { useProject } from '@/contexts/ProjectContext';
import { StandardButton } from '@/components/StandardButton';
import { useStatusOptions } from '@/hooks/useStatusOptions';
import { StatusManagerModal } from '@/components/StatusManagerModal';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';

interface TestPlanFormProps {
  onSuccess?: (plan: TestPlan) => void;
  onCancel?: () => void;
  initialData?: TestPlan;
}

export const TestPlanForm = ({ onSuccess, onCancel, initialData }: TestPlanFormProps) => {
  const { user } = useAuth();
  const { currentProject } = useProject();
  const [loading, setLoading] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const { options } = useStatusOptions(currentProject?.id);
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    objective: initialData?.objective || '',
    scope: initialData?.scope || '',
    approach: initialData?.approach || '',
    criteria: initialData?.criteria || '',
    resources: initialData?.resources || '',
    schedule: initialData?.schedule || '',
    risks: initialData?.risks || '',
    status: initialData?.status || 'draft',
    project_id: initialData?.project_id || currentProject?.id || ''
  });

  const displayStatusOptions = useMemo(() => {
    if (!formData.status) return options;
    const exists = options.some(o => o.value === formData.status);
    return exists ? options : [...options, { value: formData.status, label: formData.status }];
  }, [options, formData.status]);

  const isEdit = !!initialData?.id;
  const storageKey = (() => {
    const scope = `${user?.id || 'anon'}:${currentProject?.id || 'all'}`;
    return isEdit ? `draft:testplan:edit:${initialData!.id}:${scope}` : `draft:testplan:new:${scope}`;
  })();

  // Hydrate draft from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        setFormData(prev => ({ ...prev, ...saved }));
      }
    } catch (e) { /* noop */ }
     
  }, [storageKey]);

  // Persist draft on change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(formData));
    } catch (e) { /* noop */ }
  }, [formData, storageKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      let plan;
      if (initialData) {
        plan = await updateTestPlan(initialData.id, { ...formData });
        toast({
          title: "Sucesso",
          description: "Plano de teste atualizado com sucesso!"
        });
      } else {
        plan = await createTestPlan({
          ...formData,
          user_id: user.id,
          generated_by_ai: false
        });
        toast({
          title: "Sucesso",
          description: "Plano de teste criado com sucesso!"
        });
      }

      onSuccess?.(plan);
      try { localStorage.removeItem(storageKey); } catch (e) { /* noop */ }
    } catch (error) {
      console.error('Erro ao salvar plano:', error);
      toast({
        title: "Erro",
        description: `Erro ao ${initialData ? 'atualizar' : 'criar'} plano de teste`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Linha 1: Título + Projeto */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="title" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Título *</Label>
          <Input
            id="title"
            value={formData.title}
            onChange={(e) => handleChange('title', e.target.value)}
            placeholder="Nome do plano de teste"
            required
            className="h-9 bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Projeto</Label>
          <ProjectSelectField
            value={formData.project_id}
            onValueChange={value => handleChange('project_id', value)}
          />
        </div>
      </div>

      {/* Linha 2: Objetivo + Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="objective" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Objetivo</Label>
          <Input
            id="objective"
            value={formData.objective}
            onChange={(e) => handleChange('objective', e.target.value)}
            placeholder="Objetivo principal do plano"
            className="h-9 bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</Label>
          <div className="flex gap-2">
            <Select value={formData.status} onValueChange={(value) => handleChange('status', value)}>
              <SelectTrigger className="flex-1 h-9 bg-muted/30 border-border/60 focus:ring-0">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {displayStatusOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <StandardButton type="button" variant="outline" size="icon" iconOnly ariaLabel="Novo status" onClick={() => setStatusModalOpen(true)} icon={Plus} />
          </div>
        </div>
      </div>

      {/* Descrição */}
      <div className="space-y-1.5">
        <Label htmlFor="description" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Descrição</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Descreva o escopo e contexto do plano..."
          rows={3}
          className="bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0 resize-none"
        />
      </div>

      {/* Campos avançados colapsáveis */}
      <button
        type="button"
        onClick={() => setShowAdvanced(v => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {showAdvanced ? 'Ocultar campos avançados' : 'Campos avançados (escopo, critérios, riscos...)'}
      </button>

      {showAdvanced && (
        <div className="space-y-4 pt-1 border-t border-border/40">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Escopo</Label>
              <Textarea value={formData.scope} onChange={(e) => handleChange('scope', e.target.value)} rows={2} className="bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0 resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Abordagem</Label>
              <Textarea value={formData.approach} onChange={(e) => handleChange('approach', e.target.value)} rows={2} className="bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0 resize-none" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Critérios</Label>
              <Textarea value={formData.criteria} onChange={(e) => handleChange('criteria', e.target.value)} rows={2} className="bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0 resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Recursos</Label>
              <Textarea value={formData.resources} onChange={(e) => handleChange('resources', e.target.value)} rows={2} className="bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0 resize-none" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cronograma</Label>
              <Textarea value={formData.schedule} onChange={(e) => handleChange('schedule', e.target.value)} rows={2} className="bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0 resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Riscos</Label>
              <Textarea value={formData.risks} onChange={(e) => handleChange('risks', e.target.value)} rows={2} className="bg-muted/30 border-border/60 focus:border-brand/50 focus:ring-0 resize-none" />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
        {onCancel && (
          <StandardButton type="button" variant="outline" onClick={() => { try { localStorage.removeItem(storageKey); } catch {} onCancel?.(); }}>
            Cancelar
          </StandardButton>
        )}
        <StandardButton type="submit" disabled={loading} variant="brand">
          {loading ? (initialData ? 'Salvando...' : 'Criando...') : (initialData ? 'Salvar Plano' : 'Criar Plano')}
        </StandardButton>
      </div>

      <StatusManagerModal
        open={statusModalOpen}
        onOpenChange={setStatusModalOpen}
        projectId={currentProject?.id}
        onAdded={(value) => { handleChange('status', value); setStatusModalOpen(false); }}
      />
    </form>
  );
};
