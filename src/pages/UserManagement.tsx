import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions, UserRole } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { UserCog, Shield, Users, Loader2, Search, UserPlus, Trash2, ChevronDown, ChevronUp, Sparkles, FileText, ClipboardCheck, Play, BarChart3, Download, Eye, Home, Clock, Zap, Settings, CheckCircle, Crown, Check, X as XIcon, RefreshCcw } from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogTrigger
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { PermissionGuard } from '@/components/PermissionGuard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Single-tenant flag: when true, bypass remote permissions/profiles and operate locally as master
// Default to true if env is missing (safer default for uso particular)
const SINGLE_TENANT = String(import.meta.env?.VITE_SINGLE_TENANT ?? 'true') === 'true';

interface UserData extends User {
  profile?: {
    display_name: string | null;
    role: UserRole;
    organization_id: string | null;
  };
  permissions?: {
    can_manage_users: boolean;
    can_manage_projects: boolean;
    can_delete_projects: boolean;
    can_manage_plans: boolean;
    can_manage_cases: boolean;
    can_manage_executions: boolean;
    can_view_reports: boolean;
    can_use_ai: boolean;
    can_access_model_control: boolean;
    can_configure_ai_models: boolean;
    can_test_ai_connections: boolean;
    can_manage_ai_templates: boolean;
    can_select_ai_models: boolean;
  };
}

const roleLabels = {
  master: 'Master',
  admin: 'Administrador',
  manager: 'Gerente',
  tester: 'Testador',
  viewer: 'Visualizador'
};

const roleColors = {
  master: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-400/15 dark:text-purple-300 dark:ring-1 dark:ring-purple-400/25 dark:border-transparent',
  admin: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-400/15 dark:text-red-300 dark:ring-1 dark:ring-red-400/25 dark:border-transparent',
  manager: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-400/15 dark:text-blue-300 dark:ring-1 dark:ring-blue-400/25 dark:border-transparent',
  tester: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-400/15 dark:text-green-300 dark:ring-1 dark:ring-green-400/25 dark:border-transparent',
  viewer: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-slate-400/15 dark:text-slate-300 dark:ring-1 dark:ring-slate-400/25 dark:border-transparent'
};

type FunctionRole = 'desenvolvimento' | 'suporte' | 'gerencia' | 'supervisao' | 'visualizador';
type RoleRequest = {
  id: string;
  user_id: string;
  requested_roles: FunctionRole[];
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
};

// Tipos auxiliares para evitar 'any'
type ProfileRow = {
  id: string;
  display_name: string | null;
  role: string | null;
  email?: string | null;
  organization_id?: string | null;
};

type PermRow = {
  user_id: string;
  can_manage_users: boolean;
  can_manage_projects: boolean;
  can_delete_projects: boolean;
  can_manage_plans: boolean;
  can_manage_cases: boolean;
  can_manage_executions: boolean;
  can_view_reports: boolean;
  can_use_ai: boolean;
};

// Normaliza uma linha de permissões 'mínima' (vinda do banco) para o shape completo esperado na UI
const normalizePerms = (row?: PermRow): Required<NonNullable<UserData['permissions']>> => ({
  can_manage_users: !!row?.can_manage_users,
  can_manage_projects: !!row?.can_manage_projects,
  can_delete_projects: !!row?.can_delete_projects,
  can_manage_plans: row?.can_manage_plans ?? true,
  can_manage_cases: row?.can_manage_cases ?? true,
  can_manage_executions: row?.can_manage_executions ?? true,
  can_view_reports: row?.can_view_reports ?? true,
  can_use_ai: row?.can_use_ai ?? true,
  can_access_model_control: false,
  can_configure_ai_models: false,
  can_test_ai_connections: false,
  can_manage_ai_templates: false,
  can_select_ai_models: true,
});

