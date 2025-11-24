import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { Shield, AlertCircle } from 'lucide-react';

interface PermissionGuardProps {
  children: ReactNode;
  requiredPermission?: keyof Omit<import('@/hooks/usePermissions').UserPermissions, 'role'>;
  requiredRole?: import('@/hooks/usePermissions').UserRole;
  anyOfPermissions?: Array<keyof Omit<import('@/hooks/usePermissions').UserPermissions, 'role'>>;
  allOfPermissions?: Array<keyof Omit<import('@/hooks/usePermissions').UserPermissions, 'role'>>;
  fallback?: ReactNode;
  redirect?: string;
}

export const PermissionGuard = ({ 
  children, 
  requiredPermission, 
  requiredRole,
  anyOfPermissions,
  allOfPermissions,
  fallback,
  redirect
}: PermissionGuardProps) => {
  const { hasPermission, role, loading } = usePermissions();
  const BYPASS = String((import.meta as any).env?.VITE_E2E_BYPASS_AUTH ?? 'false') === 'true';

  if (BYPASS) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Check role requirement
  const hasRequiredRole = !requiredRole || 
    role === requiredRole || 
    (requiredRole === 'admin' && role === 'master') ||
    (requiredRole === 'manager' && (role === 'master' || role === 'admin'));

  // Check permission requirement (single + anyOf + allOf)
  const singleOk = !requiredPermission || hasPermission(requiredPermission);
  const anyOfOk = !anyOfPermissions || anyOfPermissions.length === 0 || anyOfPermissions.some(p => hasPermission(p));
  const allOfOk = !allOfPermissions || allOfPermissions.length === 0 || allOfPermissions.every(p => hasPermission(p));
  const hasRequiredPermission = singleOk && anyOfOk && allOfOk;

  // If requirements are met, render children
  if (hasRequiredRole && hasRequiredPermission) {
    return <>{children}</>;
  }

  // If redirect is specified, navigate there
  if (redirect) {
    return <Navigate to={redirect} replace />;
  }

  // If fallback is provided, render it
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default access denied view
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-lg max-w-md">
        <Shield className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-red-700 dark:text-red-400 mb-2">
          Acesso Negado
        </h2>
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          Você não possui permissão para acessar esta funcionalidade.
          {requiredPermission && (
            <span className="block mt-2 text-sm">
              Permissão necessária: <strong>{requiredPermission}</strong>
            </span>
          )}
          {requiredRole && (
            <span className="block mt-2 text-sm">
              Nível necessário: <strong>{requiredRole}</strong>
            </span>
          )}
        </p>
        <div className="flex items-center justify-center gap-2 p-2 bg-red-100 dark:bg-red-900/30 rounded text-sm text-red-600 dark:text-red-300">
          <AlertCircle className="h-4 w-4" />
          <span>Contate um administrador para solicitar acesso.</span>
        </div>
      </div>
    </div>
  );
}; 