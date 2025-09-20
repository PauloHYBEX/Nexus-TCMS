import React from 'react';
import { useProject } from '@/contexts/ProjectContext';

interface ProjectDisplayFieldProps {
  projectId: string;
}

export const ProjectDisplayField: React.FC<ProjectDisplayFieldProps> = ({ projectId }) => {
  const { projects, archivedProjects } = useProject();
  
  if (!projectId) {
    return <span className="text-sm text-muted-foreground">Sem Projeto</span>;
  }

  const project = projects.find(p => p.id === projectId) || archivedProjects.find(p => p.id === projectId);
  
  if (!project) {
    return <span className="text-sm text-muted-foreground">Projeto não encontrado</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <div 
        className="w-3 h-3 rounded-full flex-shrink-0" 
        style={{ backgroundColor: project.color }}
      />
      <span className="text-sm text-muted-foreground truncate">{project.name}</span>
    </div>
  );
};
