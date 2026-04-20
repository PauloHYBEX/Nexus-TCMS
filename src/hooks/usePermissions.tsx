import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

// Single-tenant mode: when true, we bypass remote permissions and force master permissions
// Default to true if env is missing (safer for private/single setup)
const SINGLE_TENANT = String(import.meta.env?.VITE_SINGLE_TENANT ?? 'true') === 'true';

export type UserRole = 'master' | 'admin' | 'manager' | 'tester' | 'viewer';

export interface UserPermissions {
  can_manage_users: boolean;
  can_manage_projects: boolean;
  can_delete_projects: boolean;
  can_manage_plans: boolean;
  can_manage_cases: boolean;
  can_manage_executions: boolean;
  can_manage_requirements: boolean;
  can_manage_defects: boolean;
  can_view_reports: boolean;
  can_export: boolean;
  can_use_ai: boolean;
  can_access_model_control: boolean;
  can_access_admin_menu: boolean;
  can_configure_ai_models: boolean;
  can_test_ai_connections: boolean;
  can_manage_ai_templates: boolean;
  can_select_ai_models: boolean;
  role?: UserRole;
}

const DEFAULT_PERMISSIONS: UserPermissions = {
  can_manage_users: false,
  can_manage_projects: false,
  can_delete_projects: false,
  can_manage_plans: false,
  can_manage_cases: false,
  can_manage_executions: false,
  can_manage_requirements: false,
  can_manage_defects: false,
  can_view_reports: false,
  can_export: false,
  can_use_ai: false,
  can_access_model_control: false,
  can_access_admin_menu: false,
  can_configure_ai_models: false,
  can_test_ai_connections: false,
  can_manage_ai_templates: false,
  can_select_ai_models: false,
};

const getDefaultPermissions = (role: UserRole): UserPermissions => {
  switch (role) {
    case 'master':
      return {
        can_manage_users: true,
        can_manage_projects: true,
        can_delete_projects: true,
        can_manage_plans: true,
        can_manage_cases: true,
        can_manage_executions: true,
        can_manage_requirements: true,
        can_manage_defects: true,
        can_view_reports: true,
        can_export: true,
        can_use_ai: true,
        can_access_model_control: true,
        can_access_admin_menu: true,
        can_configure_ai_models: true,
        can_test_ai_connections: true,
        can_manage_ai_templates: true,
        can_select_ai_models: true,
      };
    case 'admin':
      return {
        can_manage_users: true,
        can_manage_projects: true,
        can_delete_projects: false,
        can_manage_plans: true,
        can_manage_cases: true,
        can_manage_executions: true,
        can_manage_requirements: true,
        can_manage_defects: true,
        can_view_reports: true,
        can_export: true,
        can_use_ai: true,
        can_access_model_control: true,
        can_access_admin_menu: false,
        can_configure_ai_models: true,
        can_test_ai_connections: true,
        can_manage_ai_templates: true,
        can_select_ai_models: true,
      };
    case 'manager':
      return {
        can_manage_users: false,
        can_manage_projects: false,
        can_delete_projects: false,
        can_manage_plans: true,
        can_manage_cases: true,
        can_manage_executions: true,
        can_manage_requirements: true,
        can_manage_defects: true,
        can_view_reports: true,
        can_export: true,
        can_use_ai: true,
        can_access_model_control: false,
        can_access_admin_menu: false,
        can_configure_ai_models: false,
        can_test_ai_connections: false,
        can_manage_ai_templates: true,
        can_select_ai_models: true,
      };
    case 'tester':
      return {
        can_manage_users: false,
        can_manage_projects: false,
        can_delete_projects: false,
        can_manage_plans: false,
        can_manage_cases: true,
        can_manage_executions: true,
        can_manage_requirements: false,
        can_manage_defects: true,
        can_view_reports: true,
        can_export: false,
        can_use_ai: true,
        can_access_model_control: false,
        can_access_admin_menu: false,
        can_configure_ai_models: false,
        can_test_ai_connections: false,
        can_manage_ai_templates: false,
        can_select_ai_models: true,
      };
    case 'viewer':
      return {
        can_manage_users: false,
        can_manage_projects: false,
        can_delete_projects: false,
        can_manage_plans: false,
        can_manage_cases: false,
        can_manage_executions: false,
        can_manage_requirements: false,
        can_manage_defects: false,
        can_view_reports: true,
        can_export: false,
        can_use_ai: false,
        can_access_model_control: false,
        can_access_admin_menu: false,
        can_configure_ai_models: false,
        can_test_ai_connections: false,
        can_manage_ai_templates: false,
        can_select_ai_models: false,
      };
    default:
      return DEFAULT_PERMISSIONS;
  }
};

