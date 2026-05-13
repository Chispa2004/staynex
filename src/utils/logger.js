const redactValue = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  if (/^(sk-|AC[a-zA-Z0-9]|eyJ)/.test(value) || value.length > 80) {
    return `${value.slice(0, 4)}...redacted`;
  }

  return value;
};

const redactContext = (context) => Object.fromEntries(
  Object.entries(context).map(([key, value]) => [
    key,
    /key|token|secret|password/i.test(key) ? 'redacted' : redactValue(value)
  ])
);

const formatContext = (context) => {
  if (!context || Object.keys(context).length === 0) {
    return '';
  }

  return ` ${JSON.stringify(redactContext(context))}`;
};

const log = (level, message, context = {}) => {
  const timestamp = new Date().toISOString();
  const service = 'staynex-backend';
  const line = `${timestamp} ${level.padEnd(5)} [${service}] ${message}${formatContext(context)}`;

  if (level === 'ERROR') {
    console.error(line);
    return;
  }

  if (level === 'WARN') {
    console.warn(line);
    return;
  }

  console.log(line);
};

export const logger = {
  info(message, context = {}) {
    log('INFO', message, context);
  },

  warn(message, context = {}) {
    log('WARN', message, context);
  },

  error(message, context = {}) {
    log('ERROR', message, context);
  }
};
