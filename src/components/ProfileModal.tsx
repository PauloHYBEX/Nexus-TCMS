import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions, UserRole } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { logActivity } from '@/services/supabaseService';
import { invalidateUserAvatarCache } from '@/components/ui/UserAvatar';
// Tipagem local para evitar dependência de types gerados
type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
  role: UserRole | string | null;
  created_at: string;
  updated_at: string;
  organization_id: string | null;
  avatar_url?: string | null;
  github_url?: string | null;
  google_url?: string | null;
  website_url?: string | null;
};
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Github, Globe, Mail, Plus, X, Code, LifeBuoy, Briefcase, Shield, Eye, Tag as TagIcon, Star, Bug, Settings, CheckCircle, AlertTriangle, Database, Cpu, Server, Smartphone, Rocket, Wrench, Zap, Cloud, Lock, BookOpen, Bell, Camera, Compass, Gift } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const SINGLE_TENANT = String((import.meta as any).env?.VITE_SINGLE_TENANT ?? 'true') === 'true';

// OBS: Em projetos multi-tenant, ajuste para usar tipos gerados do Supabase

const roleLabels: Record<UserRole, string> = {
  master: 'Master',
  admin: 'Administrador',
  manager: 'Gerente',
  tester: 'Testador',
  viewer: 'Visualizador',
};

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { role } = usePermissions();

  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'user' | 'history' | 'preferences'>('user');

  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [githubUrl, setGithubUrl] = useState<string>('');
  const [googleUrl, setGoogleUrl] = useState<string>('');
  const [websiteUrl, setWebsiteUrl] = useState<string>('');
  const [prefs, setPrefs] = useState<{ email_enabled: boolean; system_enabled: boolean; push_enabled: boolean } | null>(null);
  const [history, setHistory] = useState<Array<{ id: string; action: string; context: string | null; created_at: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<Array<{ label: string; icon?: string; color?: string }>>([]);
  const [newTag, setNewTag] = useState('');
  const [newTagIcon, setNewTagIcon] = useState<string>('');
  const [newTagColor, setNewTagColor] = useState<string>('#10B981');
  const palette: string[] = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#A78BFA', '#14B8A6', '#F472B6', '#94A3B8'];
  const tagIconOptions: Array<{ id: string; Icon: React.ComponentType<any> | null; title: string }> = [
    { id: '', Icon: null, title: 'Sem ícone' },
    { id: 'code', Icon: Code, title: 'Code' },
    { id: 'lifebuoy', Icon: LifeBuoy, title: 'Suporte' },
    { id: 'briefcase', Icon: Briefcase, title: 'Gerência' },
    { id: 'shield', Icon: Shield, title: 'Supervisão' },
    { id: 'eye', Icon: Eye, title: 'Visualizador' },
    { id: 'tag', Icon: TagIcon, title: 'Tag' },
    { id: 'globe', Icon: Globe, title: 'Globe' },
    { id: 'github', Icon: Github, title: 'GitHub' },
    { id: 'mail', Icon: Mail, title: 'Mail' },
    { id: 'star', Icon: Star, title: 'Star' },
    { id: 'bug', Icon: Bug, title: 'Bug' },
    { id: 'settings', Icon: Settings, title: 'Settings' },
    { id: 'check', Icon: CheckCircle, title: 'Check' },
    { id: 'alert', Icon: AlertTriangle, title: 'Alerta' },
    { id: 'database', Icon: Database, title: 'Database' },
    { id: 'cpu', Icon: Cpu, title: 'CPU' },
    { id: 'server', Icon: Server, title: 'Server' },
    { id: 'phone', Icon: Smartphone, title: 'Smartphone' },
    { id: 'rocket', Icon: Rocket, title: 'Rocket' },
    { id: 'wrench', Icon: Wrench, title: 'Wrench' },
    { id: 'zap', Icon: Zap, title: 'Zap' },
    { id: 'cloud', Icon: Cloud, title: 'Cloud' },
    { id: 'lock', Icon: Lock, title: 'Lock' },
    { id: 'book', Icon: BookOpen, title: 'Book' },
    { id: 'bell', Icon: Bell, title: 'Bell' },
    { id: 'camera', Icon: Camera, title: 'Camera' },
    { id: 'compass', Icon: Compass, title: 'Compass' },
    { id: 'gift', Icon: Gift, title: 'Gift' },
  ];
  const [requestRolesOpen, setRequestRolesOpen] = useState(false);
  const [requestedRoles, setRequestedRoles] = useState<Array<'desenvolvimento' | 'suporte' | 'gerencia' | 'supervisao' | 'visualizador'>>([]);
  const [hasRoleRequest, setHasRoleRequest] = useState<boolean>(false);

  // Preferimos carregar quando abrir
  useEffect(() => {
    const load = async () => {
      if (!isOpen) return;
      try {
        setLoading(true);
        if (!user) return;

        if (SINGLE_TENANT) {
          const { data } = await supabase.auth.getUser();
          const u = data?.user;
          setEmail(u?.email || '');
          setDisplayName((u?.user_metadata as any)?.full_name || '');
          setAvatarUrl((u?.user_metadata as any)?.avatar_url || '');
          setGithubUrl((u?.user_metadata as any)?.github_url || '');
          setGoogleUrl((u?.user_metadata as any)?.google_url || '');
          setWebsiteUrl((u?.user_metadata as any)?.website_url || '');
          setProfile({
            id: u?.id || '',
            email: u?.email || '',
            display_name: (u?.user_metadata as any)?.full_name || '',
            role: (role || 'viewer') as UserRole,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            organization_id: null,
          } as Profile);
          setPrefs({ email_enabled: true, system_enabled: true, push_enabled: false });
          return;
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('id, display_name, email, role, created_at, updated_at, tags, avatar_url, github_url, google_url, website_url')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          console.error(error);
          toast({ title: 'Erro', description: 'Não foi possível carregar seu perfil.', variant: 'destructive' });
          return;
        }
        if (data) {
          setProfile(data as Profile);
          setDisplayName((data as Profile).display_name || '');
          setEmail((data as Profile).email || '');
          setAvatarUrl((data as any).avatar_url || '');
          setGithubUrl((data as any).github_url || '');
          setGoogleUrl((data as any).google_url || '');
          setWebsiteUrl((data as any).website_url || '');
          const tgs = (data as any).tags;
          if (Array.isArray(tgs)) setTags(tgs);
        }

        // Carregar preferências
        const { data: pref, error: prefErr } = await supabase
          .from('notification_preferences' as any)
          .select('email_enabled, system_enabled, push_enabled')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!prefErr && pref) {
          setPrefs(pref as any);
        } else {
          setPrefs({ email_enabled: true, system_enabled: true, push_enabled: false });
        }

        

        // Verificar se já existe solicitação de cargo (apenas multi-tenant)
        if (!SINGLE_TENANT) {
          try {
            const { data: rr } = await supabase
              .from('role_requests' as any)
              .select('id, status')
              .eq('user_id', user.id)
              .maybeSingle();
            setHasRoleRequest(!!rr);
          } catch {
            setHasRoleRequest(false);
          }
        } else {
          setHasRoleRequest(true); // desativa no single-tenant
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isOpen, toast, user, role]);

  // Funções fora do useEffect para uso no JSX
  const addTag = () => {
    const label = newTag.trim();
    if (!label) return;
    // Limitar a 3 tags
    if (tags.length >= 3) {
      toast({ title: 'Limite de tags', description: 'Você pode ter no máximo 3 tags.', variant: 'destructive' });
      return;
    }
    setTags((prev) => [...prev, { label, icon: newTagIcon || undefined, color: newTagColor }]);
    try { logActivity('tag_added', `label=${label}`); } catch {}
    setNewTag('');
    setNewTagIcon('');
    setNewTagColor('#10B981');
  };

  const removeTag = (idx: number) => {
    const t = tags[idx];
    setTags((prev) => prev.filter((_, i) => i !== idx));
    try { logActivity('tag_removed', `label=${(t as any)?.label || ''}`); } catch {}
  };

  const toggleRequestedRole = (val: 'desenvolvimento' | 'suporte' | 'gerencia' | 'supervisao' | 'visualizador') => {
    setRequestedRoles((prev) => prev.includes(val) ? prev.filter(r => r !== val) : [...prev, val]);
  };

  const submitRoleRequest = async () => {
    if (SINGLE_TENANT || hasRoleRequest || requestedRoles.length === 0 || !user) return;
    try {
      const { error } = await supabase
        .from('role_requests' as any)
        .insert({ user_id: user.id, requested_roles: requestedRoles });
      if (error) throw error;
      setHasRoleRequest(true);
      setRequestRolesOpen(false);
      toast({ title: 'Solicitação enviada', description: 'Sua solicitação de cargo foi enviada ao Master.' });
      try { logActivity('role_request_submitted', `roles=${requestedRoles.join(',')}`, user.id); } catch {}
    } catch (e: any) {
      toast({ title: 'Erro', description: e?.message || 'Não foi possível enviar a solicitação.', variant: 'destructive' });
    }
  };

  const roleName = useMemo(() => roleLabels[(profile?.role || role || 'viewer') as UserRole], [profile?.role, role]);

  // Carregar histórico ao trocar para a aba
  useEffect(() => {
    const loadHistory = async () => {
      if (activeTab !== 'history' || !isOpen || !user) return;
      const { data, error } = await supabase
        .from('activity_logs' as any)
        .select('id, action, context, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error || !data) { setHistory([]); return; }
      const list = (data as any[]) || [];
      const top5 = list.slice(0, 5);
      const overflow = list.slice(5);
      setHistory(top5 as any);
      // Apaga logs excedentes no banco (somente os mais antigos além do 5º)
      if (overflow.length > 0) {
        try {
          const ids = overflow.map((r: any) => r.id).filter(Boolean);
          if (ids.length) {
            await supabase.from('activity_logs' as any).delete().in('id', ids as any);
          }
        } catch (e) {
          // silencioso: se der erro de permissão, apenas ignora
          console.warn('Falha ao limpar logs excedentes:', e);
        }
      }
    };
    loadHistory();
  }, [activeTab, isOpen, user]);

  const handleSave = async () => {
    if (!user) return;
    try {
      setSaving(true);
      // Salvar nome
      // Sempre atualiza a tabela profiles (funciona em ambos os modos)
      const { error: profErr } = await supabase
        .from('profiles' as any)
        .update({ display_name: displayName, avatar_url: avatarUrl, github_url: githubUrl, google_url: googleUrl, website_url: websiteUrl, tags })
        .eq('id', user.id);
      if (profErr) throw profErr;
      if (SINGLE_TENANT) {
        try { await supabase.auth.updateUser({ data: { full_name: displayName, avatar_url: avatarUrl } } as any); } catch {}
        toast({ title: 'Perfil atualizado', description: 'Dados atualizados.' });
        invalidateUserAvatarCache(user.id);
        try { logActivity('profile_saved', 'single_tenant'); } catch {}
        return;
      }

      // Salvar preferências (se existir prefs state)
      if (prefs) {
        const { error: prefErr } = await supabase
          .from('notification_preferences' as any)
          .upsert({ user_id: user.id, ...prefs }, { onConflict: 'user_id' } as any);
        if (prefErr) throw prefErr;
      }

      toast({ title: 'Perfil atualizado', description: 'Dados e preferências salvos.' });
      invalidateUserAvatarCache(user.id);
      try { logActivity('profile_saved', 'multi_tenant'); } catch {}
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Erro ao salvar', description: e?.message || 'Tente novamente.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const initials = (displayName || email || 'U')
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleAvatarChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    if (!user) return;
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      const ext = file.name.split('.').pop();
      const path = `avatars/${user.id}_${Date.now()}.${ext}`;
      const { data: uploadData, error: upErr } = await supabase.storage.from('public-assets').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      // Usar a URL retornada pelo servidor (não o path original do cliente)
      const serverPath = (uploadData as any)?.publicUrl || path;
      const { data: pub } = supabase.storage.from('public-assets').getPublicUrl(serverPath);
      const url = pub?.publicUrl || '';
      setAvatarUrl(url);
      // Persistir imediatamente em profiles (funciona em ambos os modos)
      const { error: profErr } = await supabase
        .from('profiles' as any)
        .update({ avatar_url: url })
        .eq('id', user.id);
      if (profErr) throw profErr;
      toast({ title: 'Avatar atualizado', description: 'Sua foto foi enviada e salva.' });
      invalidateUserAvatarCache(user.id);
      try { logActivity('avatar_updated'); } catch {}
    } catch (err: any) {
      console.error(err);
      // Tratamento amigável quando bucket não existir
      const msg = err?.message || '';
      if (/bucket not found/i.test(msg) || err?.statusCode === '404') {
        toast({
          title: 'Bucket ausente',
          description: 'Crie o bucket "public-assets" (aplique a migration 20250917_storage_public_assets.sql) e tente novamente.',
          variant: 'destructive'
        });
      } else {
        toast({ title: 'Erro no upload', description: msg || 'Não foi possível enviar a foto.', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Meu Perfil</DialogTitle>
          <DialogDescription>Atualize suas informações públicas e preferências.</DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="user">Usuário</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="preferences">Preferências</TabsTrigger>
          </TabsList>

          <TabsContent value="user" className="space-y-4 p-2 focus-visible:ring-0 ring-0 outline-none focus:outline-none focus-visible:ring-offset-0">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarImage src={avatarUrl || undefined} alt={displayName || 'Avatar'} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <div>
                <Label className="block text-sm mb-1">Foto</Label>
                <div className="flex items-center gap-2">
                  <Input type="file" accept="image/*" onChange={handleAvatarChange} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="display_name">Nome</Label>
                <Input id="display_name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={email} readOnly />
              </div>
              <div className="space-y-2">
                <Label>Papel</Label>
                <Input value={roleName} readOnly />
              </div>
              <div className="space-y-2">
                <Label htmlFor="github_url" className="flex items-center gap-2"><Github className="h-4 w-4" /> GitHub</Label>
                <Input id="github_url" placeholder="https://github.com/seu-usuario" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="google_url" className="flex items-center gap-2"><Mail className="h-4 w-4" /> Google</Label>
                <Input id="google_url" placeholder="https://profiles.google.com/" value={googleUrl} onChange={(e) => setGoogleUrl(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website_url" className="flex items-center gap-2"><Globe className="h-4 w-4" /> Website</Label>
                <Input id="website_url" placeholder="https://seu-site.com" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
              </div>
            </div>

            {/* Tags públicas */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Code className="h-4 w-4" /> Tags públicas</Label>
              <div className="flex flex-wrap gap-2">
                {tags.map((t, idx) => {
                  const iconsMap: Record<string, React.ComponentType<any>> = {
                    code: Code, lifebuoy: LifeBuoy, briefcase: Briefcase, shield: Shield, eye: Eye, tag: TagIcon, globe: Globe, github: Github, mail: Mail,
                    star: Star, bug: Bug, settings: Settings, check: CheckCircle, alert: AlertTriangle, database: Database, cpu: Cpu, server: Server,
                    phone: Smartphone, rocket: Rocket, wrench: Wrench, zap: Zap, cloud: Cloud, lock: Lock, book: BookOpen, bell: Bell, camera: Camera,
                    compass: Compass, gift: Gift,
                  };
                  const IconC = (t.icon && iconsMap[t.icon]) ? iconsMap[t.icon] : TagIcon;
                  return (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-accent text-accent-foreground">
                      <IconC className="h-3.5 w-3.5" style={{ color: t.color || undefined }} /> {t.label}
                      <button type="button" className="ml-1 opacity-70 hover:opacity-100" onClick={() => removeTag(idx)}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <Input placeholder="ex.: -dev, -tester" value={newTag} onChange={(e) => setNewTag(e.target.value)} className="max-w-xs" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" title="Escolher ícone">
                      {(() => {
                        const opt = tagIconOptions.find(o => o.id === newTagIcon);
                        const Ico = opt?.Icon;
                        return Ico ? <Ico className="h-4 w-4" /> : <span className="text-xs">Sem ícone</span>;
                      })()}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2">
                    <div className="grid grid-cols-5 gap-2">
                      {tagIconOptions.map(({ id, Icon, title }) => (
                        <Button key={id || 'none'} type="button" variant={newTagIcon === id ? 'brand' : 'ghost'} size="icon" title={title} onClick={() => setNewTagIcon(id)} className="h-8 w-8">
                          {Icon ? <Icon className="h-4 w-4" /> : <X className="h-4 w-4" />}
                        </Button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                {/* Paleta de cores para o ícone */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" title="Cor do ícone">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full border" style={{ background: newTagColor }} />
                        <span className="text-xs">Cor</span>
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2">
                    <div className="grid grid-cols-8 gap-2">
                      {palette.map((c) => (
                        <button key={c} type="button" onClick={() => setNewTagColor(c)} className={`h-6 w-6 rounded-full border ${newTagColor === c ? 'ring-2 ring-offset-1 ring-brand' : ''}`} style={{ background: c }} />
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Button type="button" size="sm" variant="brand" onClick={addTag}>
                  <Plus className="h-4 w-4" /> Adicionar tag
                </Button>
              </div>
            </div>

            {/* Solicitar cargo (somente usuário, uma vez) */}
            {!SINGLE_TENANT && !hasRoleRequest && (
              <div className="mt-2 border rounded-md p-3">
                <div className="text-sm font-medium mb-2">Solicitar cargo (apenas uma vez)</div>
                <div className="flex flex-wrap gap-3 text-sm">
                  {['desenvolvimento','suporte','gerencia','supervisao','visualizador'].map((r) => (
                    <label key={r} className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={requestedRoles.includes(r as any)} onChange={() => toggleRequestedRole(r as any)} />
                      <span className="capitalize">{r}</span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <Button variant="secondary" type="button" onClick={() => { setRequestedRoles([]); }}>Limpar</Button>
                  <Button variant="brand" type="button" onClick={submitRoleRequest} disabled={requestedRoles.length === 0}>Enviar solicitação</Button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Fechar</Button>
              <Button variant="brand" onClick={handleSave} disabled={loading || saving}>Salvar</Button>
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-3 p-2 focus-visible:ring-0 ring-0 outline-none focus:outline-none focus-visible:ring-offset-0">
            <div className="text-sm text-muted-foreground">Histórico do usuário</div>
            <div className="text-[11px] text-muted-foreground">Apenas os 5 últimos registros são mantidos automaticamente.</div>
            {history.length === 0 ? (
              <div className="text-sm text-gray-500">Nenhum registro disponível.</div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-auto pr-1">
                {history.map((h) => (
                  <div key={h.id} className="text-sm border rounded-md p-2">
                    <div className="font-medium">{h.action}</div>
                    {h.context && <div className="text-xs text-muted-foreground">{h.context}</div>}
                    <div className="text-xs text-gray-500 mt-1">{new Date(h.created_at).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="preferences" className="space-y-4 p-2 focus-visible:ring-0 ring-0 outline-none focus:outline-none focus-visible:ring-offset-0">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Notificações por email</div>
                  <div className="text-xs text-muted-foreground">Receber alertas por email</div>
                </div>
                <Switch 
                  checked={!!prefs?.email_enabled}
                  onCheckedChange={(v) => setPrefs((p) => (p ? { ...p, email_enabled: v } : { email_enabled: v, system_enabled: true, push_enabled: false }))}
                  disabled={SINGLE_TENANT}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Notificações no sistema</div>
                  <div className="text-xs text-muted-foreground">Mostrar alertas no sininho</div>
                </div>
                <Switch 
                  checked={!!prefs?.system_enabled}
                  onCheckedChange={(v) => setPrefs((p) => (p ? { ...p, system_enabled: v } : { email_enabled: true, system_enabled: v, push_enabled: false }))}
                  disabled={SINGLE_TENANT}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Notificações Push</div>
                  <div className="text-xs text-muted-foreground">Receber push quando disponível</div>
                </div>
                <Switch 
                  checked={!!prefs?.push_enabled}
                  onCheckedChange={(v) => setPrefs((p) => (p ? { ...p, push_enabled: v } : { email_enabled: true, system_enabled: true, push_enabled: v }))}
                  disabled={SINGLE_TENANT}
                />
              </div>
            </div>

            
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default ProfileModal;