export const UserManagement = () => {
  const { role, isMaster, updateUserToMaster, getDefaultPermissions } = usePermissions();
  const { user } = useAuth();
  const { toast } = useToast();
  const [hasError, setHasError] = useState(false);
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserData | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('viewer');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [fixingMaster, setFixingMaster] = useState(false);
  const [syncingProfiles, setSyncingProfiles] = useState(false);

  // Estado de solicitações
  const [roleRequests, setRoleRequests] = useState<RoleRequest[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, Set<FunctionRole>>>({});

  // Recovery link modal state
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);
  const [recoveryLinkType, setRecoveryLinkType] = useState<'recovery' | 'magiclink' | null>(null);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);

  // Helpers para o modal de link gerado (fora da interface)
  const handleCopyRecoveryLink = async () => {
    if (!recoveryLink) return;
    try {
      await navigator.clipboard.writeText(recoveryLink);
      toast({ title: 'Link copiado', description: 'O link foi copiado para a área de transferência.' });
    } catch {
      toast({ title: 'Falha ao copiar', description: 'Não foi possível copiar automaticamente. Selecione e copie manualmente.' });
    }
  };

  const handleOpenRecoveryLink = () => {
    if (recoveryLink) window.open(recoveryLink, '_blank', 'noopener,noreferrer');
  };

  // Sincronizar perfis a partir de auth.users (cria profiles e user_permissions ausentes)
  const handleSyncProfiles = async () => {
    if (SINGLE_TENANT) {
      toast({ title: 'Ação indisponível', description: 'Sincronização não é necessária no modo single-tenant.' });
      return;
    }
    if (!(role === 'master' || role === 'admin')) {
      toast({ title: 'Acesso negado', description: 'Apenas Master/Admin podem sincronizar perfis.', variant: 'destructive' });
      return;
    }
    try {
      setSyncingProfiles(true);
      const { error } = await supabase.rpc('sync_profiles_from_auth');
      if (error) {
        console.error('sync_profiles_from_auth error:', error);
        toast({ title: 'Falha ao sincronizar', description: error.message || 'Erro desconhecido.', variant: 'destructive' });
        return;
      }
      await fetchUsers();
      toast({ title: 'Perfis sincronizados', description: 'Perfis e permissões foram atualizados.' });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Não foi possível sincronizar perfis.';
      console.error(e);
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setSyncingProfiles(false);
    }
  };

  // Form state for editing user
  const [editForm, setEditForm] = useState({
    role: 'viewer' as UserRole,
    display_name: '',
    can_manage_users: false,
    can_manage_projects: false,
    can_delete_projects: false,
    can_manage_plans: false,
    can_manage_cases: false,
    can_manage_executions: false,
    can_view_reports: false,
    can_use_ai: false,
    can_access_model_control: false,
    can_configure_ai_models: false,
    can_test_ai_connections: false,
    can_manage_ai_templates: false,
    can_select_ai_models: false,
  });

  // Helper: constrói a lista de usuários a partir de profiles, com upsert e permissões em lote
  const buildUsersFromProfiles = useCallback(async (profiles: ProfileRow[]) => {
    try {
      const ids = profiles.map(p => p.id);
      if (ids.length > 0) {
        try {
          const upRows = ids.map(id => ({ user_id: id }));
          await supabase.from('user_permissions').upsert(upRows, { onConflict: 'user_id' });
        } catch (e) {
          console.warn('user_permissions batch upsert (profiles) warning:', e);
        }
      }

      const { data: permsList } = await supabase
        .from('user_permissions')
        .select('user_id, can_manage_users, can_manage_projects, can_delete_projects, can_manage_plans, can_manage_cases, can_manage_executions, can_view_reports, can_use_ai')
        .in('user_id', ids);
      const permMap = new Map<string, PermRow>((permsList as PermRow[] | null || []).map((p) => [p.user_id, p]));

      const usersWithDetails: UserData[] = profiles.map((p) => {
        const perms = normalizePerms(permMap.get(p.id));
        return {
          id: p.id,
          email: p.email || `user_${p.id.slice(0, 8)}@sistema.local`,
          app_metadata: {} as Record<string, unknown>,
          user_metadata: {} as Record<string, unknown>,
          aud: 'authenticated',
          created_at: new Date().toISOString() as string,
          profile: {
            display_name: p.display_name,
            role: (p.role as UserRole) || 'viewer',
            organization_id: p.organization_id || null
          },
          permissions: perms
        } as UserData;
      });

      setUsers(usersWithDetails);
    } catch (e) {
      console.error('buildUsersFromProfiles error:', e);
      setUsers([]);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);

      if (SINGLE_TENANT) {
        // No modo single-tenant, não buscamos no banco. Montamos um usuário local master.
        const { data: authData } = await supabase.auth.getUser();
        const current = authData?.user;
        if (current) {
          const masterPerms = getDefaultPermissions('master');
          const localUser: UserData = {
            id: current.id,
            email: current.email || `user_${current.id.slice(0, 8)}@sistema.local`,
            app_metadata: (current.app_metadata ?? {}) as Record<string, unknown>,
            user_metadata: (current.user_metadata ?? {}) as Record<string, unknown>,
            aud: 'authenticated',
            created_at: String(current.created_at),
            profile: {
              display_name: (
                typeof (current.user_metadata as Record<string, unknown> | null | undefined)?.full_name === 'string'
                  ? ((current.user_metadata as Record<string, unknown>).full_name as string)
                  : 'Master'
              ),
              role: 'master',
              organization_id: null
            },
            permissions: masterPerms
          };
          setUsers([localUser]);
        } else {
          setUsers([]);
        }
        return;
      }

      // Modo multi-tenant: listar DIRETAMENTE de auth.users via RPC, com left join em profiles
      const { data: allUsers, error: listErr } = await supabase.rpc('list_all_users');

      if (listErr) {
        console.error('Error listing all users via RPC:', listErr);
        // Fallback: buscar via profiles
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, display_name, role, email')
          .order('display_name');
        if (profilesError) {
          setUsers([]);
          toast({ title: 'Erro', description: 'Falha ao listar usuários.', variant: 'destructive' });
          return;
        }
        await buildUsersFromProfiles((profiles ?? []) as ProfileRow[]);
        return;
      }

      const rows = (allUsers || []) as Array<{ id: string; email: string | null; display_name: string | null; role: string | null; created_at: string }>;
      const ids = rows.map(r => r.id);

      // Fallback se não houver linhas (ex.: sem permissões ou função ausente)
      if (rows.length === 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, display_name, role, email')
          .order('display_name');
        if (profilesError) {
          setUsers([]);
          return;
        }
        await buildUsersFromProfiles((profiles ?? []) as ProfileRow[]);
        return;
      }

      // Garante que todas as linhas existam em user_permissions para evitar 406 (upsert em lote)
      if (ids.length > 0) {
        try {
          const upRows = ids.map((id) => ({ user_id: id }));
          await supabase.from('user_permissions').upsert(upRows, { onConflict: 'user_id' });
        } catch (e) {
          console.warn('user_permissions batch upsert warning:', e);
        }
      }

      // Carrega permissões em lote para evitar N+1
      const { data: permsList } = await supabase
        .from('user_permissions')
        .select('user_id, can_manage_users, can_manage_projects, can_delete_projects, can_manage_plans, can_manage_cases, can_manage_executions, can_view_reports, can_use_ai')
        .in('user_id', ids);

      const permMap = new Map<string, PermRow>(((permsList as PermRow[] | null) || []).map((p) => [p.user_id, p]));

      const usersWithDetails: UserData[] = rows.map((r) => {
        const perms = normalizePerms(permMap.get(r.id));
        return {
          id: r.id,
          email: r.email || `user_${r.id.slice(0, 8)}@sistema.local`,
          app_metadata: {} as Record<string, unknown>,
          user_metadata: {} as Record<string, unknown>,
          aud: 'authenticated',
          created_at: String(r.created_at),
          profile: {
            display_name: r.display_name,
            role: (r.role as UserRole) || 'viewer',
            organization_id: null
          },
          permissions: perms
        } as UserData;
      });

      setUsers(usersWithDetails);
    } catch (error: unknown) {
      console.error('Error fetching users:', error);
      setHasError(true);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os usuários. Funcionalidade limitada disponível.',
        variant: 'destructive'
      });
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [toast, getDefaultPermissions, buildUsersFromProfiles]);

  // Load users
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Carregar solicitações de cargo (multi-tenant)
  useEffect(() => {
    const loadRequests = async () => {
      if (SINGLE_TENANT) { setRoleRequests([]); return; }
      const { data, error } = await supabase
          .from('role_requests')
          .select('id, user_id, requested_roles, status, created_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: true });
      if (!error && data) {
        setRoleRequests((data as unknown as RoleRequest[]) || []);
        const init: Record<string, Set<FunctionRole>> = {};
        for (const r of data as RoleRequest[]) init[r.user_id] = new Set(r.requested_roles);
        setSelection(init);
      }
    };
    loadRequests();
  }, []);

  const handleEditUser = (user: UserData) => {
    setSelectedUser(user);
    setEditForm({
      role: user.profile?.role || 'tester',
      display_name: user.profile?.display_name || '',
      can_manage_users: user.permissions?.can_manage_users || false,
      can_manage_projects: user.permissions?.can_manage_projects || false,
      can_delete_projects: user.permissions?.can_delete_projects || false,
      can_manage_plans: user.permissions?.can_manage_plans || true,
      can_manage_cases: user.permissions?.can_manage_cases || true,
      can_manage_executions: user.permissions?.can_manage_executions || true,
      can_view_reports: user.permissions?.can_view_reports || true,
      can_use_ai: user.permissions?.can_use_ai || true,
      can_access_model_control: user.permissions?.can_access_model_control || false,
      can_configure_ai_models: user.permissions?.can_configure_ai_models || false,
      can_test_ai_connections: user.permissions?.can_test_ai_connections || false,
      can_manage_ai_templates: user.permissions?.can_manage_ai_templates || false,
      can_select_ai_models: user.permissions?.can_select_ai_models || true,
    });
    setIsEditModalOpen(true);
  };

  // Restaurar usuário atual como master (local)
  const handleFixUserToMaster = async () => {
    try {
      setFixingMaster(true);
      if (!user?.id) {
        toast({ title: 'Usuário não autenticado', variant: 'destructive' });
        return;
      }
      await updateUserToMaster(user.id);
      toast({ title: 'Permissões atualizadas', description: 'Seu usuário foi restaurado como Master.' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Falha ao restaurar Master', variant: 'destructive' });
    } finally {
      setFixingMaster(false);
    }
  };

  // Envio de convite (desabilitado no single-tenant)
  const handleInviteUser = async () => {
    if (SINGLE_TENANT) {
      toast({ title: 'Convites desabilitados', description: 'Modo single-tenant: convites estão desativados.' });
      return;
    }
    if (role !== 'master') {
      toast({ title: 'Acesso negado', description: 'Apenas usuários Master podem convidar.', variant: 'destructive' });
      return;
    }
    if (!inviteEmail || !inviteEmail.includes('@')) {
      toast({ title: 'Email inválido', description: 'Informe um email válido.', variant: 'destructive' });
      return;
    }
    try {
      setInviteLoading(true);
      const orgId = users.find(u => u.id === user?.id)?.profile?.organization_id || null;
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email: inviteEmail, role: inviteRole, organization_id: orgId },
        headers: { 'X-Debug': import.meta.env.DEV ? '1' : '0' }
      });
      if (error) {
        console.error('invite-user error:', error);
        toast({ title: 'Falha ao enviar convite', description: (error as { message?: string })?.message || 'Erro desconhecido.', variant: 'destructive' });
        return;
      }
      if ((data as { email_sent_via?: string } | null)?.email_sent_via === 'password_reset') {
        // Email enviado para usuário já existente
        toast({ title: 'E-mail enviado', description: 'Usuário já existia. Enviamos um e-mail de recuperação de senha.' });
      } else if ((data as { success?: boolean } | null)?.success) {
        // Convite padrão enviado por e-mail
        toast({ title: 'Convite enviado', description: 'Usuário convidado com sucesso (papel inicial viewer).' });
      } else if ((data as { recovery_link?: string } | null)?.recovery_link) {
        // Não exibir links na UI por segurança; orientar ajuste de configuração
        console.warn('invite-user fallback link (não exibido). Ajuste Auth → URL Configuration (site_url e Redirect URLs).');
        toast({ title: 'Ação necessária', description: 'Atualize Auth → URL Configuration (site_url e Redirect URLs) para permitir envio de e-mails. Não exibimos links na tela.', variant: 'destructive' });
      } else if ((data as { success?: boolean; error?: string; debug_info?: unknown } | null)?.success === false) {
        // Modo debug da Edge Function retornou sucesso=false com detalhes
        console.error('invite-user debug_info:', (data as { debug_info?: unknown } | null)?.debug_info);
        toast({ title: 'Falha ao enviar convite', description: (data as { error?: string } | null)?.error || 'Erro desconhecido.', variant: 'destructive' });
      } else {
        toast({ title: 'Aviso', description: 'Resposta inesperada do servidor. Verifique os logs.', variant: 'destructive' });
      }
      setIsInviteModalOpen(false);
      setInviteEmail('');
      setInviteRole('viewer');
      await fetchUsers();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Não foi possível enviar o convite.';
      console.error(e);
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setInviteLoading(false);
    }
  };

  // Pode gerenciar conforme papel atual
  const canManageUser = (targetRole: string) => {
    // Em single-tenant, Master sempre pode
    if (SINGLE_TENANT) return true;
    // Política revisada: MASTER e ADMIN podem alterar papéis
    return role === 'master' || role === 'admin';
  };

  // === Utilitários da aba Solicitações (definidos antes do JSX) ===
  const toggleRole = (userId: string, r: FunctionRole) => {
    setSelection(prev => {
      const next = { ...prev };
      const set = new Set(next[userId] || []);
      if (set.has(r)) set.delete(r); else set.add(r);
      next[userId] = set;
      return next;
    });
  };

  const approveRequest = async (req: RoleRequest) => {
    if (SINGLE_TENANT) return;
    try {
      setAssigning(req.id);
      const roles = Array.from(selection[req.user_id] || new Set<FunctionRole>());
      if (roles.length === 0) return;
      const rows = roles.map(role => ({ user_id: req.user_id, role }));
      const { error: upErr } = await supabase.from('profile_function_roles').upsert(rows, { onConflict: 'user_id,role' });
      if (upErr) throw upErr;
      const { error: stErr } = await supabase.from('role_requests').update({ status: 'approved' }).eq('id', req.id);
      if (stErr) throw stErr;
      setRoleRequests(prev => prev.filter(r => r.id !== req.id));
    } finally {
      setAssigning(null);
    }
  };

  const rejectRequest = async (req: RoleRequest) => {
    if (SINGLE_TENANT) return;
    try {
      setAssigning(req.id);
      const { error } = await supabase.from('role_requests').update({ status: 'rejected' }).eq('id', req.id);
      if (error) throw error;
      setRoleRequests(prev => prev.filter(r => r.id !== req.id));
    } finally {
      setAssigning(null);
    }
  };

  // Expand/collapse
  const toggleUserExpand = (id: string) => {
    setExpandedUser(prev => (prev === id ? null : id));
  };

  // Alterar papel de usuário
  const handleRoleChange = async (id: string, newRole: string) => {
    if (SINGLE_TENANT) {
      if (newRole !== 'master') {
        toast({ title: 'Papel fixo', description: 'No modo single-tenant o papel é sempre Master.' });
      }
      // Mantém como master no estado local
      setUsers(prev => prev.map(u => (u.id === id ? {
        ...u,
        profile: { display_name: u.profile?.display_name || '', role: 'master' as UserRole, organization_id: u.profile?.organization_id || null },
        permissions: getDefaultPermissions('master')
      } : u)) as UserData[]);
      return;
    }
    // Multi-tenant: MASTER e ADMIN podem alterar
    if (!(role === 'master' || role === 'admin')) {
      toast({ title: 'Acesso negado', description: 'Apenas usuários Master ou Admin podem alterar papéis.' , variant: 'destructive'});
      return;
    }
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', id);
      if (error) {
        console.error('profiles update role error:', error);
        toast({ title: 'Falha ao alterar papel', description: error.message || 'Erro desconhecido.', variant: 'destructive' });
        return;
      }
      // Sincroniza permissões padrão do novo papel
      try {
        const defaults = getDefaultPermissions(newRole as UserRole);
        await supabase
          .from('user_permissions')
          .upsert({ user_id: id, ...defaults }, { onConflict: 'user_id' });
      } catch (e) {
        console.warn('Não foi possível sincronizar permissões padrão para o papel', newRole, e);
      }
      // Atualiza estado local
      setUsers(prev => prev.map(u => (u.id === id ? {
        ...u,
        profile: { ...(u.profile ?? { display_name: '', organization_id: null, role: 'viewer' as UserRole }), role: newRole as UserRole }
      } : u)));
      toast({ title: 'Papel atualizado', description: 'O papel do usuário foi atualizado com sucesso.' });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Não foi possível alterar o papel.';
      console.error(e);
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    }
  };

  // Alterar permissão de usuário
  const handlePermissionChange = async (id: string, permission: string, value: boolean) => {
    if (SINGLE_TENANT) {
      setUsers(prev => prev.map(u => (u.id === id ? {
        ...u,
        permissions: { ...u.permissions, [permission]: value } as UserData['permissions']
      } : u)));
      if (selectedUser?.id === id) {
        setEditForm(prev => ({ ...prev, [permission]: value }));
      }
      return;
    }
    // Multi-tenant: apenas master pode alterar
    if (role !== 'master') {
      toast({ title: 'Acesso negado', description: 'Apenas usuários Master podem alterar permissões.' , variant: 'destructive'});
      return;
    }
    try {
      // Atualiza somente a coluna alterada na tabela user_permissions
      const body: Record<string, unknown> & { user_id: string } = { user_id: id, [permission]: value };
      const { error: upErr } = await supabase
        .from('user_permissions')
        .upsert(body, { onConflict: 'user_id' });
      if (upErr) {
        console.error('user_permissions upsert error:', upErr);
        toast({ title: 'Falha ao alterar permissão', description: upErr.message || 'Erro desconhecido.', variant: 'destructive' });
        return;
      }
      // Atualiza estado local
      setUsers(prev => prev.map(u => (u.id === id ? {
        ...u,
        permissions: { ...u.permissions, [permission]: value } as UserData['permissions']
      } : u)));
      if (selectedUser?.id === id) {
        setEditForm(prev => ({ ...prev, [permission]: value }));
      }
      toast({ title: 'Permissão atualizada', description: 'As permissões do usuário foram atualizadas.' });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Não foi possível alterar a permissão.';
      console.error(e);
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    }
  };

  // Abrir modal de deleção
  const handleDeleteUser = (user: UserData) => {
    setUserToDelete(user);
    setIsDeleteModalOpen(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    if (SINGLE_TENANT) {
      toast({ title: 'Ação desabilitada', description: 'Não é possível remover usuários no modo single-tenant.' });
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
      return;
    }
    // Multi-tenant: apenas Master e via Edge Function
    if (role !== 'master') {
      toast({ title: 'Acesso negado', description: 'Apenas usuários Master podem remover usuários.', variant: 'destructive' });
      return;
    }
    try {
      setDeleteLoading(true);
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { user_id: userToDelete.id }
      });
      if (error) {
        console.error('delete-user error:', error);
        toast({ title: 'Falha ao remover usuário', description: (error as { message?: string })?.message || 'Erro desconhecido.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Usuário removido', description: 'O usuário foi removido com sucesso.' });
      await fetchUsers();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Não foi possível remover o usuário.';
      console.error(e);
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setDeleteLoading(false);
      setIsDeleteModalOpen(false);
      setUserToDelete(null);
    }
  };

  // Lista filtrada por busca
  const filteredUsers = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.email || '').toLowerCase().includes(q) ||
      (u.profile?.display_name || '').toLowerCase().includes(q)
    );
  }, [users, searchQuery]);

  // Se ocorreu erro ao carregar usuários, mostra mensagem amigável
  if (hasError) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Erro no Sistema</h2>
          <p className="mb-4">Houve um problema ao carregar o gerenciamento de usuários.</p>
          <Button onClick={() => window.location.reload()}>
            Recarregar Página
          </Button>
        </div>
      </div>
    );
  }

  // Se ainda está carregando as permissões, mostra loading
  if (!role) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Verificando permissões...</span>
        </div>
      </div>
    );
  }

  // Se não tem permissão, redireciona
  if (role !== 'master' && role !== 'admin') {
    return (
      <PermissionGuard requiredPermission="can_manage_users">
        <div className="container mx-auto py-6">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">Acesso Restrito</h2>
            <p>Você precisa de permissão para acessar esta página</p>
          </div>
        </div>
      </PermissionGuard>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-8 w-8" />
            Gerenciamento de Usuários
          </h1>
          <p className="text-muted-foreground">
            Gerencie os usuários do sistema e suas permissões
          </p>
        </div>

        <div className="flex gap-2">
          {/* Sincronizar perfis (ícone + tooltip) */}
          {!SINGLE_TENANT && (role === 'master' || role === 'admin') && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleSyncProfiles}
                    disabled={syncingProfiles}
                    className="text-emerald-600 hover:text-emerald-700"
                  >
                    {syncingProfiles ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Sincronizar Perfis
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {/* Botão para corrigir usuário master (apenas em SINGLE_TENANT) */}
          {SINGLE_TENANT && role !== 'master' && (
            <Button 
              variant="outline" 
              onClick={handleFixUserToMaster}
              disabled={fixingMaster}
              className="border-purple-200 text-purple-700 hover:bg-purple-50"
            >
              {fixingMaster ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Corrigindo...
                </>
              ) : (
                <>
                  <Crown className="h-4 w-4 mr-2" />
                  Restaurar Master
                </>
              )}
            </Button>
          )}

          {/* Convite de usuário: apenas para Master e fora do SINGLE_TENANT */}
          {!SINGLE_TENANT && role === 'master' && (
          <Dialog open={isInviteModalOpen} onOpenChange={setIsInviteModalOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="h-4 w-4 mr-2" />
                Convidar Usuário
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Convidar Novo Usuário</DialogTitle>
                <DialogDescription>
                  Envie um convite para um novo usuário se juntar ao sistema
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    placeholder="email@exemplo.com" 
                    value={inviteEmail} 
                    onChange={(e) => setInviteEmail(e.target.value)} 
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Nível de Acesso</Label>
                  <Select value={inviteRole} onValueChange={(value: UserRole) => setInviteRole(value)}>
                    <SelectTrigger id="role">
                      <SelectValue placeholder="Selecione o nível" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Master pode convidar já como admin; outros papéis não veem essa opção */}
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="manager">Gerente</SelectItem>
                      <SelectItem value="tester">Testador</SelectItem>
                      <SelectItem value="viewer">Visualizador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  className="w-full" 
                  onClick={handleInviteUser}
                  disabled={inviteLoading}
                >
                  {inviteLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    'Enviar Convite'
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">Todos os Usuários</TabsTrigger>
          <TabsTrigger value="requests">Solicitações</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="p-0">
          <UserTable 
            users={filteredUsers} 
            loading={loading} 
            expandedUser={expandedUser}
            canManageUser={canManageUser}
            toggleUserExpand={toggleUserExpand}
            handleRoleChange={handleRoleChange}
            handlePermissionChange={handlePermissionChange}
            handleDeleteUser={handleDeleteUser}
            isMaster={isMaster()}
          />
        </TabsContent>

        <TabsContent value="requests" className="p-0">
          {SINGLE_TENANT ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">Solicitações desativadas no modo single-tenant.</CardContent>
            </Card>
          ) : roleRequests.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">Sem solicitações pendentes</CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Solicitado</TableHead>
                      <TableHead>Selecionar cargos</TableHead>
                      <TableHead className="w-[160px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roleRequests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{users.find(u => u.id === r.user_id)?.profile?.display_name || users.find(u => u.id === r.user_id)?.email || r.user_id}</TableCell>
                        <TableCell>{r.requested_roles.join(', ')}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2 text-xs">
                            {(['desenvolvimento','suporte','gerencia','supervisao','visualizador'] as FunctionRole[]).map((fr) => (
                              <label key={fr} className="inline-flex items-center gap-1 border rounded px-2 py-1">
                                <input
                                  type="checkbox"
                                  checked={!!selection[r.user_id]?.has(fr)}
                                  onChange={() => toggleRole(r.user_id, fr)}
                                />
                                <span className="capitalize">{fr}</span>
                              </label>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => approveRequest(r)} disabled={assigning === r.id}>
                              <Check className="h-4 w-4 mr-1" /> Aprovar
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => rejectRequest(r)} disabled={assigning === r.id}>
                              <XIcon className="h-4 w-4 mr-1" /> Rejeitar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Modal de link de recuperação/magic link */}
      <Dialog open={isRecoveryModalOpen} onOpenChange={setIsRecoveryModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link de acesso gerado ({recoveryLinkType === 'magiclink' ? 'Magic Link' : 'Recuperação'})</DialogTitle>
            <DialogDescription>
              O Supabase não envia e-mail para este link de fallback. Copie e compartilhe com o usuário.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>URL</Label>
            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded break-all text-sm">
              {recoveryLink}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCopyRecoveryLink}>Copiar</Button>
              <Button variant="outline" onClick={handleOpenRecoveryLink}>Abrir</Button>
            </div>
          </div>
          {/* Removido botão 'Fechar' redundante (já existe X no cabeçalho) */}
        </DialogContent>
      </Dialog>

      {/* Modal de confirmação para deleção de usuário */}
      <AlertDialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Remoção de Usuário</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Você tem certeza que deseja remover o usuário:</p>
              <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
                <p className="font-medium">{userToDelete?.profile?.display_name || 'Usuário'}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{userToDelete?.email}</p>
                <p className="text-sm text-red-600 dark:text-red-400">
                  Nível: {userToDelete?.profile?.role ? roleLabels[userToDelete.profile.role] : 'Não definido'}
                </p>
              </div>
              <p className="text-red-600 dark:text-red-400 font-medium">
                Esta ação é irreversível e removerá permanentemente:
              </p>
              <ul className="text-sm text-red-600 dark:text-red-400 space-y-1 ml-4">
                <li>• O acesso do usuário ao sistema</li>
                <li>• Todas as permissões e configurações</li>
                <li>• Dados do perfil do usuário</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteUser}
              disabled={deleteLoading}
            >
              {deleteLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removendo...
                </>
              ) : (
                'Remover'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const UserTable = ({ 
  users, 
  loading, 
  expandedUser, 
  canManageUser,
  toggleUserExpand, 
  handleRoleChange, 
  handlePermissionChange,
  handleDeleteUser,
  isMaster
}: { 
  users: UserData[], 
  loading: boolean, 
  expandedUser: string | null,
  canManageUser: (role: string) => boolean,
  toggleUserExpand: (id: string) => void, 
  handleRoleChange: (id: string, role: string) => void, 
  handlePermissionChange: (id: string, permission: string, value: boolean) => void,
  handleDeleteUser: (user: UserData) => void,
  isMaster: boolean
}) => {
  
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Carregando usuários...</div>
        </CardContent>
      </Card>
    );
  }
  
  if (users.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">Nenhum usuário encontrado</div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Nível de Acesso</TableHead>
              <TableHead>Permissões</TableHead>
              <TableHead className="w-[100px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.reduce<React.ReactNode[]>((acc, user) => {
              acc.push(
                
                <TableRow key={user.id}>
                  <TableCell className="align-middle">
                    <div className="min-w-0">
                      <div className="font-medium text-left">{user.profile?.display_name || 'Usuário'}</div>
                      <div className="text-sm text-muted-foreground text-left truncate">{user.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {canManageUser(user.profile?.role || 'tester') ? (
                      <Select 
                        value={user.profile?.role || 'tester'} 
                        onValueChange={(value) => handleRoleChange(user.id, value)}
                      >
                        <SelectTrigger className={`w-[180px] ${roleColors[user.profile?.role || 'tester']} border`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {user.profile?.role === 'master' && (
                            <SelectItem value="master">Master</SelectItem>
                          )}
                          <SelectItem value="admin">Administrador</SelectItem>
                          <SelectItem value="manager">Gerente</SelectItem>
                          <SelectItem value="tester">Testador</SelectItem>
                          <SelectItem value="viewer">Visualizador</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className={`px-3 py-1 rounded text-sm font-medium inline-block ${roleColors[user.profile?.role || 'tester']}`}>
                        {roleLabels[user.profile?.role || 'tester']}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {user.permissions?.can_manage_users && (
                        <div className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded dark:bg-blue-400/15 dark:text-blue-300 dark:ring-1 dark:ring-blue-400/25">
                          Gerenciar Usuários
                        </div>
                      )}
                      {user.permissions?.can_manage_plans && (
                        <div className="bg-emerald-100 text-emerald-800 text-xs px-2 py-1 rounded dark:bg-emerald-400/15 dark:text-emerald-300 dark:ring-1 dark:ring-emerald-400/25">
                          Planos
                        </div>
                      )}
                      {user.permissions?.can_use_ai && (
                        <div className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded dark:bg-purple-400/15 dark:text-purple-300 dark:ring-1 dark:ring-purple-400/25">
                          IA
                        </div>
                      )}
                      {user.permissions?.can_view_reports && (
                        <div className="bg-amber-100 text-amber-800 text-xs px-2 py-1 rounded dark:bg-amber-400/15 dark:text-amber-300 dark:ring-1 dark:ring-amber-400/25">
                          Relatórios
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => toggleUserExpand(user.id)}
                      >
                        {expandedUser === user.id ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                      
                      {/* Botão de apagar disponível apenas para usuários master */}
                      {isMaster && user.profile?.role !== 'master' && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDeleteUser(user)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          title="Remover usuário (apenas Master)"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
              if (expandedUser === user.id) {
                acc.push(
                  <TableRow key={user.id + '-expanded'}>
                    <TableCell colSpan={4} className="bg-gray-50 dark:bg-gray-900/20">
                      <div className="p-4 space-y-6">
                        <h4 className="font-medium flex items-center gap-2">
                          <Shield className="h-4 w-4" />
                          Permissões do Usuário
                        </h4>
                        
                        <div className="space-y-4">
                          {/* Seção: Administração do Sistema */}
                          <div className="border rounded-lg">
                            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 rounded-t-lg">
                              <h5 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                <Shield className="h-4 w-4 text-blue-500" />
                                Administração do Sistema
                              </h5>
                            </div>
                            <div className="p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <UserCog className="h-4 w-4 text-blue-500" />
                                  <Label>Gerenciar Usuários</Label>
                                </div>
                                <Switch 
                                  checked={user.permissions?.can_manage_users}
                                  onCheckedChange={(checked) => handlePermissionChange(user.id, 'can_manage_users', checked)}
                                  disabled={!canManageUser(user.profile?.role || 'tester')}
                                />
                              </div>

                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Settings className="h-4 w-4 text-emerald-500" />
                                  <Label>Gerenciar Projetos</Label>
                                </div>
                                <Switch
                                  checked={Boolean(user.permissions?.can_manage_projects)}
                                  onCheckedChange={(checked) => handlePermissionChange(user.id, 'can_manage_projects', checked)}
                                  disabled={!canManageUser(user.profile?.role || 'tester')}
                                />
                              </div>

                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                  <Label>Excluir Projetos</Label>
                                </div>
                                <Switch
                                  checked={Boolean(user.permissions?.can_delete_projects)}
                                  onCheckedChange={(checked) => handlePermissionChange(user.id, 'can_delete_projects', checked)}
                                  disabled={!canManageUser(user.profile?.role || 'tester')}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Seção: Gerenciamento de Testes */}
                          <div className="border rounded-lg">
                            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 rounded-t-lg">
                              <h5 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                <ClipboardCheck className="h-4 w-4 text-green-500" />
                                Gerenciamento de Testes
                              </h5>
                            </div>
                            <div className="p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-emerald-500" />
                                  <Label>Gerenciar Planos de Teste</Label>
                                </div>
                                <Switch 
                                  checked={user.permissions?.can_manage_plans}
                                  onCheckedChange={(checked) => handlePermissionChange(user.id, 'can_manage_plans', checked)}
                                  disabled={!canManageUser(user.profile?.role || 'tester')}
                                />
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <ClipboardCheck className="h-4 w-4 text-green-500" />
                                  <Label>Gerenciar Casos de Teste</Label>
                                </div>
                                <Switch 
                                  checked={user.permissions?.can_manage_cases}
                                  onCheckedChange={(checked) => handlePermissionChange(user.id, 'can_manage_cases', checked)}
                                  disabled={!canManageUser(user.profile?.role || 'tester')}
                                />
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Play className="h-4 w-4 text-indigo-500" />
                                  <Label>Gerenciar Execuções de Teste</Label>
                                </div>
                                <Switch 
                                  checked={user.permissions?.can_manage_executions}
                                  onCheckedChange={(checked) => handlePermissionChange(user.id, 'can_manage_executions', checked)}
                                  disabled={!canManageUser(user.profile?.role || 'tester')}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Seção: Geração de Testes com IA */}
                          <div className="border rounded-lg">
                            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 rounded-t-lg">
                              <h5 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-purple-500" />
                                Geração de Testes com IA
                              </h5>
                            </div>
                            <div className="p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Sparkles className="h-4 w-4 text-purple-500" />
                                  <Label>Utilizar Gerador de IA</Label>
                                </div>
                                <Switch 
                                  checked={user.permissions?.can_use_ai}
                                  onCheckedChange={(checked) => handlePermissionChange(user.id, 'can_use_ai', checked)}
                                  disabled={!canManageUser(user.profile?.role || 'tester')}
                                />
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Zap className="h-4 w-4 text-blue-500" />
                                  <Label>Selecionar Modelos IA</Label>
                                </div>
                                <Switch 
                                  checked={user.permissions?.can_select_ai_models}
                                  onCheckedChange={(checked) => handlePermissionChange(user.id, 'can_select_ai_models', checked)}
                                  disabled={!canManageUser(user.profile?.role || 'tester')}
                                />
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-purple-400" />
                                  <Label>Gerar Planos com IA</Label>
                                </div>
                                <Switch 
                                  checked={user.permissions?.can_use_ai && user.permissions?.can_manage_plans}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      handlePermissionChange(user.id, 'can_use_ai', true);
                                      handlePermissionChange(user.id, 'can_manage_plans', true);
                                    }
                                  }}
                                  disabled={!canManageUser(user.profile?.role || 'tester')}
                                />
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <ClipboardCheck className="h-4 w-4 text-purple-400" />
                                  <Label>Gerar Casos com IA</Label>
                                </div>
                                <Switch 
                                  checked={user.permissions?.can_use_ai && user.permissions?.can_manage_cases}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      handlePermissionChange(user.id, 'can_use_ai', true);
                                      handlePermissionChange(user.id, 'can_manage_cases', true);
                                    }
                                  }}
                                  disabled={!canManageUser(user.profile?.role || 'tester')}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Seção: Model Control Panel */}
                          <div className="border rounded-lg">
                            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 rounded-t-lg">
                              <h5 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                <Settings className="h-4 w-4 text-orange-500" />
                                Model Control Panel
                              </h5>
                            </div>
                            <div className="p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Settings className="h-4 w-4 text-orange-500" />
                                  <Label>Acessar MCP</Label>
                                </div>
                                <Switch 
                                  checked={user.permissions?.can_access_model_control}
                                  onCheckedChange={(checked) => handlePermissionChange(user.id, 'can_access_model_control', checked)}
                                  disabled={!canManageUser(user.profile?.role || 'tester')}
                                />
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Zap className="h-4 w-4 text-orange-400" />
                                  <Label>Configurar Modelos</Label>
                                </div>
                                <Switch 
                                  checked={user.permissions?.can_configure_ai_models}
                                  onCheckedChange={(checked) => handlePermissionChange(user.id, 'can_configure_ai_models', checked)}
                                  disabled={!canManageUser(user.profile?.role || 'tester')}
                                />
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="h-4 w-4 text-orange-400" />
                                  <Label>Testar Conexões IA</Label>
                                </div>
                                <Switch 
                                  checked={user.permissions?.can_test_ai_connections}
                                  onCheckedChange={(checked) => handlePermissionChange(user.id, 'can_test_ai_connections', checked)}
                                  disabled={!canManageUser(user.profile?.role || 'tester')}
                                />
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-orange-400" />
                                  <Label>Gerenciar Templates</Label>
                                </div>
                                <Switch 
                                  checked={user.permissions?.can_manage_ai_templates}
                                  onCheckedChange={(checked) => handlePermissionChange(user.id, 'can_manage_ai_templates', checked)}
                                  disabled={!canManageUser(user.profile?.role || 'tester')}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Seção: Relatórios e Análises */}
                          <div className="border rounded-lg">
                            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 rounded-t-lg">
                              <h5 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                <BarChart3 className="h-4 w-4 text-amber-500" />
                                Relatórios e Análises
                              </h5>
                            </div>
                            <div className="p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <BarChart3 className="h-4 w-4 text-amber-500" />
                                  <Label>Visualizar Relatórios</Label>
                                </div>
                                <Switch 
                                  checked={user.permissions?.can_view_reports}
                                  onCheckedChange={(checked) => handlePermissionChange(user.id, 'can_view_reports', checked)}
                                  disabled={!canManageUser(user.profile?.role || 'tester')}
                                />
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Download className="h-4 w-4 text-teal-500" />
                                  <Label>Exportar Dados</Label>
                                </div>
                                <Switch 
                                  checked={user.permissions?.can_view_reports}
                                  onCheckedChange={(checked) => handlePermissionChange(user.id, 'can_view_reports', checked)}
                                  disabled={!canManageUser(user.profile?.role || 'tester')}
                                />
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Eye className="h-4 w-4 text-blue-400" />
                                  <Label>Relatórios Avançados</Label>
                                </div>
                                <Switch 
                                  checked={user.permissions?.can_view_reports && (user.profile?.role === 'admin' || user.profile?.role === 'master')}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      handlePermissionChange(user.id, 'can_view_reports', true);
                                    }
                                  }}
                                  disabled={!canManageUser(user.profile?.role || 'tester') || (user.profile?.role !== 'admin' && user.profile?.role !== 'master')}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Seção: Acesso Geral */}
                          <div className="border rounded-lg">
                            <div className="bg-gray-50 dark:bg-gray-800/50 px-4 py-3 rounded-t-lg">
                              <h5 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                <Home className="h-4 w-4 text-gray-500" />
                                Acesso Geral
                              </h5>
                            </div>
                            <div className="p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Home className="h-4 w-4 text-blue-500" />
                                  <Label>Acessar Dashboard</Label>
                                </div>
                                <Switch 
                                  checked={true}
                                  disabled={true}
                                />
                              </div>
                              
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Clock className="h-4 w-4 text-gray-500" />
                                  <Label>Visualizar Histórico</Label>
                                </div>
                                <Switch 
                                  checked={true}
                                  disabled={true}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {!canManageUser(user.profile?.role || 'tester') && (
                          <div className="text-sm text-muted-foreground mt-4">
                            Você não tem permissão para alterar as configurações deste usuário.
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              }
              return acc;
            }, [])}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}; 