import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Moon, Sun, Settings, User, LogOut, Shield, Info, Bell } from 'lucide-react';
import KrigzisLogo from '@/components/branding/KrigzisLogo';
import { ProjectPicker } from '@/components/ProjectPicker';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SettingsModal } from '@/components/SettingsModal';
import { ProfileModal } from '@/components/ProfileModal';
import { supabase } from '@/integrations/supabase/client';

export const Header = () => {
  const location = useLocation();
  const firstSeg = location.pathname.replace(/^\//, '').split('/')[0];
  const { mode, toggleMode } = useTheme();
  const { user, signOut } = useAuth();
  const { role } = usePermissions();
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [notifs, setNotifs] = useState<Array<{ id: string; title: string; body: string | null; created_at: string; read_at: string | null }>>([]);

  const SINGLE_TENANT = String((import.meta as any).env?.VITE_SINGLE_TENANT ?? 'true') === 'true';

  // Role display names and colors
  const roleInfo = {
    master: { name: 'Master', color: 'text-purple-500' },
    admin: { name: 'Administrador', color: 'text-red-500' },
    manager: { name: 'Gerente', color: 'text-blue-500' },
    tester: { name: 'Testador', color: 'text-green-500' },
    viewer: { name: 'Visualizador', color: 'text-gray-500' }
  };

  // Carregar notificações e assinar realtime
  useEffect(() => {
    if (!user || SINGLE_TENANT) return;

    let channel: any = null;

    const fetchNotifs = async () => {
      // Lista últimas 10
      const { data } = await supabase
        .from('notifications' as any)
        .select('id, title, body, created_at, read_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) setNotifs(data as any);

      // Contagem não lidas
      const { count } = await supabase
        .from('notifications' as any)
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null);
      setNotifCount(count || 0);
    };

    fetchNotifs();

    channel = supabase
      .channel(`notifications-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        fetchNotifs();
      })
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [user, SINGLE_TENANT]);

  const markAsRead = async (id: string) => {
    if (!user || SINGLE_TENANT) return;
    const { error } = await supabase
      .from('notifications' as any)
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);
    if (!error) {
      setNotifs((prev) => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
      setNotifCount((c) => Math.max(0, c - 1));
    }
  };

  return (
    <>
      <header className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center justify-between px-6 h-[72px]">
          <div className="flex items-center space-x-4">
            <div className="flex items-center gap-2">
              <KrigzisLogo size={24} className="h-6 w-6" />
              <h1 className="text-2xl font-bold text-foreground hidden md:block">
                Nexus Testing
              </h1>
            </div>
            <p className="hidden lg:block text-sm font-medium accent-gradient-text opacity-90">
              Geração inteligente de testes
            </p>
            <div className="hidden md:block ml-4">
              <ProjectPicker />
            </div>
          </div>

          <div className="flex items-center space-x-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMode}
              className="relative"
            >
              {mode === 'light' ? (
                <Moon className="h-5 w-5" />
              ) : (
                <Sun className="h-5 w-5" />
              )}
            </Button>
            {/* Notificações (sininho) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5" />
                  {notifCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-brand text-[10px] text-brand-foreground flex items-center justify-center">
                      {notifCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Notificações</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SINGLE_TENANT ? (
                  <div className="text-sm text-muted-foreground p-3">Modo single-tenant: notificações desativadas.</div>
                ) : notifs.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-3">Nenhuma notificação no momento.</div>
                ) : (
                  <div className="max-h-80 overflow-auto py-1">
                    {notifs.map((n) => (
                      <div
                        key={n.id}
                        className={`px-3 py-2 text-sm cursor-pointer hover:bg-accent ${n.read_at ? 'opacity-80' : 'font-medium'}`}
                        onClick={() => markAsRead(n.id)}
                      >
                        <div className="truncate">{n.title}</div>
                        {n.body && <div className="text-xs text-muted-foreground truncate">{n.body}</div>}
                        <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <User className="h-5 w-5" />
                  {role && (
                    <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${roleInfo[role]?.color || 'bg-muted-foreground'}`}></span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="truncate">{user?.email}</div>
                  <div className="flex items-center mt-1 text-xs text-muted-foreground">
                    <Shield className={`h-3 w-3 mr-1 ${roleInfo[role]?.color || ''}`} />
                    {roleInfo[role]?.name || 'Usuário'}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowProfile(true)}>
                  <User className="mr-2 h-4 w-4" />
                  Meu Perfil
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowSettings(true)}>
                  <Settings className="mr-2 h-4 w-4" />
                  Configurações
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => window.location.href = '/about'}>
                  <Info className="mr-2 h-4 w-4" />
                  Sobre
                </DropdownMenuItem>
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
      />
      <ProfileModal 
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
      />
    </>
  );
};
