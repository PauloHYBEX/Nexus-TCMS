// Servico de chaves de API (LLMs) — persistencia no backend com criptografia at-rest.
// A chave raw nunca e persistida no browser: so permanece em memoria durante a sessao.
// Autenticacao obrigatoria (JWT Bearer) para todos os endpoints.

const TOKEN_KEY = 'krg_local_auth_token';
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || '/api';

const readToken = () => localStorage.getItem(TOKEN_KEY);

async function apiFetch(path: string, init: RequestInit = {}) {
  const token = readToken();
  const headers = new Headers(init.headers || {});
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
  return body;
}

export interface StoredKeyMeta {
  provider: string;
  model_id: string;
  has_key: boolean;
  created_at: string;
  updated_at: string;
}

// Cache em memoria (somente na sessao atual). Nao persistido.
const _memCache = new Map<string, string>();
const cacheKey = (provider: string, modelId = '') => `${provider}::${modelId}`;

export const listStoredKeys = async (): Promise<StoredKeyMeta[]> => {
  const res = await apiFetch('/ai/keys', { method: 'GET' });
  return res.data || [];
};

export const saveApiKey = async (provider: string, key: string, modelId = ''): Promise<void> => {
  await apiFetch('/ai/keys', {
    method: 'POST',
    body: JSON.stringify({ provider, model_id: modelId, key }),
  });
  _memCache.set(cacheKey(provider, modelId), key);
};

export const deleteApiKey = async (provider: string, modelId = ''): Promise<void> => {
  await apiFetch('/ai/keys', {
    method: 'DELETE',
    body: JSON.stringify({ provider, model_id: modelId }),
  });
  _memCache.delete(cacheKey(provider, modelId));
};

// Recupera a chave real (requer autenticacao). Usa cache em memoria para evitar round-trip.
export const revealApiKey = async (provider: string, modelId = ''): Promise<string | null> => {
  const ck = cacheKey(provider, modelId);
  const cached = _memCache.get(ck);
  if (cached) return cached;
  try {
    const res = await apiFetch('/ai/keys/reveal', {
      method: 'POST',
      body: JSON.stringify({ provider, model_id: modelId }),
    });
    const key = String(res.key || '');
    if (key) {
      _memCache.set(ck, key);
      // Tambem cacheia com model_id vazio se fallback foi usado no backend
      if (modelId) _memCache.set(cacheKey(provider, ''), key);
      return key;
    }
    return null;
  } catch {
    return null;
  }
};

// Leitura sincrona do cache (retorna null se nao estiver em memoria)
// Usada por clients legados (gemini) que nao podem ser async.
// Para popular o cache, chame revealApiKey() antes (ex: no boot apos login).
export const getCachedKeySync = (provider: string, modelId = ''): string | null => {
  return _memCache.get(cacheKey(provider, modelId))
    || _memCache.get(cacheKey(provider, ''))
    || null;
};

// Pre-carrega todas as chaves do backend para o cache em memoria (uso: apos login)
export const preloadAllKeys = async (): Promise<void> => {
  try {
    const rows = await listStoredKeys();
    for (const r of rows) {
      await revealApiKey(r.provider, r.model_id || '');
    }
  } catch {
    // silent
  }
};

// Limpa cache em memoria (chamar no logout)
export const clearApiKeysCache = (): void => {
  _memCache.clear();
};

// Migracao: move chaves do localStorage antigo para o backend (one-shot)
// Formato antigo: `${hostname}_mcp_api_keys` => { [modelId]: key }
export const migrateLegacyKeys = async (): Promise<{ migrated: number; failed: number }> => {
  const legacyKey = `${window.location.hostname}_mcp_api_keys`;
  const raw = localStorage.getItem(legacyKey);
  if (!raw) return { migrated: 0, failed: 0 };
  let parsed: Record<string, string> = {};
  try { parsed = JSON.parse(raw) || {}; } catch { return { migrated: 0, failed: 0 }; }
  let migrated = 0;
  let failed = 0;
  for (const [modelId, key] of Object.entries(parsed)) {
    if (!key) continue;
    // Deriva provider pelo prefixo do modelId (convencao do defaultConfig)
    const provider = modelId.startsWith('gemini') ? 'gemini'
      : modelId.startsWith('openai') || modelId.startsWith('gpt') ? 'openai'
      : modelId.startsWith('anthropic') || modelId.startsWith('claude') ? 'anthropic'
      : modelId.startsWith('groq') ? 'groq'
      : modelId.startsWith('openrouter') ? 'openrouter'
      : modelId.startsWith('ollama') ? 'ollama'
      : null;
    if (!provider) { failed++; continue; }
    try {
      await saveApiKey(provider, key, modelId);
      migrated++;
    } catch {
      failed++;
    }
  }
  // So remove o localStorage se pelo menos uma chave migrou com sucesso
  if (migrated > 0) {
    try { localStorage.removeItem(legacyKey); } catch { /* noop */ }
  }
  return { migrated, failed };
};
