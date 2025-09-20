import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { updateProject, deleteProjectCascade, getProjectById } from '@/services/projectService';
import { Project } from '@/types';
import { Settings, Trash2, Pause, Play, AlertTriangle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ProjectManagerProps {
  project: Project;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const ProjectManager: React.FC<ProjectManagerProps> = ({ project, open, onOpenChange }) => {
  const { user } = useAuth();
  const { refreshProjects, setCurrentProject, currentProject, refreshArchivedProjects } = useProject();
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [formData, setFormData] = useState({
    name: project.name,
    color: project.color,
    status: project.status
  });
  const { isMaster, hasPermission } = usePermissions();

  const persistInline = async (updates: Partial<Project>) => {
    if (!user) return;
    try {
      setEditing(true);
      await updateProject(project.id, updates as any);
      const fresh = await getProjectById(project.id);
      if (fresh) {
        setFormData((s) => ({ ...s, name: fresh.name, color: fresh.color, status: fresh.status }));
        if (currentProject?.id === project.id) {
          setCurrentProject(fresh);
        }
      }
      await refreshProjects();
      toast({ title: 'Projeto atualizado', description: `Alterações salvas.` });
    } catch (error) {
      console.error('Erro ao atualizar projeto:', error);
      toast({ title: 'Erro', description: (error as any)?.message || 'Falha ao salvar alterações.', variant: 'destructive' });
    } finally {
      setEditing(false);
    }
  };

  const handleCancelProject = async () => {
    if (!hasPermission('can_manage_projects')) {
      toast({ title: 'Sem permissão', description: 'Você não pode cancelar projetos.', variant: 'destructive' });
      return;
    }
    try {
      await updateProject(project.id, { status: 'canceled' });
      const fresh = await getProjectById(project.id);
      setFormData((s) => ({ ...s, status: 'canceled' }));
      if (fresh && currentProject?.id === project.id) setCurrentProject(fresh);
      await refreshProjects();
      try { await refreshArchivedProjects(); } catch {}
      toast({ title: 'Projeto cancelado', description: `O projeto "${project.name}" foi marcado como cancelado.` });
    } catch (error) {
      console.error('Erro ao cancelar projeto:', error);
      toast({ title: 'Erro', description: (error as any)?.message || 'Não foi possível cancelar o projeto.', variant: 'destructive' });
    }
  };

  const handleDeleteProject = async () => {
    try {
      setDeleting(true);
      await deleteProjectCascade(project.id);
      await refreshProjects();
      try { await refreshArchivedProjects(); } catch {}
      setCurrentProject(null);

      toast({
        title: 'Projeto excluído',
        description: `O projeto "${project.name}" foi excluído com sucesso.`
      });
    } catch (error) {
      console.error('Erro ao excluir projeto:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível excluir o projeto. Tente novamente.',
        variant: 'destructive'
      });
    } finally {
      setDeleting(false);
    }
  };

  const handlePauseProject = async () => {
    if (!hasPermission('can_manage_projects')) {
      toast({ title: 'Sem permissão', description: 'Você não pode pausar projetos.', variant: 'destructive' });
      return;
    }
    try {
      await updateProject(project.id, { status: 'paused' });
      const fresh = await getProjectById(project.id);
      setFormData((s) => ({ ...s, status: 'paused' }));
      if (fresh && currentProject?.id === project.id) setCurrentProject(fresh);
      await refreshProjects();
      toast({ title: 'Projeto pausado', description: `O projeto "${project.name}" está em modo somente leitura.` });
    } catch (error) {
      console.error('Erro ao pausar projeto:', error);
      toast({ title: 'Erro', description: (error as any)?.message || 'Não foi possível pausar o projeto.', variant: 'destructive' });
    }
  };

  const handleResumeProject = async () => {
    if (!hasPermission('can_manage_projects')) {
      toast({ title: 'Sem permissão', description: 'Você não pode retomar projetos.', variant: 'destructive' });
      return;
    }
    try {
      await updateProject(project.id, { status: 'active' });
      const fresh = await getProjectById(project.id);
      setFormData((s) => ({ ...s, status: 'active' }));
      if (fresh && currentProject?.id === project.id) setCurrentProject(fresh);
      await refreshProjects();
      try { await refreshArchivedProjects(); } catch {}
      toast({ title: 'Projeto retomado', description: `O projeto "${project.name}" voltou ao modo ativo.` });
    } catch (error) {
      console.error('Erro ao retomar projeto:', error);
      toast({ title: 'Erro', description: (error as any)?.message || 'Não foi possível retomar o projeto.', variant: 'destructive' });
    }
  };

  const handleArchiveProject = async () => {
    if (!hasPermission('can_manage_projects')) {
      toast({ title: 'Sem permissão', description: 'Você não pode arquivar projetos.', variant: 'destructive' });
      return;
    }
    try {
      await updateProject(project.id, { status: 'archived' });
      const fresh = await getProjectById(project.id);
      setFormData((s) => ({ ...s, status: 'archived' }));
      if (fresh && currentProject?.id === project.id) setCurrentProject(fresh);
      await refreshProjects();
      try { await refreshArchivedProjects(); } catch {}
      toast({ title: 'Projeto arquivado', description: `O projeto "${project.name}" foi arquivado.` });
    } catch (error) {
      console.error('Erro ao arquivar projeto:', error);
      toast({ title: 'Erro', description: (error as any)?.message || 'Não foi possível arquivar o projeto.', variant: 'destructive' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-50 text-green-700 border-green-200';
      case 'paused': return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'completed': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'archived': return 'bg-gray-50 text-gray-700 border-gray-200';
      case 'canceled': return 'bg-red-50 text-red-700 border-red-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Ativo';
      case 'paused': return 'Pausado';
      case 'completed': return 'Concluído';
      case 'archived': return 'Arquivado';
      case 'canceled': return 'Cancelado';
      default: return status;
    }
  };

  const controlled = typeof open === 'boolean' && typeof onOpenChange === 'function';

  return (
    <>
      <Dialog open={controlled ? open : showEditForm} onOpenChange={controlled ? onOpenChange! : setShowEditForm}>
        {!controlled && (
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <Settings className="h-4 w-4" />
            </Button>
          </DialogTrigger>
        )}
        <DialogContent className="max-w-md border-0 shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              Gerenciar Projeto
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="project-name">Nome do Projeto</Label>
              <Input
                id="project-name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                onBlur={() => formData.name !== project.name ? persistInline({ name: formData.name.trim() }) : undefined}
                className=""
              />
            </div>

            <div>
              <Label htmlFor="project-color">Cor de Identificação</Label>
              <div className="flex items-center gap-3">
                <input
                  id="project-color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                  onBlur={() => formData.color !== project.color ? persistInline({ color: formData.color }) : undefined}
                  className="w-12 h-10 rounded border cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">{formData.color}</span>
              </div>
            </div>

            <div>
              <Label>Status Atual</Label>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className={getStatusColor(formData.status)}>
                  {getStatusLabel(formData.status)}
                </Badge>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {formData.status === 'active' ? (
                <Button type="button" onClick={() => setShowPauseDialog(true)} className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white border-0">
                  <Pause className="h-4 w-4 mr-2" /> Pausar
                </Button>
              ) : formData.status === 'archived' ? (
                <Button type="button" onClick={handleResumeProject} className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white border-0">
                  <Play className="h-4 w-4 mr-2" /> Ativar
                </Button>
              ) : (
                <Button type="button" onClick={handleResumeProject} className="flex-1 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-white border-0">
                  <Play className="h-4 w-4 mr-2" /> Retomar
                </Button>
              )}

              {formData.status !== 'archived' && (
                <Button type="button" onClick={() => setShowArchiveDialog(true)} className="flex-1 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white border-0">
                  Arquivar
                </Button>
              )}

              {formData.status !== 'canceled' && (
                <Button type="button" onClick={() => setShowCancelDialog(true)} className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white border-0">
                  Cancelar Projeto
                </Button>
              )}

              {(isMaster() || hasPermission('can_delete_projects')) && (
                <Button type="button" onClick={() => setShowDeleteDialog(true)} className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white">
                  <Trash2 className="h-4 w-4 mr-2" /> Excluir
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" /> Excluir Projeto (apenas Master)
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Todos os dados vinculados ao projeto serão removidos: Planos, Casos, Execuções, Defeitos e vínculos de Requisitos.
              <br />
              Para confirmar, digite exatamente o nome do projeto abaixo: <strong>{project.name}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="mt-2">
            <Input placeholder={project.name} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              disabled={deleting || confirmText !== project.name || !isMaster()}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? 'Excluindo...' : 'Excluir Tudo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de Pausa */}
      <AlertDialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pausar projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              Ao pausar, o projeto fica em modo somente leitura. Criação de Planos, Casos e Execuções será desabilitada enquanto estiver pausado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-teal-600 hover:bg-teal-700" onClick={handlePauseProject}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de Arquivamento */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arquivar projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              Arquivar oculta o projeto do uso diário. Dados permanecem preservados, mas o projeto não aparecerá por padrão. Você pode reativá-lo depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-gray-600 hover:bg-gray-700" onClick={handleArchiveProject}>Arquivar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de Cancelamento */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              Cancelar indica que o projeto foi interrompido. Dados permanecem salvos, porém o projeto não aparecerá por padrão e não permitirá novas criações.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction className="bg-amber-600 hover:bg-amber-700" onClick={handleCancelProject}>Confirmar cancelamento</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
