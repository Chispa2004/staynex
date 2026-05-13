import 'dotenv/config';
import { logger } from '../utils/logger.js';

const AI_REQUIRED = [
  'OPENAI_API_KEY'
];

const CORE_REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY'
];

const TWILIO_REQUIRED = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WHATSAPP_FROM'
];

const maskValue = (value) => {
  if (!value) {
    return 'missing';
  }

  if (value.length <= 8) {
    return 'configured';
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const inspectVariables = (names) => names.map((name) => ({
  name,
  configured: Boolean(process.env[name]),
  value: maskValue(process.env[name])
}));

export const getEnvironmentReport = () => {
  const ai = inspectVariables(AI_REQUIRED);
  const core = inspectVariables(CORE_REQUIRED);
  const twilio = inspectVariables(TWILIO_REQUIRED);
  const useMockAi = process.env.USE_MOCK_AI === 'true';

  return {
    port: process.env.PORT || '3000',
    ai,
    core,
    twilio,
    missingAi: ai.filter((item) => !item.configured).map((item) => item.name),
    missingCore: core.filter((item) => !item.configured).map((item) => item.name),
    missingTwilio: twilio.filter((item) => !item.configured).map((item) => item.name),
    requireTwilio: process.env.REQUIRE_TWILIO === 'true',
    useMockAi
  };
};

export const validateEnvironment = ({ exitOnError = false } = {}) => {
  const report = getEnvironmentReport();
  const fatalMissing = [
    ...(report.useMockAi ? [] : report.missingAi),
    ...report.missingCore,
    ...(report.requireTwilio ? report.missingTwilio : [])
  ];

  logger.info('Validating environment configuration', {
    port: report.port,
    useMockAi: report.useMockAi,
    requireTwilio: report.requireTwilio
  });

  report.ai.forEach((item) => {
    logger[item.configured ? 'info' : report.useMockAi ? 'warn' : 'error'](`ENV ${item.name}`, {
      status: item.configured ? 'configured' : 'missing',
      value: item.value,
      note: report.useMockAi ? 'Not required while USE_MOCK_AI=true' : 'Required when USE_MOCK_AI=false'
    });
  });

  report.core.forEach((item) => {
    logger[item.configured ? 'info' : 'error'](`ENV ${item.name}`, {
      status: item.configured ? 'configured' : 'missing',
      value: item.value
    });
  });

  report.twilio.forEach((item) => {
    logger[item.configured ? 'info' : 'warn'](`ENV ${item.name}`, {
      status: item.configured ? 'configured' : 'missing',
      value: item.value,
      note: item.configured ? 'WhatsApp sending enabled' : 'Not required for local /test-message'
    });
  });

  if (fatalMissing.length > 0) {
    const message = `Missing required environment variables: ${fatalMissing.join(', ')}`;
    logger.error(message);

    if (exitOnError) {
      process.exit(1);
    }

    throw new Error(message);
  }

  logger.info('Environment configuration ready');
  return report;
};
