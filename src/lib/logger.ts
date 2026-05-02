// Logger leve para o frontend.
// Usa import.meta.env.DEV para silenciar debug/info em producao.
// Nunca logar senhas, tokens, payloads completos de auth ou chaves de API.

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const IS_DEV = Boolean((import.meta as any).env?.DEV);

const prefix = (level: LogLevel, scope?: string) =>
  scope ? `[${level}][${scope}]` : `[${level}]`;

function emit(level: LogLevel, scope: string | undefined, args: unknown[]) {
  // Em producao suprimimos debug/info para reduzir ruido e evitar vazamento.
  if (!IS_DEV && (level === 'debug' || level === 'info')) return;
  const method = level === 'debug' ? 'log' : level;
  // eslint-disable-next-line no-console
  (console as any)[method](prefix(level, scope), ...args);
}

export const logger = {
  debug: (...args: unknown[]) => emit('debug', undefined, args),
  info: (...args: unknown[]) => emit('info', undefined, args),
  warn: (...args: unknown[]) => emit('warn', undefined, args),
  error: (...args: unknown[]) => emit('error', undefined, args),
  scoped(scope: string) {
    return {
      debug: (...args: unknown[]) => emit('debug', scope, args),
      info: (...args: unknown[]) => emit('info', scope, args),
      warn: (...args: unknown[]) => emit('warn', scope, args),
      error: (...args: unknown[]) => emit('error', scope, args),
    };
  },
};

export default logger;
