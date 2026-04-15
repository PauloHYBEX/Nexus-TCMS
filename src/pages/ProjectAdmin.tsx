import React, { useEffect, useMemo, useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useProject } from '@/contexts/ProjectContext';
import { Project } from '@/types';
import { ProjectManager } from '@/experimental/ProjectManager';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Wrench } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createProject, generateSlug, checkSlugExists } from '@/services/projectService';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const ProjectAdmin: React.FC = () => {
  const { role, isMaster } = usePermissions();
  const { user } = useAuth();
  const { projects, archivedProjects, refreshProjects, refreshArchivedProjects } = useProject();
  const [tab, setTab] = useState<'active' | 'archived'>('active');

  const canAccess = isMaster() || role === 'admin';
  const [selected, setSelected] = useState<Project | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', color: '#3b82f6' });

  useEffect(() => {
    if (tab === 'archived') {
      refreshArchivedProjects().catch(() => {});
    }
  }, [tab, refreshArchivedProjects]);

  const orderedActive = useMemo(() => {
    return [...projects].sort((a, b) => a.name.localeCompare(b.name));
  }, [projects]);

  const orderedArchived = useMemo(() => {
    return [...archivedProjects].sort((a, b) => a.name.localeCompare(b.name));
  }, [archivedProjects]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-400/15 dark:text-green-300 dark:ring-1 dark:ring-green-400/25 dark:border-transparent';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-400/15 dark:text-yellow-300 dark:ring-1 dark:ring-yellow-400/25 dark:border-transparent';
      case 'completed':
        return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-400/15 dark:text-blue-300 dark:ring-1 dark:ring-blue-400/25 dark:border-transparent';
      case 'archived':
        return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-slate-400/15 dark:text-slate-300 dark:ring-1 dark:ring-slate-400/25 dark:border-transparent';
      case 'canceled':
        return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-400/15 dark:text-red-300 dark:ring-1 dark:ring-red-400/25 dark:border-transparent';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-slate-400/15 dark:text-slate-300 dark:ring-1 dark:ring-slate-400/25 dark:border-transparent';
    }
  };

  const createNew = async () => {
    if (!user || !form.name.trim()) return;
    try {
      setCreating(true);
      let slug = generateSlug(form.name);
      let counter = 1;
      while (await checkSlugExists(slug)) {
        slug = `${generateSlug(form.name)}-${counter++}`;
      }
      const proj = await createProject({
        name: form.name.trim(),
        slug,
        description: form.description.trim() || undefined,
        color: form.color,
        created_by: user.id,
      });
      await refreshProjects();
      toast({ title: 'Projeto criado', description: `"${proj.name}" criado com sucesso.` });
      setShowCreate(false);
      setForm({ name: '', description: '', color: '#3b82f6' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Erro', description: 'Não foi possível criar o projeto.', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="container mx-auto py-6">
        <h1 className="text-2xl font-semibold mb-2">Acesso restrito</h1>
        <p className="text-muted-foreground">Apenas Master/Admin podem acessar o gerenciamento de projetos.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Wrench className="h-7 w-7" /> Projetos
          </h1>
          <p className="text-muted-foreground">Gerencie criação, edição, pausa/retomada, arquivamento/cancelamento e exclusão de projetos.</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="accent-gradient-bg text-brand-foreground border-0 hover:opacity-95">
              <Plus className="h-4 w-4 mr-2" /> Novo Projeto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Novo Projeto</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="pname">Nome</Label>
                <Input id="pname" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="pdesc">Descrição</Label>
                <Textarea id="pdesc" rows={3} value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="pcolor">Cor</Label>
                <div className="flex items-center gap-3">
                  <input id="pcolor" type="color" className="w-12 h-10 rounded border" value={form.color} onChange={(e) => setForm((s) => ({ ...s, color: e.target.value }))} />
                  <span className="text-sm text-muted-foreground">{form.color}</span>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>Cancelar</Button>
                <Button onClick={createNew} disabled={creating || !form.name.trim()}>{creating ? 'Criando...' : 'Criar'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={tab} onValueChange={(v: 'active' | 'archived') => setTab(v)} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="active">Ativos</TabsTrigger>
          <TabsTrigger value="archived">Arquivados/Cancelados</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orderedActive.map((p) => (
              <Card
                key={p.id}
                role="button"
                tabIndex={0}
                aria-label={`Gerenciar projeto ${p.name}`}
                onClick={() => setSelected(p)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(p); } }}
                className="card-hover cursor-pointer relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name}
                    <Badge variant="outline" className={getStatusColor(p.status)}>{p.status === 'active' ? 'Ativo' : p.status === 'paused' ? 'Pausado' : p.status === 'completed' ? 'Concluído' : 'Arquivado'}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-xs text-muted-foreground truncate">slug: {p.slug}</div>
                  <div className="pt-3 text-xs text-muted-foreground">Clique para gerenciar</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="archived">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orderedArchived.map((p) => (
              <Card
                key={p.id}
                role="button"
                tabIndex={0}
                aria-label={`Gerenciar projeto ${p.name}`}
                onClick={() => setSelected(p)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(p); } }}
                className="card-hover cursor-pointer relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                    {p.name}
                    <Badge variant="outline" className={getStatusColor(p.status)}>
                      {p.status === 'archived' ? 'Arquivado' : p.status === 'canceled' ? 'Cancelado' : 'Outro'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="text-xs text-muted-foreground truncate">slug: {p.slug}</div>
                  <div className="pt-3 text-xs text-muted-foreground">Clique para gerenciar</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Gerenciador por projeto */}
      {selected && (
        <ProjectManager project={selected} open={Boolean(selected)} onOpenChange={(open) => !open ? setSelected(null) : null} />
      )}
    </div>
  );
};

export default ProjectAdmin;
