import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  FileText, 
  TestTube, 
  PlayCircle, 
  History as HistoryIcon,
  BarChart3,
  Sparkles,
  Settings,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Wrench,
  Package,
} from 'lucide-react';
import KrigzisLogo from '@/components/branding/KrigzisLogo';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { useProject } from '@/contexts/ProjectContext';

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home, requiredPermission: null },
  { name: 'Planos de Teste', href: '/plans', icon: FileText, requiredPermission: 'can_manage_plans' },
  { name: 'Casos de Teste', href: '/cases', icon: TestTube, requiredPermission: 'can_manage_cases' },
  { name: 'Execuções', href: '/executions', icon: PlayCircle, requiredPermission: 'can_manage_executions' },
  { name: 'Gestão', href: '/management', icon: ListChecks, requiredPermission: null },
  { name: 'Gerador IA', href: '/ai-generator', icon: Sparkles, requiredPermission: 'can_use_ai' },
  { name: 'Relatórios', href: '/reports', icon: BarChart3, requiredPermission: 'can_view_reports' },
  { name: 'Histórico', href: '/history', icon: HistoryIcon, requiredPermission: null },
];

// Itens de Módulos (sub-menu colapsável)
const modulesNavigation = [
  { name: 'Studio', external: true, icon: Sparkles, requiredPermission: 'can_use_ai' },
];

// Itens administrativos (sub-menu colapsável)
const adminNavigation = [
  { name: 'Projetos', href: '/project-admin', icon: Wrench, requiredPermission: 'can_manage_projects' },
  { name: 'Usuários', href: '/user-management', icon: Settings, requiredPermission: 'can_manage_users' },
  { name: 'MCP', href: '/model-control', icon: Settings, requiredPermission: 'can_access_model_control' },
];

