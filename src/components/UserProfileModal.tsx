import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  Github, Globe, Mail, 
  Code, LifeBuoy, Briefcase, Shield, Eye, Tag as TagIcon,
  Star, Bug, Settings, CheckCircle, AlertTriangle, Database, Cpu, Server, Smartphone, Rocket, Wrench, Zap, Cloud, Lock, BookOpen, Bell, Camera, Compass, Gift
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export interface PublicProfile {
  id: string;
  display_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  github_url?: string | null;
  google_url?: string | null;
  website_url?: string | null;
  tags?: any[] | null;
  role?: string | null;
}

type FunctionRole = 'desenvolvimento' | 'suporte' | 'gerencia' | 'supervisao' | 'visualizador';

type UserRole = 'master' | 'admin' | 'manager' | 'tester' | 'viewer';

const roleLabel: Record<FunctionRole, string> = {
  desenvolvimento: 'Desenvolvimento',
  suporte: 'Suporte',
  gerencia: 'Gerência',
  supervisao: 'Supervisão',
  visualizador: 'Visualizador',
};

const userRoleLabel: Record<UserRole, string> = {
  master: 'Master',
  admin: 'Administrador',
  manager: 'Gerência',
  tester: 'Testador',
  viewer: 'Visualizador',
};

const RoleIcon: Record<FunctionRole, React.ComponentType<any>> = {
  desenvolvimento: Code,
  suporte: LifeBuoy,
  gerencia: Briefcase,
  supervisao: Shield,
  visualizador: Eye,
};

const TagIconMap: Record<string, React.ComponentType<any>> = {
  '': TagIcon,
  'tag': TagIcon,
  'code': Code,
  'lifebuoy': LifeBuoy,
  'briefcase': Briefcase,
  'shield': Shield,
  'eye': Eye,
  'globe': Globe,
  'github': Github,
  'mail': Mail,
  'star': Star,
  'bug': Bug,
  'settings': Settings,
  'check': CheckCircle,
  'alert': AlertTriangle,
  'database': Database,
  'cpu': Cpu,
  'server': Server,
  'phone': Smartphone,
  'rocket': Rocket,
  'wrench': Wrench,
  'zap': Zap,
  'cloud': Cloud,
  'lock': Lock,
  'book': BookOpen,
  'bell': Bell,
  'camera': Camera,
  'compass': Compass,
  'gift': Gift,
};

