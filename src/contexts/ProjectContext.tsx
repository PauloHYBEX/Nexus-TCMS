import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Project } from '@/types';
import { getActiveProjects, getArchivedOrCompletedProjects, getProjectById } from '@/services/projectService';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';

interface ProjectContextType {
  currentProject: Project | null;
  projects: Project[];
  archivedProjects: Project[];
  loading: boolean;
  setCurrentProject: (project: Project | null) => void;
  refreshProjects: () => Promise<void>;
  refreshArchivedProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};

interface ProjectProviderProps {
  children: ReactNode;
}

export const ProjectProvider: React.FC<ProjectProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentProject, setCurrentProjectState] = useState<Project | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const broadcastProjectChange = (project: Project | null) => {
    try {
      if (typeof window !== 'undefined') {
        const evt = new CustomEvent('krg:project-changed', {
          detail: { projectId: project?.id ?? null, project, ts: Date.now() }
        });
        window.dispatchEvent(evt);
        // Broadcast cross-window (Studio/Web)
        try { window.postMessage({ type: 'project:changed', project }, '*'); } catch {}
      }
      // Invalida e refaz fetch das queries ativas ao trocar de projeto
      queryClient.invalidateQueries({ predicate: () => true, refetchType: 'active' });
    } catch (e) { /* noop */ }
  };

  const refreshArchivedProjects = async () => {
    try {
      const list = await getArchivedOrCompletedProjects();
      setArchivedProjects(list);
    } catch (e) {
      console.warn('Falha ao carregar projetos arquivados:', e);
      setArchivedProjects([]);
    }
  };

  // Chave para localStorage
  const CURRENT_PROJECT_KEY = 'krigzis_current_project_id';

  const refreshProjects = async () => {
    if (!user) return;

    try {
      setLoading(true);
      // Buscar projetos reais (ativos) no Supabase
      const realProjects = await getActiveProjects();
      setProjects(realProjects);

      // Tentar restaurar projeto atual do localStorage (inclui sentinel 'all')
      const savedId = localStorage.getItem(CURRENT_PROJECT_KEY);
      if (savedId) {
        if (savedId === 'all') {
          setCurrentProjectState(null);
          broadcastProjectChange(null);
        } else {
          const saved = await getProjectById(savedId);
          if (saved) {
            setCurrentProjectState(saved);
            broadcastProjectChange(saved);
          } else if (realProjects.length > 0) {
            setCurrentProjectState(realProjects[0]);
            localStorage.setItem(CURRENT_PROJECT_KEY, realProjects[0].id);
            broadcastProjectChange(realProjects[0]);
          } else {
            setCurrentProjectState(null);
            localStorage.setItem(CURRENT_PROJECT_KEY, 'all');
            broadcastProjectChange(null);
          }
        }
      } else {
        // Se não há projeto salvo, selecionar o primeiro disponível
        if (realProjects.length > 0) {
          setCurrentProjectState(realProjects[0]);
          localStorage.setItem(CURRENT_PROJECT_KEY, realProjects[0].id);
          broadcastProjectChange(realProjects[0]);
        } else {
          localStorage.setItem(CURRENT_PROJECT_KEY, 'all');
          broadcastProjectChange(null);
        }
      }
    } catch (error) {
    console.error('Erro ao carregar projetos:', error);
    // Em caso de erro, não usar mocks; limpar estado
    setProjects([]);
    setCurrentProjectState(null);
    // Persistir 'all' para manter seletor estável
    try { localStorage.setItem(CURRENT_PROJECT_KEY, 'all'); } catch {}
    broadcastProjectChange(null);
  } finally {
    setLoading(false);
  }
  };

  const setCurrentProject = (project: Project | null) => {
    setCurrentProjectState(project);
    if (project) {
      localStorage.setItem(CURRENT_PROJECT_KEY, project.id);
    } else {
      // Persistir 'Todos' como sentinel
      localStorage.setItem(CURRENT_PROJECT_KEY, 'all');
    }
    broadcastProjectChange(project);
  };

  // Carregar projetos quando o usuário estiver autenticado
  useEffect(() => {
    if (user) {
      refreshProjects();
    } else {
      setProjects([]);
      setCurrentProjectState(null);
      setLoading(false);
    }
    // Listener para sincronização via postMessage
    try {
      const onMessage = (ev: MessageEvent) => {
        const d = ev?.data as any;
        if (!d || typeof d !== 'object') return;
        if (d.type === 'project:changed') {
          const p = d.project as Project | null | undefined;
          setCurrentProjectState(p ?? null);
          try { localStorage.setItem(CURRENT_PROJECT_KEY, p?.id ?? 'all'); } catch {}
          // invalidar queries ativas
          try { queryClient.invalidateQueries({ predicate: () => true, refetchType: 'active' }); } catch {}
        }
      };
      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    } catch {}
  }, [user]);

  const value: ProjectContextType = {
    currentProject,
    projects,
    archivedProjects,
    loading,
    setCurrentProject,
    refreshProjects,
    refreshArchivedProjects
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};
