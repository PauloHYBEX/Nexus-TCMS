// Script para atualizar role de usuário específico
// Uso: node scripts/update-user-role.js

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Carregar variáveis de ambiente
config();

// Configurações do Supabase (exigir via ambiente)
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('❌ VITE_SUPABASE_URL não definido no ambiente. Configure no .env');
  process.exit(1);
}
if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não definido no ambiente. NUNCA versione esta chave. Configure no .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Função para obter permissões padrão baseadas no role
const getDefaultPermissions = (role) => {
  const basePermissions = {
    can_manage_users: false,
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
    can_access_todo: false,
    can_manage_todo_folders: false,
    can_manage_todo_tasks: false,
    can_manage_all_todos: false,
    can_upload_attachments: false,
    can_comment_tasks: false,
    can_assign_tasks: false,
  };

  switch (role) {
    case 'master':
      return {
        ...basePermissions,
        can_manage_users: true,
        can_manage_plans: true,
        can_manage_cases: true,
        can_manage_executions: true,
        can_view_reports: true,
        can_use_ai: true,
        can_access_model_control: true,
        can_configure_ai_models: true,
        can_test_ai_connections: true,
        can_manage_ai_templates: true,
        can_select_ai_models: true,
        can_access_todo: true,
        can_manage_todo_folders: true,
        can_manage_todo_tasks: true,
        can_manage_all_todos: true,
        can_upload_attachments: true,
        can_comment_tasks: true,
        can_assign_tasks: true,
      };

    default:
      return basePermissions;
  }
};

// Função principal para atualizar usuário
async function updateUserRole(email, newRole) {
  try {
    console.log(`🔍 Procurando usuário: ${email}`);
    
    // Primeiro, vamos buscar o usuário pelo email no profiles
    const { data: profiles, error: searchError } = await supabase
      .from('profiles')
      .select('id, email, display_name, role')
      .eq('email', email);

    if (searchError) {
      console.error('❌ Erro ao buscar usuário:', searchError);
      return;
    }

    if (!profiles || profiles.length === 0) {
      console.log('❌ Usuário não encontrado com o email:', email);
      console.log('📋 Vou listar todos os usuários disponíveis...');
      
      // Listar todos os usuários para ajudar
      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('id, email, display_name, role')
        .order('email');
      
      if (allProfiles && allProfiles.length > 0) {
        console.log('\n📋 Usuários encontrados no sistema:');
        allProfiles.forEach((profile, index) => {
          console.log(`${index + 1}. Email: ${profile.email || 'N/A'}`);
          console.log(`   Nome: ${profile.display_name || 'N/A'}`);
          console.log(`   Role: ${profile.role || 'N/A'}`);
          console.log(`   ID: ${profile.id}`);
          console.log('');
        });
      }
      return;
    }

    const user = profiles[0];
    console.log(`✅ Usuário encontrado:`);
    console.log(`   Nome: ${user.display_name || 'N/A'}`);
    console.log(`   Email: ${user.email || 'N/A'}`);
    console.log(`   Role atual: ${user.role}`);
    console.log(`   ID: ${user.id}`);

    if (user.role === newRole) {
      console.log(`⚠️  Usuário já possui a role '${newRole}'`);
      return;
    }

    console.log(`\n🔄 Atualizando role de '${user.role}' para '${newRole}'...`);

    // Atualizar role no perfil
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', user.id);

    if (profileError) {
      console.error('❌ Erro ao atualizar perfil:', profileError);
      return;
    }

    console.log('✅ Role do perfil atualizada com sucesso');

    // Atualizar permissões
    console.log('🔄 Atualizando permissões...');
    const newPermissions = getDefaultPermissions(newRole);
    
    const { error: permissionsError } = await supabase
      .from('user_permissions')
      .upsert({
        user_id: user.id,
        ...newPermissions
      });

    if (permissionsError) {
      console.error('❌ Erro ao atualizar permissões:', permissionsError);
      return;
    }

    console.log('✅ Permissões atualizadas com sucesso');
    console.log(`\n🎉 Usuário ${user.email} foi promovido para '${newRole}' com sucesso!`);
    
    // Mostrar resumo das permissões
    console.log('\n📋 Resumo das novas permissões:');
    Object.entries(newPermissions).forEach(([key, value]) => {
      if (value) {
        console.log(`   ✅ ${key}`);
      }
    });

  } catch (error) {
    console.error('❌ Erro geral:', error);
  }
}

// Executar o script
const email = 'paulo.santos@hybex.com.br';
const newRole = 'master';

console.log('🚀 Iniciando atualização de usuário...');
console.log(`📧 Email: ${email}`);
console.log(`👑 Nova Role: ${newRole}`);
console.log('');

updateUserRole(email, newRole)
  .then(() => {
    console.log('\n✅ Script finalizado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  }); 