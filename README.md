# Nexus Testing — Sistema de Gestão de Testes com IA

**Nexus Testing** é um TCMS (Test Case Management System) moderno com geração inteligente de testes via IA. Roda 100% localmente com banco SQLite ou conecta a um projeto Supabase em nuvem.

![Dashboard Nexus Testing](docs/assets/Screenshot_1.png)

| ![Gestão](docs/assets/Screenshot_2.png) | 
|:---:|

## ✨ Funcionalidades

- **Gestão completa**: Planos de Teste, Casos de Teste, Execuções, Requisitos e Defeitos
- **Geração por IA**: Planos, casos e execuções gerados automaticamente (Gemini, Groq, OpenAI, Anthropic, Ollama, OpenRouter)
- **Model Control Panel**: Gerencie modelos de IA, chaves API e templates de prompt diretamente na interface
- **Modo offline / local**: Backend SQLite embutido — sem necessidade de Supabase
- **Rastreabilidade**: Matriz de rastreabilidade Requisitos ↔ Casos ↔ Execuções
- **Dashboard em tempo real**: Métricas, progresso por projeto e histórico de atividades
- **Gestão de usuários**: Perfis, permissões granulares, tags públicas e fotos de perfil
- **UI moderna**: Dark theme, shadcn/ui + Radix UI + Tailwind CSS

---

## 🚀 Início Rápido — Modo Local (SQLite)

> Não precisa de conta no Supabase. Tudo roda no seu computador.

### Pré-requisitos
- **Node.js 18+** e npm

### Instalação

```bash
# Clone o repositório
git clone https://github.com/PauloHYBEX/Nexus-TCMS.git
cd Nexus-TCMS

# Instale as dependências
npm install
```

### Configuração do `.env`

Crie um arquivo `.env` na raiz com:

```env
VITE_SINGLE_TENANT=true
VITE_API_URL=http://localhost:4000/api
```

### Executar

```bash
# Terminal 1 — API local (SQLite, porta 4000)
npm run dev:api

# Terminal 2 — Frontend (Vite, porta 5173)
npm run dev
```

Acesse: **http://localhost:5173**

Na primeira execução, o banco SQLite é criado automaticamente. Use **Registrar** para criar o primeiro usuário (que será `master` automaticamente).

---

## ☁️ Modo Nuvem (Supabase)

Para usar com Supabase em vez do banco local:

```env
VITE_SINGLE_TENANT=false
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anonima
```

Execute apenas o frontend:

```bash
npm run dev
```

---

## 📜 Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Frontend Vite (porta 5173) |
| `npm run dev:api` | API SQLite local (porta 4000) |
| `npm run build` | Build de produção |
| `npm run preview` | Preview do build |
| `npm run lint` | Validação ESLint |
| `npm run typecheck` | Checagem TypeScript |
| `npm run db:bootstrap` | Cria/recria o banco SQLite do zero |

---

## 🛠️ Stack

### Frontend
- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** + **shadcn/ui** + **Radix UI**
- **React Router** · **Lucide Icons**

### Backend local
- **Node.js** + **Express** + **better-sqlite3**
- Banco SQLite com migrações automáticas na inicialização

### Nuvem (opcional)
- **Supabase** (PostgreSQL + Auth + RLS)

### IA
- **Google Gemini** (via Google AI Studio)
- **Groq** (LLaMA 3.3, Mixtral, QwQ)
- **OpenRouter** (acesso a centenas de modelos)
- **OpenAI** (GPT-4o e variantes)
- **Anthropic** (Claude)
- **Ollama** (modelos locais)

---

## 🤖 Configuração de IA (Model Control Panel)

Acesse **Administrativo → Config. IA** (requer perfil `admin` ou `master`):

1. **Modelos**: Adicione seus modelos e chaves API de cada provedor
2. **Templates**: Personalize os prompts de geração
3. **Testes**: Valide a conexão com cada modelo antes de usar

As chaves API são salvas localmente no `localStorage` do navegador e nunca enviadas para o servidor.

---

## �️ Estrutura do Projeto

```
src/
├── components/        # Componentes React reutilizáveis
├── pages/             # Páginas da aplicação
├── hooks/             # Custom hooks
├── services/          # Lógica de negócio
├── integrations/      # Clientes de IA e Supabase
├── lib/               # Utilitários
└── types/             # Definições TypeScript

server/
├── index.js           # API Express + SQLite
├── schema.sql         # Schema do banco
└── scripts/           # Bootstrap e utilitários

docs/
└── assets/            # Screenshots
```

---

## 🚀 Deploy (Frontend)

### Vercel / Netlify
1. Conecte o repositório
2. Build command: `npm run build`
3. Output directory: `dist`
4. Variáveis de ambiente:
   ```
   VITE_SINGLE_TENANT=true
   VITE_API_URL=https://sua-api.dominio.com/api
   ```

> Para deploy completo (API + frontend), hospede o `server/index.js` em qualquer plataforma Node.js (Railway, Render, VPS) e aponte `VITE_API_URL` para o endereço público.
