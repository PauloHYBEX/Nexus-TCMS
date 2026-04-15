import { supabase } from '@/integrations/supabase/client';

export interface DatabaseSetupRequest {
  supabaseUrl: string;
  supabaseKey: string;
  aiApiKey?: string;
}

export interface DatabaseSetupResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface UserDatabaseConfig {
  supabaseUrl: string;
  supabaseKey: string;
  isConfigured: boolean;
}

export interface DatabaseStatus {
  tablesExist: boolean;
  needsSetup: boolean;
  errorMessage?: string;
}

export class DatabaseSetupService {
  // Cache para evitar múltiplas verificações
  private static databaseStatusCache: DatabaseStatus | null = null;
  private static cacheTimestamp: number = 0;
  private static CACHE_DURATION = 30000; // 30 segundos

  // Método principal para verificar status da base de dados
  static async getDatabaseStatus(userId: string): Promise<DatabaseStatus> {

    // Verificar cache
    const now = Date.now();
    if (this.databaseStatusCache && (now - this.cacheTimestamp) < this.CACHE_DURATION) {
      return this.databaseStatusCache;
    }

    try {
      console.log('🔍 Verificando status da base de dados...');
      
      // 1. Primeiro verificar se as tabelas básicas existem
      const tablesExist = await this.checkTablesExistSafely();
      console.log(`📊 Tabelas existem: ${tablesExist}`);

      if (!tablesExist) {
        const status: DatabaseStatus = {
          tablesExist: false,
          needsSetup: true,
          errorMessage: 'As tabelas da base de dados não existem. Execute o SQL de configuração primeiro.'
        };
        this.cacheStatus(status);
        return status;
      }

      const status: DatabaseStatus = {
        tablesExist: true,
        // Sem organizações: se tabelas existem, não há setup adicional necessário
        needsSetup: false
      };

      this.cacheStatus(status);
      return status;

    } catch (error) {
      console.error('❌ Erro ao verificar status da base:', error);
      const status: DatabaseStatus = {
        tablesExist: false,
        needsSetup: true,
        errorMessage: 'Erro ao conectar com a base de dados: ' + (error as Error).message
      };

      this.cacheStatus(status);
      return status;
    }
  }

  // Verificação segura se as tabelas existem (sem gerar erros 406)
  private static async checkTablesExistSafely(): Promise<boolean> {
    try {
      console.log('🔍 Verificando se tabelas existem...');
      
      // Tentar queries simples em tabelas essenciais (sem organizações/To-Do)
      const checks = await Promise.allSettled([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('user_permissions').select('id', { count: 'exact', head: true }),
        supabase.from('test_plans').select('id', { count: 'exact', head: true })
      ]);

      // Verificar se pelo menos uma tabela existe e é acessível
      const hasAccessibleTable = checks.some(result => {
        if (result.status === 'fulfilled') {
          const { error } = result.value as { error?: { code?: string } | null };
          // Se não há erro, ou se o erro é apenas "no rows", a tabela existe
          return !error || error.code === 'PGRST116';
        }
        return false;
      });

      console.log('📊 Tabelas acessíveis:', hasAccessibleTable);
      return hasAccessibleTable;
      
    } catch (error) {
      console.log('📋 Erro ao verificar tabelas:', error);
      return false;
    }
  }

  // Removido checagem de organizações (escopo single-tenant/global)

  // Cache do status
  private static cacheStatus(status: DatabaseStatus): void {
    this.databaseStatusCache = status;
    this.cacheTimestamp = Date.now();
  }

  // Limpar cache (para forçar nova verificação)
  static clearCache(): void {
    this.databaseStatusCache = null;
    this.cacheTimestamp = 0;
  }

  // Método legacy (mantido para compatibilidade)
  static async needsDatabaseSetup(userId: string): Promise<boolean> {
    const status = await this.getDatabaseStatus(userId);
    return status.needsSetup;
  }

  // Verificar se as tabelas básicas existem
  static async checkBasicTablesExist(): Promise<boolean> {
    const status = await this.getDatabaseStatus('temp');
    return status.tablesExist;
  }

