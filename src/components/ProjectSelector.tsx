import React, { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useProject } from '@/contexts/ProjectContext';
import { FolderOpen } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';

export const ProjectSelector: React.FC = () => {
  const { currentProject, projects, archivedProjects, setCurrentProject, refreshArchivedProjects } = useProject();
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (showArchived) {
      refreshArchivedProjects().catch(() => {});
    }
  }, [showArchived]);

  const handleProjectChange = (projectId: string) => {
    if (projectId === 'all') {
      setCurrentProject(null);
      toast({ title: 'Filtro aplicado', description: 'Exibindo dados de todos os projetos ativos.' });
      return;
    }
    if (projectId === 'see_more') {
      setShowArchived((prev) => !prev);
      // Reabrir o select após alternar
      setTimeout(() => setOpen(true), 0);
      return;
    }
    const project = projects.find(p => p.id === projectId) || archivedProjects.find(p => p.id === projectId);
    setCurrentProject(project || null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 border-green-200';
      case 'paused': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'completed': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'archived': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'canceled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
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

  return (
    <TooltipProvider>
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2">
        <FolderOpen className="h-4 w-4 text-muted-foreground" />
        <Select open={open} onOpenChange={setOpen} value={currentProject?.id || 'all'} onValueChange={handleProjectChange}>
          <SelectTrigger className="w-[260px] h-8 text-sm border-0 bg-transparent shadow-none focus:ring-0 focus:ring-offset-0 outline-none focus:outline-none">
            <div className="flex items-center gap-2 w-full truncate">
              {currentProject ? (
                <>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: currentProject.color }} />
                  <span className="truncate">{currentProject.name}</span>
                  <Badge variant="outline" className={getStatusColor(currentProject.status)}>
                    {getStatusLabel(currentProject.status)}
                  </Badge>
                </>
              ) : (
                <span>Todos</span>
              )}
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <div className="flex items-center gap-2">
                <span>Todos</span>
              </div>
            </SelectItem>
            {/* Garante visibilidade do projeto atual mesmo se arquivado/cancelado sem expandir 'Ver +' */}
            {currentProject && !projects.some(p => p.id === currentProject.id) && !archivedProjects.some(p => p.id === currentProject.id) && (
              <SelectItem key={`current-${currentProject.id}`} value={currentProject.id}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: currentProject.color }} />
                  <span>{currentProject.name}</span>
                  <Badge variant="outline" className={getStatusColor(currentProject.status)}>
                    {getStatusLabel(currentProject.status)}
                  </Badge>
                </div>
              </SelectItem>
            )}
            {projects.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground text-center">
                Nenhum projeto disponível
              </div>
            ) : (
              projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: project.color }}
                    />
                    <span>{project.name}</span>
                    <Badge variant="outline" className={getStatusColor(project.status)}>
                      {getStatusLabel(project.status)}
                    </Badge>
                  </div>
                </SelectItem>
              ))
            )}

            {/* Ver + para expandir arquivados/concluídos */}
            <SelectItem value="see_more">
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                {showArchived ? 'Ver menos' : 'Ver +'}
              </div>
            </SelectItem>

            {showArchived && archivedProjects.length > 0 && (
              <div className="pt-1 border-t mt-1">
                {archivedProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
                      <span>{project.name}</span>
                      <Badge variant="outline" className={getStatusColor(project.status)}>
                        {getStatusLabel(project.status)}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </div>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Criação/gerenciamento de projetos foram movidos para Administrativo > Projetos */}
    </div>
    </TooltipProvider>
  );
};
