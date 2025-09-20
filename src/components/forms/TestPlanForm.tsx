
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Plus } from 'lucide-react';

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

  return (
    <Card className="w-full max-w-4xl mx-auto border-brand/20 shadow-2xl">
      <CardHeader className="bg-gradient-to-r from-brand/5 to-brand/10 border-b border-brand/20">
        <CardTitle className="text-brand text-xl font-semibold">
          {initialData ? 'Editar Plano #' + (initialData.sequence ? String(initialData.sequence).padStart(2, '0') : initialData.id.slice(0, 4)) : 'Criar Novo Plano de Teste'}
        </CardTitle>
        {initialData && (
          <p className="text-sm text-muted-foreground mt-1">
            Atualize os campos do plano de teste selecionado.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                required
                className="focus:border-brand/50 focus:ring-brand/20"
              />
            </div>
            <div>
              <Label htmlFor="objective">Objetivo</Label>
              <Input
                id="objective"
                value={formData.objective}
                onChange={(e) => handleChange('objective', e.target.value)}
                className="focus:border-brand/50 focus:ring-brand/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="project">Projeto</Label>
              <ProjectSelectField 
                value={formData.project_id}
                onValueChange={value => handleChange('project_id', value)}
              />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Select value={formData.status} onValueChange={(value) => handleChange('status', value)}>
                    <SelectTrigger className="focus:border-brand/50 focus:ring-brand/20">
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                    <SelectContent>
                      {displayStatusOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <StandardButton
                  type="button"
                  variant="outline"
                  size="icon"
                  iconOnly
                  ariaLabel="Gerenciar status"
                  onClick={() => setStatusModalOpen(true)}
                  icon={Plus}
                >
                </StandardButton>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              rows={3}
              className="focus:border-brand/50 focus:ring-brand/20"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="scope">Escopo</Label>
              <Textarea
                id="scope"
                value={formData.scope}
                onChange={(e) => handleChange('scope', e.target.value)}
                rows={3}
                className="focus:border-brand/50 focus:ring-brand/20"
              />
            </div>
            <div>
              <Label htmlFor="approach">Abordagem</Label>
              <Textarea
                id="approach"
                value={formData.approach}
                onChange={(e) => handleChange('approach', e.target.value)}
                rows={3}
                className="focus:border-brand/50 focus:ring-brand/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="criteria">Critérios</Label>
              <Textarea
                id="criteria"
                value={formData.criteria}
                onChange={(e) => handleChange('criteria', e.target.value)}
                rows={3}
                className="focus:border-brand/50 focus:ring-brand/20"
              />
            </div>
            <div>
              <Label htmlFor="resources">Recursos</Label>
              <Textarea
                id="resources"
                value={formData.resources}
                onChange={(e) => handleChange('resources', e.target.value)}
                rows={3}
                className="focus:border-brand/50 focus:ring-brand/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="schedule">Cronograma</Label>
              <Textarea
                id="schedule"
                value={formData.schedule}
                onChange={(e) => handleChange('schedule', e.target.value)}
                rows={3}
                className="focus:border-brand/50 focus:ring-brand/20"
              />
            </div>
            <div>
              <Label htmlFor="risks">Riscos</Label>
              <Textarea
                id="risks"
                value={formData.risks}
                onChange={(e) => handleChange('risks', e.target.value)}
                rows={3}
                className="focus:border-brand/50 focus:ring-brand/20"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            {onCancel && (
              <Button type="button" variant="outline" onClick={() => { try { localStorage.removeItem(storageKey); } catch (e) { /* noop */ } onCancel?.(); }}>
                Cancelar
              </Button>
            )}
            <StandardButton type="submit" disabled={loading} className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white border-0">
              {loading ? (initialData ? 'Atualizando...' : 'Criando...') : (initialData ? 'Atualizar' : 'Criar')} Plano
            </StandardButton>
          </div>
        </form>
      </CardContent>
      <StatusManagerModal
        open={statusModalOpen}
        onOpenChange={setStatusModalOpen}
        projectId={currentProject?.id}
        onAdded={(value) => {
          handleChange('status', value);
          setStatusModalOpen(false);
        }}
      />
    </Card>
  );
};
