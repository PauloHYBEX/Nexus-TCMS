/**
 * OpenRouter Adaptive Client
 * Tenta múltiplos slugs de modelo até encontrar um disponível
 */

export interface AdaptiveSlug {
  slug: string;
  priority?: number; // menor = mais prioritário
  description?: string;
}

interface OpenRouterError {
  error?: {
    message?: string;
    code?: number;
    type?: string;
  };
}

/**
 * Verifica se o erro indica que o modelo não está disponível
 */
function isModelUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as OpenRouterError;
  const msg = err.error?.message?.toLowerCase() ?? '';
  const type = err.error?.type?.toLowerCase() ?? '';

  // Erros que indicam modelo indisponível ou quota excedida
  return (
    msg.includes('model') && (msg.includes('not available') || msg.includes('not found') || msg.includes('invalid')) ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    type.includes('invalid_model') ||
    type.includes('model_not_found')
  );
}

/**
 * Gera slugs alternativos comuns baseados no slug principal
 * Ex: qwen/qwen3.6-plus -> outras variantes do Qwen
 */
function generateFallbackSlugs(primarySlug: string): string[] {
  const fallbacks: string[] = [];

  // Mapeamento de famílias de modelos para alternativas
  const familyMappings: Record<string, string[]> = {
    'qwen': [
      'qwen/qwen-2.5-72b-instruct',
      'qwen/qwen-2.5-32b-instruct',
      'qwen/qwen-2.5-14b-instruct',
      'qwen/qwen-2.5-7b-instruct',
      'qwen/qwen2.5-vl-72b-instruct',
    ],
    'google': [
      'google/gemma-2-9b-it',
      'google/gemma-2-27b-it',
      'google/gemini-2.0-flash-thinking-exp',
    ],
    'anthropic': [
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-haiku',
      'anthropic/claude-3-opus',
    ],
    'meta': [
      'meta-llama/llama-3.3-70b-instruct',
      'meta-llama/llama-3.1-70b-instruct',
      'meta-llama/llama-3.1-8b-instruct',
    ],
    'mistral': [
      'mistralai/mistral-large',
      'mistralai/mistral-medium',
      'mistralai/mistral-7b-instruct',
    ],
    'openai': [
      'openai/gpt-4o-mini',
      'openai/gpt-4o',
      'openai/gpt-3.5-turbo',
    ],
    'deepseek': [
      'deepseek/deepseek-chat',
      'deepseek/deepseek-coder',
    ],
    'nvidia': [
      'nvidia/llama-3.1-nemotron-70b-instruct',
    ],
  };

  // Detecta a família do modelo
  const prefix = primarySlug.split('/')[0].toLowerCase();
  if (familyMappings[prefix]) {
    // Adiciona alternativas da mesma família (exceto o próprio slug)
    fallbacks.push(...familyMappings[prefix].filter(s => s !== primarySlug));
  }

  // Modelos gratuitos genéricos como último recurso
  const freeFallbacks = [
    'google/gemma-2-9b-it:free',
    'meta-llama/llama-3.1-70b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
    'qwen/qwen-2.5-7b-instruct',
  ];

  // Adiciona fallbacks gratuitos que não são da mesma família
  fallbacks.push(...freeFallbacks.filter(s => !s.startsWith(prefix)));

  return fallbacks;
}

/**
 * Gera texto usando OpenRouter com fallback automático entre slugs
 */
export async function openRouterGenerateTextAdaptive(
  prompt: string,
  primarySlug: string,
  apiKey: string,
  options?: {
    customSlugs?: string[]; // Slugs personalizados para tentar
    temperature?: number;
    maxRetries?: number;
    onSlugAttempt?: (slug: string, attempt: number, total: number) => void;
    onFallback?: (failedSlug: string, newSlug: string) => void;
  }
): Promise<{ content: string; slugUsed: string }> {
  if (!apiKey) throw new Error('OpenRouter: API key não configurada');

  // Monta lista de slugs para tentar
  const slugs: string[] = [primarySlug];

  // Adiciona slugs personalizados se fornecidos
  if (options?.customSlugs?.length) {
    slugs.push(...options.customSlugs.filter(s => s !== primarySlug));
  }

  // Adiciona slugs gerados automaticamente
  const autoFallbacks = generateFallbackSlugs(primarySlug);
  slugs.push(...autoFallbacks.filter(s => !slugs.includes(s)));

  const maxRetries = options?.maxRetries ?? 3;
  const temperature = options?.temperature ?? 0.7;
  const errors: Array<{ slug: string; error: string }> = [];

  for (let i = 0; i < Math.min(slugs.length, maxRetries); i++) {
    const slug = slugs[i];

    options?.onSlugAttempt?.(slug, i + 1, Math.min(slugs.length, maxRetries));

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Nexus Testing TCMS',
        },
        body: JSON.stringify({
          model: slug,
          messages: [{ role: 'user', content: prompt }],
          temperature,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        let parsedError: OpenRouterError = {};
        try { parsedError = JSON.parse(errText); } catch {}

        // Se for erro de modelo não disponível, tenta próximo slug
        if (isModelUnavailableError(parsedError) || res.status === 404 || res.status === 429) {
          errors.push({ slug, error: errText });
          options?.onFallback?.(slug, slugs[i + 1] ?? 'none');
          continue;
        }

        throw new Error(`OpenRouter error: ${res.status} ${errText}`);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('OpenRouter: resposta vazia');
      }

      return { content, slugUsed: slug };

    } catch (error: any) {
      // Erros de rede ou outros que não são específicos de modelo indisponível
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        throw new Error('OpenRouter: erro de conexão. Verifique sua internet.');
      }

      errors.push({ slug, error: error.message });

      // Se for o último slug, propaga o erro
      if (i === Math.min(slugs.length, maxRetries) - 1) {
        const errorSummary = errors.map(e => `[${e.slug}]: ${e.error.slice(0, 100)}`).join('; ');
        throw new Error(`OpenRouter: Todos os modelos falharam. Último erro: ${error.message}. Histórico: ${errorSummary}`);
      }

      options?.onFallback?.(slug, slugs[i + 1]);
    }
  }

  throw new Error('OpenRouter: Não foi possível obter resposta de nenhum modelo disponível');
}

/**
 * Busca modelos disponíveis na API do OpenRouter
 */
export async function fetchAvailableOpenRouterModels(apiKey: string): Promise<Array<{
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: { prompt: number; completion: number };
}>> {
  if (!apiKey) throw new Error('OpenRouter: API key não configurada');

  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data?.data ?? [];
}
