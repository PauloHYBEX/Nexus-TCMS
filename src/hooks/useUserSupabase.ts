import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

export function useUserSupabase() {
  const { user } = useAuth();
  const [userSupabase, setUserSupabase] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setUserSupabase(null);
      setLoading(false);
      return;
    }

    const loadUserSupabase = async () => {
      try {
        setLoading(true);
        setError(null);

        setUserSupabase(supabase);
      } catch (err) {
        console.error('Error loading user Supabase client:', err);
        setError('Erro ao carregar configuração de banco de dados');
        setUserSupabase(null);
      } finally {
        setLoading(false);
      }
    };

    loadUserSupabase();
  }, [user]);

  return {
    userSupabase,
    loading,
    error,
    hasUserDatabase: !!userSupabase
  };
} 