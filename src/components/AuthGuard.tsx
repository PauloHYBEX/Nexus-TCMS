import { ReactNode, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

interface AuthGuardProps {
  children: ReactNode;
}

export const AuthGuard = ({ children }: AuthGuardProps) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const BYPASS = String((import.meta as any).env?.VITE_E2E_BYPASS_AUTH ?? 'false') === 'true';

  useEffect(() => {
    if (BYPASS) return;
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate, BYPASS]);

  if (loading && !BYPASS) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user && !BYPASS) {
    return null; // Will redirect to login
  }

  return <>{children}</>;
};
