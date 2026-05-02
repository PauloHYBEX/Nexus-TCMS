// Logger leve para o backend. Silencia debug/info em producao.
// Nunca logue senhas, hashes, tokens completos ou chaves de API.

const IS_PROD = process.env.NODE_ENV === 'production';

function fmt(level, scope, args) {
  const p = scope ? `[${level}][${scope}]` : `[${level}]`;
  return [p, ...args];
}

function emit(level, scope, args) {
  if (IS_PROD && (level === 'debug' || level === 'info')) return;
  const method = level === 'debug' ? 'log' : level;
  // eslint-disable-next-line no-console
  console[method](...fmt(level, scope, args));
}

export const logger = {
  debug: (...args) => emit('debug', undefined, args),
  info: (...args) => emit('info', undefined, args),
  warn: (...args) => emit('warn', undefined, args),
  error: (...args) => emit('error', undefined, args),
  scoped(scope) {
    return {
      debug: (...args) => emit('debug', scope, args),
      info: (...args) => emit('info', scope, args),
      warn: (...args) => emit('warn', scope, args),
      error: (...args) => emit('error', scope, args),
    };
  },
};

export default logger;