export const Sidebar = () => {
  const location = useLocation();
  const { hasPermission, isMaster } = usePermissions();
  const { currentProject } = useProject();
  const [isOpen, setIsOpen] = useState(false); // Mobile sidebar state
  const [isExpanded, setIsExpanded] = useState(true); // Desktop sidebar expansion state
  const [adminOpen, setAdminOpen] = useState(true); // Submenu Administrativo
  const [modulesOpen, setModulesOpen] = useState(true); // Submenu Módulos

  const toggleSidebar = () => {
    const newExpandedState = !isExpanded;
    setIsExpanded(newExpandedState);
    
    // Emitir evento para informar o layout que a barra lateral foi expandida/retraída
    const event = new CustomEvent('sidebarStateChange', { 
      detail: { expanded: newExpandedState } 
    });
    window.dispatchEvent(event);
  };

  // Filter navigation items based on permissions
  const filteredNavigation = navigation.filter(item => {
    // If no permission is required, show the item
    if (!item.requiredPermission) {
      return true;
    }
    
    // Check permission requirement
    if (item.requiredPermission) {
      return hasPermission(item.requiredPermission as any);
    }
    
    return true;
  });

  // Filter modules items based on permissions
  const filteredModulesNavigation = modulesNavigation.filter(item => {
    if (!item.requiredPermission) return true;
    return hasPermission(item.requiredPermission as any);
  });

  // Filter admin items based on permissions
  const filteredAdminNavigation = adminNavigation.filter(item => {
    if (!item.requiredPermission) return true;
    return hasPermission(item.requiredPermission as any);
  });

  return (
    <>
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 rounded-md bg-accent text-foreground shadow-md"
        >
          {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Toggle sidebar button for desktop */}
      <div className="hidden lg:block fixed top-4 left-4 z-50" style={{ left: isExpanded ? '256px' : '80px' }}>
        <button
          onClick={toggleSidebar}
          className="p-1 rounded-full bg-muted text-foreground/70 shadow-md hover:bg-muted/80 transition-colors"
        >
          {isExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-40 bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-sm transform transition-all duration-300 ease-in-out lg:translate-x-0 h-full",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        isExpanded ? "lg:w-64" : "lg:w-20"
      )}>
        <div className="flex flex-col h-full">
          <div className={cn(
            "flex items-center h-16 px-4 border-b border-sidebar-border",
            isExpanded ? "justify-center" : "justify-center"
          )}>
            {isExpanded ? (
              <div className="flex items-center gap-2">
                <KrigzisLogo size={24} className="h-6 w-6" />
                <h1 className="text-xl font-bold text-sidebar-foreground">TestPilot AI</h1>
              </div>
            ) : (
              <KrigzisLogo size={24} className="h-6 w-6" />
            )}
          </div>
          
          <nav className={cn(
            "flex-1 py-6 space-y-2 overflow-y-auto",
            isExpanded ? "px-4" : "px-2"
          )}>
            {filteredNavigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "flex items-center py-2 text-sm font-medium rounded-lg transition-colors",
                    isExpanded ? "px-3 justify-start" : "px-2 justify-center",
                    isActive
                      ? "accent-gradient-bg-soft text-brand-foreground"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                  title={!isExpanded ? item.name : undefined}
                >
                  <item.icon className={cn("h-5 w-5", isExpanded ? "mr-3" : "")} />
                  {isExpanded && (
                    <div className="flex items-center justify-between w-full">
                      <span>{item.name}</span>
                    </div>
                  )}
                </Link>
              );
            })}

            {/* Submenu Módulos */}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  if (!isExpanded) {
                    setIsExpanded(true);
                    const event = new CustomEvent('sidebarStateChange', { detail: { expanded: true } });
                    window.dispatchEvent(event);
                  } else {
                    setModulesOpen(!modulesOpen);
                  }
                }}
                className={cn(
                  "w-full flex items-center py-2 text-sm font-semibold rounded-lg transition-colors",
                  isExpanded ? "px-3 justify-between" : "px-2 justify-center",
                  "text-sidebar-foreground hover:bg-sidebar-accent"
                )}
                title={!isExpanded ? 'Módulos' : undefined}
              >
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5" />
                  {isExpanded && <span>Módulos</span>}
                </div>
                {isExpanded && (
                  <ChevronRight className={cn("h-4 w-4 transition-transform", modulesOpen ? "rotate-90" : "rotate-0")} />
                )}
              </button>

              {isExpanded && modulesOpen && (
                <div className="mt-1 space-y-1 pl-8">
                  {filteredModulesNavigation.map((item) => {
                    // Se for item externo (Studio), abrir nova aba e enviar postMessage com o projeto atual.
                    const onOpenExternal = () => {
                      try {
                        const url = (import.meta as any).env?.VITE_STUDIO_URL || 'http://localhost:3000';
                        const win = window.open(url, '_blank');
                        // Envia o projeto atual alguns ms após abrir, para garantir que o listener esteja pronto
                        setTimeout(() => {
                          try { win?.postMessage({ type: 'project:changed', project: currentProject || null }, '*'); } catch {}
                        }, 600);
                      } catch {}
                    };

                    if ((item as any).external) {
                      return (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => { setIsOpen(false); onOpenExternal(); }}
                          className={cn(
                            "w-full flex items-center py-2 text-sm font-medium rounded-lg transition-colors",
                            "px-3 justify-start",
                            "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          )}
                        >
                          <item.icon className="h-4 w-4 mr-3" />
                          <div className="flex items-center justify-between w-full">
                            <span>{item.name}</span>
                          </div>
                        </button>
                      );
                    }

                    const isActive = location.pathname === (item as any).href;
                    return (
                      <Link
                        key={item.name}
                        to={(item as any).href}
                        onClick={() => setIsOpen(false)}
                        className={cn(
                          "flex items-center py-2 text-sm font-medium rounded-lg transition-colors",
                          "px-3 justify-start",
                          isActive
                            ? "accent-gradient-bg-soft text-brand-foreground"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        )}
                      >
                        <item.icon className="h-4 w-4 mr-3" />
                        <div className="flex items-center justify-between w-full">
                          <span>{item.name}</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Submenu Administrativo */}
            {(isMaster() || hasPermission('can_access_admin_menu') || hasPermission('can_manage_users')) && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => {
                    if (!isExpanded) {
                      setIsExpanded(true);
                      // Emite evento para layout alinhar
                      const event = new CustomEvent('sidebarStateChange', { detail: { expanded: true } });
                      window.dispatchEvent(event);
                    } else {
                      setAdminOpen(!adminOpen);
                    }
                  }}
                  className={cn(
                    "w-full flex items-center py-2 text-sm font-semibold rounded-lg transition-colors",
                    isExpanded ? "px-3 justify-between" : "px-2 justify-center",
                    "text-sidebar-foreground hover:bg-sidebar-accent"
                  )}
                  title={!isExpanded ? 'Administrativo' : undefined}
                >
                  <div className="flex items-center gap-3">
                    <Settings className="h-5 w-5" />
                    {isExpanded && <span>Administrativo</span>}
                  </div>
                  {isExpanded && (
                    <ChevronRight className={cn("h-4 w-4 transition-transform", adminOpen ? "rotate-90" : "rotate-0")} />
                  )}
                </button>

                {isExpanded && adminOpen && (
                  <div className="mt-1 space-y-1 pl-8">
                    {filteredAdminNavigation.map((item) => {
                      const isActive = location.pathname === item.href;
                      return (
                        <Link
                          key={item.name}
                          to={item.href}
                          onClick={() => setIsOpen(false)}
                          className={cn(
                            "flex items-center py-2 text-sm font-medium rounded-lg transition-colors",
                            "px-3 justify-start",
                            isActive
                              ? "accent-gradient-bg-soft text-brand-foreground"
                              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          )}
                        >
                          <item.icon className="h-4 w-4 mr-3" />
                          <div className="flex items-center justify-between w-full">
                            <span>{item.name}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </nav>
          
          {isExpanded && (
          <div className="p-4 border-t border-sidebar-border">
            <p className="text-xs text-muted-foreground">
              Geração inteligente de testes
            </p>
          </div>
          )}
        </div>
      </div>

      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-30 lg:hidden bg-background/80 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
};
