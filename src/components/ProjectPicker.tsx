"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProject } from '@/contexts/ProjectContext';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Check, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Project } from '@/types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useDashboardSettings } from '@/hooks/useDashboardSettings';
import { applyProjectTheme, resetProjectTheme } from '@/lib/theme/projectTheme';

// Removidos tipos de variáveis CSS personalizadas: o ícone volta a usar apenas contorno (stroke)

export function ProjectPicker() {
  const { currentProject, projects, archivedProjects, setCurrentProject, refreshArchivedProjects } = useProject();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const { settings: dashboardSettings } = useDashboardSettings();
  const INITIAL_VISIBLE = 4;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<'apply' | 'reset'>('apply');
  const [pendingName, setPendingName] = useState<string>('');
  const [pendingColor, setPendingColor] = useState<string | null>(null);
  // Bloqueia auto-aplicação enquanto aguardamos a confirmação do usuário no modal
  const blockAutoApply = useRef(false);
  // Lembra que o usuário recusou aplicar cores para um projeto específico
  const declinedApplyProjectId = useRef<string | number | null>(null);
  // Suprimir apenas a próxima execução auto após cancelar um modal (ex.: 'Todos' -> cancelar reset)
  const suppressNextAutoOnce = useRef(false);

  // Evitar loops: o carregamento dos arquivados será disparado apenas no clique do "Ver +"
  const isFetchingArchived = useRef(false);

  // Auto-aplicar tema na carga inicial e quando projeto atual mudar, se o toggle estiver ativo
  // Evita sobrescrever quando o modal está aberto ou enquanto bloqueado aguardando decisão
  const initialApplied = useRef(false);
  useEffect(() => {
    if (!dashboardSettings.applyProjectThemeEnabled) return;
    if (confirmOpen) return;
    if (blockAutoApply.current) return;
    if (suppressNextAutoOnce.current) {
      suppressNextAutoOnce.current = false;
      return;
    }
    if (declinedApplyProjectId.current != null && currentProject?.id === declinedApplyProjectId.current) {
      return;
    }
    // Na primeira vez que montar, aplicar se houver projeto atual
    if (!initialApplied.current) {
      initialApplied.current = true;
    }
    if (currentProject?.color) {
      applyProjectTheme(currentProject.color);
    } else {
      resetProjectTheme();
    }
  }, [dashboardSettings.applyProjectThemeEnabled, currentProject?.id, currentProject?.color, confirmOpen]);

  // Se o parâmetro for desativado, garantir que não haja modal aberto, 
  // limpar bloqueios e restaurar tema padrão imediatamente.
  useEffect(() => {
    if (!dashboardSettings.applyProjectThemeEnabled) {
      if (confirmOpen) setConfirmOpen(false);
      blockAutoApply.current = false;
      declinedApplyProjectId.current = null;
      suppressNextAutoOnce.current = false;
      resetProjectTheme();
    }
  }, [dashboardSettings.applyProjectThemeEnabled, confirmOpen]);

  const displayedProjects = useMemo<Project[]>(() => {
    const list = Array.isArray(projects) ? projects : [];
    const archived = Array.isArray(archivedProjects) ? archivedProjects : [];
    const base = expanded ? [...list, ...archived] : list;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? base.filter((p: Project) => (p.name || '').toLowerCase().includes(q) || (p.slug || '').toLowerCase().includes(q))
      : base;
    // Se há busca, não limitar. Sem busca: limitar a 4 quando recolhido; expandido mostra tudo (até 100)
    const limit = q ? 100 : (expanded ? 100 : INITIAL_VISIBLE);
    return filtered.slice(0, limit);
  }, [projects, archivedProjects, expanded, query]);

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
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={currentProject ? `Projeto selecionado: ${currentProject.name}` : 'Selecionar projeto'}
                  className="h-8 w-8"
                >
                  <span className="relative inline-flex h-4 w-4 items-center justify-center">
                    {/* Ícone somente com contorno: usa a cor do `--foreground` do tema */}
                    <Folder className="h-4 w-4 text-foreground" />
                  </span>
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>
              {currentProject ? `Projeto selecionado: ${currentProject.name}` : 'Selecionar projeto'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <PopoverContent className="w-[300px] p-0">
          <div className="px-3 py-2 text-xs text-muted-foreground">Selecionar projeto</div>
          <Command>
            <CommandInput placeholder="Buscar projeto..." value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandEmpty>Nenhum projeto encontrado</CommandEmpty>
              <CommandGroup>
                {/* Opção 'Todos' */}
                <CommandItem
                  key="all-projects"
                  value="Todos"
                  onSelect={() => {
                    setCurrentProject(null);
                    setOpen(false);
                    if (dashboardSettings.applyProjectThemeEnabled) {
                      // Bloqueia até o usuário decidir se quer resetar ou não
                      blockAutoApply.current = true;
                      setConfirmMode('reset');
                      setPendingName('Tema padrão');
                      setPendingColor(null);
                      setConfirmOpen(true);
                    }
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', currentProject == null ? 'opacity-100' : 'opacity-0')} />
                  <span>Todos</span>
                </CommandItem>

                {/* Exibir projeto atual se não estiver na lista exibida */}
                {currentProject && !displayedProjects.some((p) => p.id === currentProject.id) && (
                  <CommandItem
                    key={`current-${currentProject.id}`}
                    value={currentProject.name}
                    onSelect={() => {
                      setCurrentProject(currentProject);
                      setOpen(false);
                    }}
                  >
                    <Check className="mr-2 h-4 w-4 opacity-100" />
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: currentProject.color }} />
                      <span className="truncate">{currentProject.name}</span>
                      <Badge variant="outline" className={getStatusColor(currentProject.status)}>
                        {getStatusLabel(currentProject.status)}
                      </Badge>
                    </div>
                  </CommandItem>
                )}

                {displayedProjects.map((p: Project) => (
                  <CommandItem
                    key={p.id}
                    value={p.name}
                    onSelect={() => {
                      setCurrentProject(p);
                      setOpen(false);
                      if (dashboardSettings.applyProjectThemeEnabled) {
                        // Bloqueia até o usuário decidir aplicar ou não as cores do projeto
                        blockAutoApply.current = true;
                        setConfirmMode('apply');
                        setPendingName(p.name);
                        setPendingColor(p.color || null);
                        setConfirmOpen(true);
                        // Limpamos eventual recusa anterior se for um projeto diferente
                        if (declinedApplyProjectId.current != null && declinedApplyProjectId.current !== p.id) {
                          declinedApplyProjectId.current = null;
                        }
                      }
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', currentProject?.id === p.id ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="truncate">{p.name}</span>
                      <Badge variant="outline" className={getStatusColor(p.status)}>
                        {getStatusLabel(p.status)}
                      </Badge>
                    </div>
                  </CommandItem>
                ))}

                {/* Alternador Ver + para arquivados */}
                <CommandItem
                  key="toggle-archived"
                  value="see_more"
                  onMouseDown={(e) => { e.preventDefault(); }}
                  onPointerDown={(e) => { e.preventDefault(); }}
                  onSelect={async () => {
                    const next = !expanded;
                    setExpanded(next);
                    setOpen(true);
                    if (next) {
                      if (!isFetchingArchived.current) {
                        isFetchingArchived.current = true;
                        try {
                          await refreshArchivedProjects();
                        } catch {
                          // noop
                        } finally {
                          isFetchingArchived.current = false;
                        }
                      }
                    }
                  }}
                >
                  <div className="w-full text-center text-xs text-muted-foreground">
                    {expanded ? 'Ver menos' : 'Ver +'}
                  </div>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmMode === 'apply' ? 'Aplicar cores do projeto?' : 'Restaurar tema padrão?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMode === 'apply'
                ? `Deseja aplicar um gradiente sutil baseado na cor de "${pendingName}" para a interface?`
                : 'Deseja restaurar o tema padrão do sistema e remover as cores do projeto?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-2 justify-center">
            <AlertDialogCancel
              onClick={() => {
                // Cancelar aplicar: voltar ao tema padrão do sistema
                if (confirmMode === 'apply') {
                  resetProjectTheme();
                  // Memoriza a recusa para esse projeto
                  if (currentProject?.id != null) {
                    declinedApplyProjectId.current = currentProject.id as unknown as string | number;
                  }
                }
                // Cancelar reset: mantém tema atual
                if (confirmMode === 'reset') {
                  // Evita o reset automático disparado pelo efeito logo após fechar o modal
                  suppressNextAutoOnce.current = true;
                }
                blockAutoApply.current = false;
                setConfirmOpen(false);
              }}
            >
              Agora não
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmMode === 'apply' && pendingColor) {
                  applyProjectTheme(pendingColor);
                  // O usuário aceitou: limpa recusa (se houver)
                  if (currentProject?.id != null) {
                    if (declinedApplyProjectId.current === currentProject.id) {
                      declinedApplyProjectId.current = null;
                    }
                  }
                } else if (confirmMode === 'reset') {
                  resetProjectTheme();
                }
                blockAutoApply.current = false;
                setConfirmOpen(false);
              }}
              className="accent-gradient-bg text-brand-foreground"
            >
              {confirmMode === 'apply' ? 'Aplicar cores do projeto' : 'Restaurar tema'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