interface PermissionsContextType {
  permissions: UserPermissions;
  role: UserRole;
  loading: boolean;
  refreshPermissions: () => Promise<void>;
  hasPermission: (permission: keyof Omit<UserPermissions, 'role'>) => boolean;
  isAdmin: () => boolean;
  isMaster: () => boolean;
  updateUserToMaster: (userId: string) => Promise<void>;
  getDefaultPermissions: (role: UserRole) => UserPermissions;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export const usePermissions = () => {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error('usePermissions must be used within a PermissionsProvider');
  }
  return context;
};

interface PermissionsProviderProps {
  children: React.ReactNode;
}

export const PermissionsProvider = ({ children }: PermissionsProviderProps) => {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<UserPermissions>(
    SINGLE_TENANT ? getDefaultPermissions('master') : DEFAULT_PERMISSIONS
  );
  const [role, setRole] = useState<UserRole>(SINGLE_TENANT ? 'master' : 'viewer');
  const [loading, setLoading] = useState(true);

  const fetchUserRole = async (userId: string): Promise<UserRole> => {
    if (SINGLE_TENANT) return 'master';
    // Usar role do objeto user (JWT) como fonte primária - elimina dependência de query extra
    const tokenRole = (user as any)?.role as UserRole | undefined;
    if (tokenRole && ['master','admin','manager','tester','viewer'].includes(tokenRole)) {
      return tokenRole;
    }
    // Fallback: consultar banco apenas se o token não tiver o role
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return (data?.role as UserRole) || 'viewer';
    } catch {
      return 'viewer';
    }
  };

  const fetchUserPermissions = async (userId: string) => {
    if (SINGLE_TENANT) return getDefaultPermissions('master');
    try {
      const { data, error } = await supabase
        .from('user_permissions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user permissions:', error);
        return DEFAULT_PERMISSIONS;
      }

      if (!data) {
        return DEFAULT_PERMISSIONS;
      }

      return {
        ...DEFAULT_PERMISSIONS,
        ...data,
        role: undefined,
      } as UserPermissions;
    } catch (error) {
      console.error('Error fetching user permissions:', error);
      return DEFAULT_PERMISSIONS;
    }
  };

  const refreshPermissions = async () => {
    if (!user) {
      setPermissions(SINGLE_TENANT ? getDefaultPermissions('master') : DEFAULT_PERMISSIONS);
      setRole(SINGLE_TENANT ? 'master' : 'viewer');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [userRole, userPermissions] = await Promise.all([
        fetchUserRole(user.id),
        fetchUserPermissions(user.id)
      ]);

      setRole(userRole);
      // Master sempre recebe permissoes completas, independente do resultado do banco
      const effectivePerms = userRole === 'master' ? getDefaultPermissions('master') : userPermissions;
      setPermissions({ ...effectivePerms, role: userRole });
    } catch (error) {
      console.error('Error refreshing permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateUserToMaster = async (userId: string) => {
    // In single-tenant mode, don't write to DB; just update local state
    if (SINGLE_TENANT) {
      setRole('master');
      setPermissions({ ...getDefaultPermissions('master'), role: 'master' });
      return;
    }
    try {
      // Backward-compat: try to set profiles.role as master too
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ role: 'master' })
        .eq('id', userId);
      if (profileError) {
        console.warn('Warning updating profiles.role to master:', profileError);
      }

      // Permissions are global per user now (no organizations)
      const masterPermissions = getDefaultPermissions('master');
      const { error: permissionsError } = await supabase
        .from('user_permissions')
        .upsert({
          user_id: userId,
          ...masterPermissions,
        }, { onConflict: 'user_id' });
      if (permissionsError) {
        console.warn('Warning upserting master permissions:', permissionsError);
      }

      if (user && user.id === userId) {
        await refreshPermissions();
      }
    } catch (error) {
      console.error('Error updating user to master:', error);
      throw error;
    }
  };

  useEffect(() => {
    if (user) {
      refreshPermissions();
    } else {
      setPermissions(SINGLE_TENANT ? getDefaultPermissions('master') : DEFAULT_PERMISSIONS);
      setRole(SINGLE_TENANT ? 'master' : 'viewer');
      setLoading(false);
    }
  }, [user]);

  const hasPermission = (permission: keyof Omit<UserPermissions, 'role'>) => {
    const adminPermissions = [
      'can_manage_users',
      'can_manage_projects',
      'can_delete_projects', 
      'can_manage_plans', 
      'can_manage_cases',
      'can_manage_executions',
      'can_view_reports'
    ];
    
    if (adminPermissions.includes(permission)) {
      // Política: apenas MASTER possui override total.
      // Admin NÃO recebe elevação automática.
      if (role === 'master') {
        return true;
      }
    }
    
    return permissions[permission] === true;
  };

  const isAdmin = () => {
    return role === 'admin' || role === 'master';
  };

  const isMaster = () => {
    return role === 'master';
  };

  return (
    <PermissionsContext.Provider 
      value={{ 
        permissions, 
        role, 
        loading, 
        refreshPermissions, 
        hasPermission,
        isAdmin,
        isMaster,
        updateUserToMaster,
        getDefaultPermissions
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
}; 