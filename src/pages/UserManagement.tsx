import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions, UserRole, UserPermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Users, Loader2, Search, UserPlus, Trash2, ChevronDown, ChevronUp,
  Shield, UserCog, RefreshCcw, Check, X as XIcon, Mail, Crown,
  FileText, ClipboardCheck, Play, BarChart3, Download, Sparkles,
  Zap, Settings, Link2, Bug, Activity, Eye, Lock,
} from 'lucide-react';

const SINGLE_TENANT = String(import.meta.env?.VITE_SINGLE_TENANT ?? 'true') === 'true';

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserData {
  id: string;
  email: string;
  created_at: string;
  profile?: { display_name: string | null; role: UserRole; organization_id: string | null };
  permissions?: Partial<UserPermissions>;
}

type PermRow = { user_id: string } & { [K in keyof UserPermissions]?: boolean };

type RoleRequest = {
  id: string;
  user_id: string;
  requested_roles: string[];
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<UserRole, string> = {
  master: 'Master',
  admin: 'Administrador',
  manager: 'Gerente',
  tester: 'Testador',
  viewer: 'Visualizador',
};

const ROLE_COLORS: Record<UserRole, string> = {
  master: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  admin: 'bg-red-500/10 text-red-400 border-red-500/20',
  manager: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  tester: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  viewer: 'bg-muted text-muted-foreground border-border',
};

// Permissões agrupadas por categoria — apenas as que existem no código
const PERMISSION_GROUPS: Array<{
  key: string;
  label: string;
  icon: React.ElementType;
  items: Array<{ key: keyof UserPermissions; label: string; desc: string; icon: React.ElementType }>;
}> = [
  {
    key: 'admin',
    label: 'Administração do Sistema',
    icon: Shield,
    items: [
      { key: 'can_manage_users', label: 'Gerenciar Usuários', desc: 'Criar, editar e remover usuários', icon: UserCog },
      { key: 'can_manage_projects', label: 'Gerenciar Projetos', desc: 'Criar e editar projetos', icon: Settings },
      { key: 'can_delete_projects', label: 'Excluir Projetos', desc: 'Remover projetos permanentemente', icon: Trash2 },
    ],
  },
  {
    key: 'testing',
    label: 'Gerenciamento de Testes',
    icon: ClipboardCheck,
    items: [
      { key: 'can_manage_plans', label: 'Planos de Teste', desc: 'Criar e editar planos de teste', icon: FileText },
      { key: 'can_manage_cases', label: 'Casos de Teste', desc: 'Criar e editar casos de teste', icon: ClipboardCheck },
      { key: 'can_manage_executions', label: 'Execuções', desc: 'Registrar e editar execuções de teste', icon: Play },
    ],
  },
  {
    key: 'gestao',
    label: 'Gestão',
    icon: Link2,
    items: [
      { key: 'can_manage_requirements', label: 'Requisitos', desc: 'Criar e editar requisitos', icon: FileText },
      { key: 'can_manage_defects', label: 'Defeitos', desc: 'Registrar e gerenciar defeitos', icon: Bug },
    ],
  },
  {
    key: 'reports',
    label: 'Relatórios e Exportação',
    icon: BarChart3,
    items: [
      { key: 'can_view_reports', label: 'Visualizar Relatórios', desc: 'Acessar relatórios e histórico', icon: BarChart3 },
      { key: 'can_export', label: 'Exportar Dados', desc: 'Exportar dados em CSV/PDF', icon: Download },
    ],
  },
  {
    key: 'ai',
    label: 'Inteligência Artificial',
    icon: Sparkles,
    items: [
      { key: 'can_use_ai', label: 'Usar IA', desc: 'Gerar planos e casos com IA', icon: Sparkles },
      { key: 'can_select_ai_models', label: 'Selecionar Modelos IA', desc: 'Trocar o modelo de IA em uso', icon: Zap },
      { key: 'can_manage_ai_templates', label: 'Gerenciar Templates IA', desc: 'Editar prompts e templates', icon: FileText },
    ],
  },
  {
    key: 'model_control',
    label: 'Model Control (Avançado)',
    icon: Activity,
    items: [
      { key: 'can_access_model_control', label: 'Acessar Model Control', desc: 'Painel de controle de modelos IA', icon: Activity },
      { key: 'can_configure_ai_models', label: 'Configurar Modelos IA', desc: 'Chaves de API e endpoints', icon: Settings },
      { key: 'can_test_ai_connections', label: 'Testar Conexões IA', desc: 'Diagnosticar conectividade de modelos', icon: Zap },
    ],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normalizePerms = (row?: PermRow): Partial<UserPermissions> => {
  if (!row) return {};
  const out: Partial<UserPermissions> = {};
  for (const g of PERMISSION_GROUPS) {
    for (const item of g.items) {
      const v = (row as Record<string, unknown>)[item.key];
      if (typeof v === 'boolean') (out as Record<string, unknown>)[item.key] = v;
    }
  }
  return out;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export const UserManagement = () => {
  const { role, isMaster, updateUserToMaster, getDefaultPermissions } = usePermissions();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [permSearch, setPermSearch] = useState('');
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('viewer');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [syncingProfiles, setSyncingProfiles] = useState(false);
  const [roleRequests, setRoleRequests] = useState<RoleRequest[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);

  // ── Data loading ────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      if (SINGLE_TENANT) {
        const { data: authData } = await supabase.auth.getUser();
        const cur = authData?.user;
        if (cur) {
          setUsers([{
            id: cur.id,
            email: cur.email || '',
            created_at: cur.created_at,
            profile: { display_name: (cur.user_metadata as Record<string, unknown>)?.full_name as string || 'Master', role: 'master', organization_id: null },
            permissions: getDefaultPermissions('master'),
          }]);
        }
        return;
      }

      const { data: allUsers, error: listErr } = await supabase.rpc('list_all_users');
      let rows: Array<{ id: string; email: string | null; display_name: string | null; role: string | null; created_at: string }> = [];

      if (listErr || !allUsers || (allUsers as any[]).length === 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, display_name, role, email').order('display_name');
        rows = (profiles || []).map((p: any) => ({ id: p.id, email: p.email, display_name: p.display_name, role: p.role, created_at: '' }));
      } else {
        rows = allUsers as typeof rows;
      }

      const ids = rows.map(r => r.id);
      if (ids.length > 0) {
        await supabase.from('user_permissions').upsert(ids.map(id => ({ user_id: id })), { onConflict: 'user_id' });
      }

      const { data: permsList } = await supabase
        .from('user_permissions')
        .select('*')
        .in('user_id', ids);

      const permMap = new Map<string, PermRow>(((permsList as PermRow[] | null) || []).map(p => [p.user_id, p]));

      setUsers(rows.map(r => ({
        id: r.id,
        email: r.email || `user_${r.id.slice(0, 8)}@sistema.local`,
        created_at: r.created_at || '',
        profile: { display_name: r.display_name, role: (r.role as UserRole) || 'viewer', organization_id: null },
        permissions: normalizePerms(permMap.get(r.id)),
      })));
    } catch (e) {
      console.error('fetchUsers error:', e);
      toast({ title: 'Erro', description: 'Não foi possível carregar os usuários.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [getDefaultPermissions, toast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    if (SINGLE_TENANT) return;
    supabase.from('role_requests').select('id, user_id, requested_roles, status, created_at').eq('status', 'pending').order('created_at').then(({ data }) => {
      if (data) setRoleRequests(data as RoleRequest[]);
    });
  }, []);

  // ── Filtered lists ──────────────────────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return q ? users.filter(u => (u.profile?.display_name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : users;
  }, [users, searchQuery]);

  const filteredGroups = useMemo(() => {
    if (!permSearch) return PERMISSION_GROUPS;
    const q = permSearch.toLowerCase();
    return PERMISSION_GROUPS.map(g => ({
      ...g,
      items: g.items.filter(i => i.label.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q)),
    })).filter(g => g.items.length > 0);
  }, [permSearch]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (SINGLE_TENANT) { toast({ title: 'Papel fixo', description: 'No modo single-tenant o papel é Master.' }); return; }
    if (!(role === 'master' || role === 'admin')) {
      toast({ title: 'Acesso negado', variant: 'destructive' }); return;
    }
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    if (error) { toast({ title: 'Erro ao alterar papel', description: error.message, variant: 'destructive' }); return; }
    const defaults = getDefaultPermissions(newRole as UserRole);
    await supabase.from('user_permissions').upsert({ user_id: userId, ...defaults }, { onConflict: 'user_id' });
    setUsers(prev => prev.map(u => u.id === userId ? {
      ...u,
      profile: { ...(u.profile ?? { display_name: null, organization_id: null, role: 'viewer' as UserRole }), role: newRole as UserRole },
      permissions: defaults,
    } : u));
    toast({ title: 'Papel atualizado' });
  };

  const handlePermissionChange = async (userId: string, perm: string, value: boolean) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, permissions: { ...u.permissions, [perm]: value } } : u));
    if (SINGLE_TENANT) return;
    if (role !== 'master') { toast({ title: 'Acesso negado', variant: 'destructive' }); return; }
    const { error } = await supabase.from('user_permissions').upsert({ user_id: userId, [perm]: value }, { onConflict: 'user_id' });
    if (error) toast({ title: 'Erro ao salvar permissão', description: error.message, variant: 'destructive' });
    else toast({ title: 'Permissão salva' });
  };

  const handleInviteUser = async () => {
    if (!inviteEmail || !inviteEmail.includes('@')) {
      toast({ title: 'Email inválido', variant: 'destructive' }); return;
    }
    if (role !== 'master') { toast({ title: 'Acesso negado', variant: 'destructive' }); return; }
    setInviteLoading(true);
    try {
      const orgId = users.find(u => u.id === currentUser?.id)?.profile?.organization_id || null;
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email: inviteEmail, role: inviteRole, organization_id: orgId },
      });
      if (error) { toast({ title: 'Falha ao enviar convite', description: (error as any)?.message || 'Erro desconhecido.', variant: 'destructive' }); return; }
      const d = data as Record<string, unknown> | null;
      if (d?.email_sent_via === 'password_reset') {
        toast({ title: 'E-mail enviado', description: 'Usuário já existia — enviamos um e-mail de recuperação.' });
      } else if (d?.success) {
        toast({ title: 'Convite enviado', description: `Convite enviado para ${inviteEmail}.` });
      } else {
        toast({ title: 'Aviso', description: 'Resposta inesperada do servidor.', variant: 'destructive' });
      }
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('viewer');
      await fetchUsers();
    } catch (e: unknown) {
      toast({ title: 'Erro', description: e instanceof Error ? e.message : 'Não foi possível enviar.', variant: 'destructive' });
    } finally {
      setInviteLoading(false);
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const { error } = await supabase.functions.invoke('delete-user', { body: { user_id: deleteTarget.id } });
      if (error) { toast({ title: 'Erro ao remover', description: (error as any)?.message, variant: 'destructive' }); return; }
      toast({ title: 'Usuário removido' });
      await fetchUsers();
    } catch (e: unknown) {
      toast({ title: 'Erro', description: e instanceof Error ? e.message : 'Não foi possível remover.', variant: 'destructive' });
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  };

  const handleSyncProfiles = async () => {
    if (!(role === 'master' || role === 'admin')) return;
    setSyncingProfiles(true);
    const { error } = await supabase.rpc('sync_profiles_from_auth');
    setSyncingProfiles(false);
    if (error) { toast({ title: 'Erro ao sincronizar', description: error.message, variant: 'destructive' }); return; }
    await fetchUsers();
    toast({ title: 'Perfis sincronizados' });
  };

  const approveRequest = async (req: RoleRequest) => {
    setAssigning(req.id);
    await supabase.from('role_requests').update({ status: 'approved' }).eq('id', req.id);
    setRoleRequests(prev => prev.filter(r => r.id !== req.id));
    setAssigning(null);
  };

  const rejectRequest = async (req: RoleRequest) => {
    setAssigning(req.id);
    await supabase.from('role_requests').update({ status: 'rejected' }).eq('id', req.id);
    setRoleRequests(prev => prev.filter(r => r.id !== req.id));
    setAssigning(null);
  };

  const canManage = () => role === 'master' || role === 'admin';

  // ── Loading guard ────────────────────────────────────────────────────────────

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Carregando usuários...</span>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Users className="h-6 w-6 text-brand" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Gerenciamento de Usuários</h1>
              <p className="text-sm text-muted-foreground">Gerencie usuários, papéis e permissões do sistema</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {SINGLE_TENANT && (
              <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded px-2 py-1 font-mono">
                single-tenant
              </span>
            )}
            {!SINGLE_TENANT && canManage() && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleSyncProfiles} disabled={syncingProfiles}>
                      {syncingProfiles ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Sincronizar perfis</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {!SINGLE_TENANT && isMaster() && (
              <Button size="sm" onClick={() => setInviteOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                Convidar Usuário
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="users">
        <div className="flex items-center justify-between gap-4">
          <TabsList>
            <TabsTrigger value="users">Usuários</TabsTrigger>
            <TabsTrigger value="requests">
              Solicitações
              {roleRequests.length > 0 && (
                <span className="ml-1.5 bg-brand/20 text-brand text-xs rounded-full px-1.5 py-0.5">{roleRequests.length}</span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Busca */}
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar usuário..."
              className="pl-8 h-8 text-sm"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* ── Tab: Usuários ── */}
        <TabsContent value="users" className="mt-4">
          {filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              {searchQuery ? 'Nenhum usuário encontrado para a busca.' : 'Nenhum usuário cadastrado.'}
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[1fr_160px_auto] items-center px-4 py-2.5 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <div>Usuário</div>
                <div>Papel</div>
                <div className="w-20 text-right">Ações</div>
              </div>

              {/* Rows */}
              <div className="divide-y divide-border">
                {filteredUsers.map(u => {
                  const userRole = u.profile?.role || 'viewer';
                  const isExpanded = expandedUser === u.id;

                  return (
                    <React.Fragment key={u.id}>
                      {/* Row */}
                      <div
                        className="grid grid-cols-[1fr_160px_auto] items-center px-4 py-3 hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => setExpandedUser(prev => prev === u.id ? null : u.id)}
                      >
                        {/* User info */}
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">
                            {u.profile?.display_name || 'Usuário'}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                        </div>

                        {/* Role */}
                        <div onClick={e => e.stopPropagation()}>
                          {canManage() ? (
                            <Select value={userRole} onValueChange={v => handleRoleChange(u.id, v)}>
                              <SelectTrigger className={`h-7 text-xs border px-2 ${ROLE_COLORS[userRole]}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {userRole === 'master' && <SelectItem value="master">Master</SelectItem>}
                                <SelectItem value="admin">Administrador</SelectItem>
                                <SelectItem value="manager">Gerente</SelectItem>
                                <SelectItem value="tester">Testador</SelectItem>
                                <SelectItem value="viewer">Visualizador</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded border ${ROLE_COLORS[userRole]}`}>
                              {ROLE_LABELS[userRole]}
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpandedUser(prev => prev === u.id ? null : u.id)}>
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </Button>
                          {isMaster() && userRole !== 'master' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeleteTarget(u)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Expanded permissions panel */}
                      {isExpanded && (
                        <div className="px-4 py-4 bg-muted/10 border-t border-border space-y-4">
                          <div className="flex items-center gap-2 justify-between">
                            <div className="flex items-center gap-1.5 text-sm font-medium">
                              <Shield className="h-4 w-4 text-muted-foreground" />
                              Permissões de {u.profile?.display_name || u.email}
                            </div>
                            {/* Busca de permissão */}
                            <div className="relative w-56">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                              <Input
                                placeholder="Buscar permissão..."
                                className="pl-7 h-7 text-xs"
                                value={permSearch}
                                onChange={e => setPermSearch(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {filteredGroups.map(group => (
                              <div key={group.key} className="border border-border rounded-md overflow-hidden">
                                <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                                  <group.icon className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group.label}</span>
                                </div>
                                <div className="divide-y divide-border">
                                  {group.items.map(item => {
                                    const checked = !!(u.permissions as Record<string, unknown>)?.[item.key];
                                    const disabled = !canManage();
                                    return (
                                      <div key={item.key} className="flex items-center justify-between px-3 py-2.5 gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <item.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                          <div className="min-w-0">
                                            <div className="text-xs font-medium leading-none">{item.label}</div>
                                            <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{item.desc}</div>
                                          </div>
                                        </div>
                                        <Switch
                                          checked={checked}
                                          onCheckedChange={v => handlePermissionChange(u.id, item.key, v)}
                                          disabled={disabled}
                                          className="shrink-0"
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Solicitações ── */}
        <TabsContent value="requests" className="mt-4">
          {SINGLE_TENANT ? (
            <div className="border border-border rounded-lg p-6 text-sm text-muted-foreground text-center">
              Solicitações desativadas no modo single-tenant.{' '}
              <span className="text-brand">
                Defina <code className="font-mono">VITE_SINGLE_TENANT=false</code> no <code className="font-mono">.env.local</code> para ativar.
              </span>
            </div>
          ) : roleRequests.length === 0 ? (
            <div className="border border-border rounded-lg p-6 text-sm text-muted-foreground text-center">
              Nenhuma solicitação pendente.
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1fr_1fr_auto] items-center px-4 py-2.5 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <div>Usuário</div>
                <div>Papéis solicitados</div>
                <div>Ações</div>
              </div>
              <div className="divide-y divide-border">
                {roleRequests.map(r => {
                  const reqUser = users.find(u => u.id === r.user_id);
                  return (
                    <div key={r.id} className="grid grid-cols-[1fr_1fr_auto] items-center px-4 py-3 gap-4">
                      <div>
                        <div className="text-sm font-medium">{reqUser?.profile?.display_name || reqUser?.email || r.user_id}</div>
                        <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString('pt-BR')}</div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {r.requested_roles.map(rr => (
                          <span key={rr} className="text-xs bg-muted text-muted-foreground border border-border rounded px-1.5 py-0.5 capitalize">{rr}</span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={assigning === r.id} onClick={() => approveRequest(r)}>
                          <Check className="h-3.5 w-3.5 mr-1" /> Aprovar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" disabled={assigning === r.id} onClick={() => rejectRequest(r)}>
                          <XIcon className="h-3.5 w-3.5 mr-1" /> Rejeitar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Modal Convidar ── */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Convidar Usuário</DialogTitle>
            <DialogDescription>Um e-mail de convite será enviado para o endereço informado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email" className="text-sm">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="invite-email"
                  name="invite-email"
                  placeholder="email@exemplo.com"
                  className="pl-9"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role" className="text-sm">Papel inicial</Label>
              <Select value={inviteRole} onValueChange={v => setInviteRole(v as UserRole)}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="manager">Gerente</SelectItem>
                  <SelectItem value="tester">Testador</SelectItem>
                  <SelectItem value="viewer">Visualizador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={handleInviteUser} disabled={inviteLoading}>
              {inviteLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</> : 'Enviar Convite'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Modal Confirmar Remoção ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deleteTarget?.profile?.display_name || deleteTarget?.email}</strong>?
              Esta ação é irreversível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteUser} disabled={deleteLoading}>
              {deleteLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Removendo...</> : 'Remover'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UserManagement;
