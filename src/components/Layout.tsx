import { ReactNode, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Outlet, useLocation } from 'react-router-dom';

interface LayoutProps {
  children?: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const location = useLocation();

  // Escutar o evento personalizado para saber quando a barra lateral é expandida/retraída
  useEffect(() => {
    const handleSidebarChange = (e: CustomEvent) => {
      setSidebarExpanded(e.detail.expanded);
    };

    window.addEventListener('sidebarStateChange', handleSidebarChange as EventListener);
    
    return () => {
      window.removeEventListener('sidebarStateChange', handleSidebarChange as EventListener);
    };
  }, []);

  // (removido) lógica de redirecionamento para configuração de banco — o hook não expõe essa flag

  // Breadcrumb simples baseado no primeiro segmento da rota
  const currentTitle = useMemo(() => {
    const seg = location.pathname.replace(/^\//, '').split('/')[0] || 'dashboard';
    const map: Record<string, string> = {
      dashboard: 'Dashboard',
      plans: 'Planos de Teste',
      'test-plans': 'Planos de Teste',
      cases: 'Casos de Teste',
      'test-cases': 'Casos de Teste',
      executions: 'Execuções',
      management: 'Gestão',
      requirements: 'Requisitos',
      traceability: 'Rastreabilidade',
      defects: 'Defeitos',
      ai: 'Gerador IA',
      reports: 'Relatórios',
      history: 'Histórico',
      admin: 'Administrativo',
      mcp: 'MCP',
    };
    return map[seg] || seg.charAt(0).toUpperCase() + seg.slice(1);
  }, [location.pathname]);

  // carregamento de auth pode ser tratado globalmente; nenhuma tela especial aqui

  return (
    <div className="min-h-screen h-screen flex flex-col overflow-hidden bg-background">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div
          className={cn(
            "flex-1 flex flex-col overflow-hidden transition-[margin] duration-300",
            sidebarExpanded ? "lg:ml-64" : "lg:ml-20"
          )}
        >
          <Header />
          <main className={cn(
            "flex-1 overflow-x-hidden px-3 sm:px-5 lg:px-6 xl:px-8 py-4 sm:py-6",
            location.pathname.startsWith('/history') ? 'overflow-hidden' : 'overflow-y-auto'
          )}>
            {/* Breadcrumbs */}
            <div className="mb-4 sm:mb-6 text-sm text-muted-foreground flex items-center gap-2">
              <span className="text-foreground font-medium">TestPilot AI</span>
              <span className="opacity-70">/</span>
              <span className="accent-gradient-text font-semibold">{currentTitle}</span>
            </div>
            <Outlet />
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};