export const UserProfileModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  initialProfile?: Partial<PublicProfile>;
}> = ({ isOpen, onClose, userId, initialProfile }) => {
  const SINGLE_TENANT = String((import.meta as any).env?.VITE_SINGLE_TENANT ?? 'true') === 'true';
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<PublicProfile | null>(initialProfile ? { id: userId, ...initialProfile } as PublicProfile : null);
  const [roles, setRoles] = useState<Array<{ role: FunctionRole; icon?: string }>>([]);
  const [tags, setTags] = useState<Array<{ label: string; icon?: string; color?: string }>>([]);

  useEffect(() => {
    const load = async () => {
      if (!isOpen || !userId) return;
      try {
        setLoading(true);
        if (!SINGLE_TENANT) {
          const { data, error } = await supabase
            .from('profiles' as any)
            .select('id, display_name, email, avatar_url, github_url, google_url, website_url, role')
            .eq('id', userId)
            .maybeSingle();
          if (!error && data) {
            setProfile(data as PublicProfile);
            // Tags
            try {
              const resTags = await supabase.from('profiles' as any).select('tags').eq('id', userId).maybeSingle();
              const raw = (resTags.data as any)?.tags;
              if (Array.isArray(raw)) setTags(raw as any);
            } catch {}
            // Roles
            try {
              const resRoles = await supabase
                .from('profile_function_roles' as any)
                .select('role, icon')
                .eq('user_id', userId);
              const list = (resRoles.data || []) as Array<{ role: FunctionRole; icon?: string }>;
              setRoles(list);
            } catch {}
            return;
          }
        }
        // Fallback: se for o usuário autenticado atual
        const { data: authData } = await supabase.auth.getUser();
        const me = authData?.user;
        if (me && me.id === userId) {
          setProfile({
            id: me.id,
            display_name: (me.user_metadata as any)?.full_name || me.email || 'Usuário',
            email: me.email || undefined,
            avatar_url: (me.user_metadata as any)?.avatar_url,
            github_url: (me.user_metadata as any)?.github_url,
            google_url: (me.user_metadata as any)?.google_url,
            website_url: (me.user_metadata as any)?.website_url,
            tags: (me.user_metadata as any)?.tags || [],
          });
          const rawTags = (me.user_metadata as any)?.tags;
          if (Array.isArray(rawTags)) setTags(rawTags as any);
          return;
        }
        // Se não houver dados, manter minimal
        setProfile((prev) => prev ?? { id: userId } as PublicProfile);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isOpen, userId]);

  const initials = (profile?.display_name || profile?.email || 'U')
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md 
        [&_*[aria-label='Close']]:!ring-0 
        [&_*[aria-label='Close']]:!ring-offset-0 
        [&_*[aria-label='Close']]:!outline-none 
        [&_*[aria-label='Close']]:!focus:outline-none 
        [&_*[aria-label='Close']]:!focus:ring-0 
        [&_*[aria-label='Close']]:!focus:ring-offset-0 
        [&_*[aria-label='Close']]:!focus-visible:outline-none 
        [&_*[aria-label='Close']]:!focus-visible:ring-0 
        [&_*[aria-label='Close']]:!focus-visible:ring-offset-0
      ">
        {/* Removido cabeçalho textual para evitar redundância com o tooltip de abertura */}

        <div className="flex flex-col items-center text-center gap-3">
          <Avatar className="h-24 w-24">
            <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.display_name || 'Avatar'} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div>
            <div className="text-lg font-semibold">{profile?.display_name || 'Usuário'}</div>
          </div>

          {/* Cargo principal (profiles.role) */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] bg-muted text-muted-foreground border">
              <TagIcon className="h-3 w-3" /> <span className="text-emerald-300 font-semibold">{userRoleLabel[(profile?.role as UserRole) || 'viewer']}</span>
            </span>
          </div>

          {/* Ícones de links (email, GitHub, Google, website) */}
          {(profile?.email || profile?.github_url || profile?.google_url || profile?.website_url) && (
            <div className="flex items-center gap-3 mt-2">
              {profile?.email && (
                <Button asChild variant="ghost" size="icon" className="h-10 w-10" title="Email">
                  <a href={`mailto:${profile.email}`} target="_blank" rel="noreferrer">
                    <Mail className="h-6 w-6 text-[#EA4335]" />
                  </a>
                </Button>
              )}
              {profile?.github_url && (
                <Button asChild variant="ghost" size="icon" className="h-10 w-10" title="GitHub">
                  <a href={profile.github_url} target="_blank" rel="noreferrer">
                    <Github className="h-6 w-6 text-[#9CA3AF]" />
                  </a>
                </Button>
              )}
              {profile?.google_url && (
                <Button asChild variant="ghost" size="icon" className="h-10 w-10" title="Google">
                  <a href={profile.google_url} target="_blank" rel="noreferrer">
                    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.2-1.7 3.6-5.5 3.6-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.2.8 3.9 1.5l2.7-2.7C16.8 2.7 14.6 1.8 12 1.8 6.9 1.8 2.7 6 2.7 11.1S6.9 20.4 12 20.4c6.9 0 9.5-4.8 9.5-7.3 0-.5-.1-.8-.1-1.1H12z"/>
                    </svg>
                  </a>
                </Button>
              )}
              {profile?.website_url && (
                <Button asChild variant="ghost" size="icon" className="h-10 w-10" title="Website">
                  <a href={profile.website_url} target="_blank" rel="noreferrer">
                    <Globe className="h-6 w-6 text-[#0EA5E9]" />
                  </a>
                </Button>
              )}
            </div>
          )}

          {/* Tags normais do usuário (separadas dos cargos) */}
          {tags.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
              {tags.slice(0, 3).map((t, idx) => {
                const label = typeof t === 'string' ? (t as any) : (t?.label || 'tag');
                const icon = (typeof t === 'object' && (t as any)?.icon) ? (t as any).icon : undefined;
                const color = (typeof t === 'object' && (t as any)?.color) ? (t as any).color : undefined;
                const iconMap: Record<string, React.ComponentType<any>> = {
                  '': TagIcon,
                  'tag': TagIcon,
                  'code': Code,
                  'lifebuoy': LifeBuoy,
                  'briefcase': Briefcase,
                  'shield': Shield,
                  'eye': Eye,
                  'globe': Globe,
                  'github': Github,
                  'mail': Mail,
                  'star': Star,
                  'bug': Bug,
                  'settings': Settings,
                  'check': CheckCircle,
                  'alert': AlertTriangle,
                  'database': Database,
                  'cpu': Cpu,
                  'server': Server,
                  'phone': Smartphone,
                  'rocket': Rocket,
                  'wrench': Wrench,
                  'zap': Zap,
                  'cloud': Cloud,
                  'lock': Lock,
                  'book': BookOpen,
                  'bell': Bell,
                  'camera': Camera,
                  'compass': Compass,
                  'gift': Gift,
                };
                const IconC = (icon && iconMap[icon]) ? iconMap[icon] : TagIcon;
                return (
                  <span key={`tag-${idx}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-accent text-accent-foreground">
                    <IconC className="h-3.5 w-3.5" style={{ color }} /> {label}
                  </span>
                );
              })}
            </div>
          )}

          {/* Removidos ícones de informações pessoais (email, GitHub, Google, website) */}

          

          {/* Removido o botão 'Fechar' (o X do modal já fecha) */}
        </div>
      </DialogContent>
    </Dialog>
  );
};
