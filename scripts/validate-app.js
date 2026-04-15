#!/usr/bin/env node

/**
 * Validação básica da aplicação sem Playwright
 * Verifica se as rotas respondem corretamente
 */

import { spawn } from 'child_process';
import http from 'http';
import https from 'https';

const PORT = 5173;
const BASE_URL = `http://localhost:${PORT}`;

// Função para verificar se o servidor está respondendo
// Para URLs HTTPS usamos https, para HTTP limitamos o uso a localhost
function checkServer(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout')), timeout);
    const client = url.startsWith('https://') ? https : http;

    client.get(url, (res) => {
      clearTimeout(timer);
      resolve(res.statusCode);
    }).on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function validateApp() {
  console.log('🚀 Iniciando validação da aplicação...\n');
  
  // Iniciar servidor dev
  console.log('📡 Iniciando servidor de desenvolvimento...');
  const serverProcess = spawn('npm', ['run', 'dev'], {
    stdio: 'pipe',
    shell: true,
    env: {
      ...process.env,
      VITE_E2E_BYPASS_AUTH: 'true',
      VITE_E2E_MOCK_HISTORY: 'true'
    }
  });
  
  let serverReady = false;
  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Local:') || output.includes('localhost')) {
      console.log('✅ Servidor iniciado com sucesso');
      serverReady = true;
    }
  });
  
  serverProcess.stderr.on('data', (data) => {
    const error = data.toString();
    if (error.includes('Port')) {
      console.error('❌ Erro na porta:', error.trim());
    }
  });
  
  // Aguardar servidor ficar pronto
  let attempts = 0;
  const maxAttempts = 30;
  
  while (!serverReady && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
    
    try {
      const status = await checkServer(BASE_URL, 2000);
      if (status === 200) {
        serverReady = true;
        console.log('✅ Servidor respondendo na porta 5173');
        break;
      }
    } catch (err) {
      // Continue tentando
    }
  }
  
  if (!serverReady) {
    console.error('❌ Servidor não ficou pronto após 30 segundos');
    serverProcess.kill();
    process.exit(1);
  }
  
  // Testar rotas principais
  const routes = [
    '/',
    '/history',
    '/plans',
    '/cases',
    '/executions'
  ];
  
  console.log('\n🔍 Testando rotas principais...');
  
  for (const route of routes) {
    try {
      const status = await checkServer(`${BASE_URL}${route}`, 10000);
      if (status === 200) {
        console.log(`✅ ${route} - OK`);
      } else {
        console.log(`⚠️  ${route} - Status ${status}`);
      }
    } catch (err) {
      console.log(`❌ ${route} - Erro: ${err.message}`);
    }
  }
  
  console.log('\n✅ Validação concluída!');
  console.log('💡 Para testar manualmente, acesse: http://localhost:5173');
  console.log('🚪 Pressione Ctrl+C para encerrar o servidor\n');
  
  // Manter servidor rodando para testes manuais
  process.on('SIGINT', () => {
    console.log('\n🛑 Encerrando servidor...');
    serverProcess.kill();
    process.exit(0);
  });
  
  // Aguardar indefinidamente
  await new Promise(() => {});
}

if (import.meta.url === `file://${process.argv[1]}`) {
  validateApp().catch(err => {
    console.error('❌ Erro na validação:', err.message);
    process.exit(1);
  });
}