  // Obter configuração atual do Supabase (para mostrar na aba Sobre)
  static getCurrentSupabaseConfig(): { url: string; isDemo: boolean } {
    const currentUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
    const isDemo = false;
    
    return {
      url: currentUrl,
      isDemo
    };
  }

  // Configurar base de dados para o usuário
  static async setupUserDatabase(_userId: string, data: DatabaseSetupRequest): Promise<DatabaseSetupResult> {
    try {
      console.log('⚙️ Iniciando configuração da base de dados...');
      
      // Limpar cache para forçar nova verificação
      this.clearCache();

      // Primeiro validar se a nova base tem as tabelas necessárias
      const isValid = await this.validateDatabaseStructure(data.supabaseUrl, data.supabaseKey);
      
      if (!isValid) {
        return {
          success: false,
          error: 'A base de dados não possui as tabelas necessárias. Por favor, execute as migrações SQL primeiro.'
        };
      }

      // Sem organizações: configuração é apenas validação das tabelas
      this.clearCache();
      console.log('✅ Estrutura de base validada com sucesso!');
      return { success: true, message: 'Estrutura de base validada com sucesso!' };

    } catch (error) {
      console.error('❌ Erro ao configurar base de dados:', error);
      return {
        success: false,
        error: 'Erro inesperado ao configurar base de dados: ' + (error as Error).message
      };
    }
  }

  // Obter configuração da base de dados do usuário
  static async getUserDatabaseConfig(_userId: string): Promise<UserDatabaseConfig | null> {
    try {
      const status = await this.getDatabaseStatus('temp');
      if (!status.tablesExist) return null;
      const url = import.meta.env.VITE_API_URL || '';
      return { supabaseUrl: url, supabaseKey: '', isConfigured: true };

    } catch (error) {
      console.error('Error getting user database config:', error);
      return null;
    }
  }

  // Remover configuração da base de dados
  static async removeDatabaseConfig(_userId: string): Promise<boolean> {
    try {
      // Sem organizações: nada a remover
      this.clearCache();
      return true;

    } catch (error) {
      console.error('Error removing database config:', error);
      return false;
    }
  }

  // Testar conexão com a base de dados
  static async testDatabaseConnection(supabaseUrl: string, supabaseKey: string): Promise<boolean> {
    try {
      // Criar cliente temporário para teste
      const { createClient } = await import('@supabase/supabase-js');
      const testClient = createClient(supabaseUrl, supabaseKey);

      // Testar conexão básica
      const { error } = await testClient.from('profiles').select('count').limit(1);
      
      return !error;

    } catch (error) {
      console.error('Error testing database connection:', error);
      return false;
    }
  }

  // Verificar se as tabelas necessárias existem
  static async validateDatabaseStructure(supabaseUrl: string, supabaseKey: string): Promise<boolean> {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const testClient = createClient(supabaseUrl, supabaseKey);

      // Verificar se tabelas principais existem (sem organizações/To-Do)
      const requiredTables = ['profiles', 'user_permissions', 'test_plans', 'test_cases', 'test_executions'];
      
      for (const table of requiredTables) {
        const { error } = await testClient.from(table).select('*').limit(1);
        if (error) {
          console.error(`Table ${table} not found or accessible:`, error);
          return false;
        }
      }

      return true;

    } catch (error) {
      console.error('Error validating database structure:', error);
      return false;
    }
  }

  // Obter estatísticas da base de dados
  static async getDatabaseStatistics(): Promise<{
    totalUsers: number;
    totalTests: number;
  }> {
    try {
      const status = await this.getDatabaseStatus('temp');
      
      if (!status.tablesExist) {
        return { totalUsers: 0, totalTests: 0 };
      }

      const [usersCount, testsCount] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('test_plans').select('id', { count: 'exact', head: true })
      ]);

      const usersStats = usersCount as { count?: number | null };
      const testsStats = testsCount as { count?: number | null };

      return {
        totalUsers: usersStats.count || 0,
        totalTests: testsStats.count || 0
      };

    } catch (error) {
      console.error('Error getting database statistics:', error);
      return { totalUsers: 0, totalTests: 0 };
    }
  }
} 