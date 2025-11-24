import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Requirements } from '@/pages/Requirements';
import { TraceabilityMatrix } from '@/pages/TraceabilityMatrix';
import { Defects } from '@/pages/Defects';
import { useSearchParams } from 'react-router-dom';
import { ViewModeToggle } from '@/components/ViewModeToggle';
import { StandardButton } from '@/components/StandardButton';
import { Plus } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useProject } from '@/contexts/ProjectContext';

export const Gestao = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission } = usePermissions();
  const { currentProject } = useProject();
  const isProjectInactive = !!currentProject && currentProject.status !== 'active';
  const [tab, setTab] = useState<'requirements' | 'traceability' | 'defects'>(() => {
    const t = (searchParams.get('tab') || 'requirements') as any;
    if (t === 'traceability' || t === 'defects' || t === 'requirements') return t;
    return 'requirements';
  });
  const [tabView, setTabView] = useState<{requirements: 'cards'|'list'; traceability: 'cards'|'list'; defects: 'cards'|'list' }>({
    requirements: 'list',
    traceability: 'list',
    defects: 'list',
  });

  // Sincroniza a aba com a URL
  useEffect(() => {
    const t = searchParams.get('tab');
    if (!t) return; 
    if (t === 'requirements' || t === 'traceability' || t === 'defects') {
      setTab(t);
    }
  }, [searchParams]);

  const handleTabChange = (value: string) => {
    const next = (value as any) as 'requirements' | 'traceability' | 'defects';
    setTab(next);
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params);
  };

  const handleCreate = () => {
    const params = new URLSearchParams(searchParams);
    // Sinalizar abertura de criação na aba atual
    if (tab === 'requirements') {
      params.set('openCreate', '1');
      setSearchParams(params);
      return;
    }
    if (tab === 'defects') {
      params.set('openCreate', '1');
      setSearchParams(params);
      return;
    }
    // Na aba de rastreabilidade, redirecionar para Requisitos e abrir criação
    if (tab === 'traceability') {
      params.set('tab', 'requirements');
      params.set('openCreate', '1');
      setSearchParams(params);
      return;
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header padrão como outras páginas */}
      <div className="flex items-center justify-between">
        <div className="pl-24">
          <h1 className="text-2xl font-bold text-foreground">Gestão</h1>
          <p className="text-sm text-muted-foreground">Organize requisitos, vínculos e defeitos</p>
        </div>
        {((tab === 'requirements' || tab === 'traceability') && hasPermission('can_manage_cases')) || (tab === 'defects' && hasPermission('can_manage_executions')) ? (
          <StandardButton
            variant="brand"
            onClick={handleCreate}
            disabled={!currentProject || isProjectInactive}
            title={!currentProject ? 'Selecione um projeto ativo para criar' : (isProjectInactive ? 'Projeto não ativo — criação desabilitada' : undefined)}
          >
            <Plus className="h-4 w-4 mr-2" />
            {tab === 'requirements' || tab === 'traceability' ? 'Novo Requisito' : 'Novo Defeito'}
          </StandardButton>
        ) : null}
      </div>

      <div className="mt-2">
        <Tabs value={tab} onValueChange={handleTabChange}>
          <div className="flex items-center justify-between">
            <TabsList className="bg-transparent p-0 h-auto border-b border-border rounded-none">
              <TabsTrigger value="requirements" className="rounded-none px-3 pb-3 pt-1 data-[state=active]:border-b-2 data-[state=active]:border-brand data-[state=active]:text-brand">
                Requisitos
              </TabsTrigger>
              <TabsTrigger value="traceability" className="rounded-none px-3 pb-3 pt-1 data-[state=active]:border-b-2 data-[state=active]:border-brand data-[state=active]:text-brand">
                Matriz de Rastreabilidade
              </TabsTrigger>
              <TabsTrigger value="defects" className="rounded-none px-3 pb-3 pt-1 data-[state=active]:border-b-2 data-[state=active]:border-brand data-[state=active]:text-brand">
                Defeitos
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-3">
              <ViewModeToggle
                viewMode={tabView[tab]}
                onViewModeChange={(mode) => setTabView(v => ({ ...v, [tab]: mode }))}
              />
            </div>
          </div>

          <TabsContent value="requirements" className="mt-4">
            <Requirements 
              embedded 
              preferredViewMode={tabView.requirements}
              onPreferredViewModeChange={(mode) => setTabView(v => ({ ...v, requirements: mode }))}
            />
          </TabsContent>

          <TabsContent value="traceability" className="mt-4">
            <TraceabilityMatrix 
              embedded 
              preferredViewMode={tabView.traceability}
              onPreferredViewModeChange={(mode) => setTabView(v => ({ ...v, traceability: mode }))}
            />
          </TabsContent>

          <TabsContent value="defects" className="mt-4">
            <Defects 
              embedded 
              preferredViewMode={tabView.defects}
              onPreferredViewModeChange={(mode) => setTabView(v => ({ ...v, defects: mode }))}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Gestao;
