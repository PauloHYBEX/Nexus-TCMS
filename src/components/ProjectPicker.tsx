"use client";
import React, { useEffect, useMemo, useState } from 'react';
import { useProject } from '@/contexts/ProjectContext';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Check, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Project } from '@/types';

export function ProjectPicker() {
  const { currentProject, projects, archivedProjects, setCurrentProject, refreshArchivedProjects } = useProject();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (showArchived) {
      refreshArchivedProjects().catch(() => {});
    }
  }, [showArchived]);

  const displayedProjects = useMemo<Project[]>(() => {
    const list = Array.isArray(projects) ? projects : [];
    const archived = Array.isArray(archivedProjects) ? archivedProjects : [];
    const base = showArchived ? [...list, ...archived] : list;
    const q = query.trim().toLowerCase();
    const filtered = q
      ? base.filter((p: Project) => (p.name || '').toLowerCase().includes(q) || (p.slug || '').toLowerCase().includes(q))
      : base;
    return filtered.slice(0, 100);
  }, [projects, archivedProjects, showArchived, query]);

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
                    {/* Preenchimento sólido apenas no modo claro */}
                    {currentProject?.color && (
                      <span
                        aria-hidden="true"
                        className="absolute -inset-[2px] rounded-[4px] dark:hidden"
                        style={{ backgroundColor: currentProject.color as string }}
                      />
                    )}
                    <Folder
                      className="relative h-4 w-4"
                      style={{ color: currentProject?.color as string | undefined }}
                    />
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
                  onSelect={() => setShowArchived((prev) => !prev)}
                >
                  <div className="w-full text-center text-xs text-muted-foreground">
                    {showArchived ? 'Ver menos' : 'Ver +'}
                  </div>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

