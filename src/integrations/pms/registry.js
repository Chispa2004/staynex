import { ApaleoPmsConnector } from './apaleo/apaleo-pms-connector.js';
import { PlurielPmsConnector } from './pluriel/pluriel-pms-connector.js';
import { UbikosPmsConnector } from './ubikos/ubikos-pms-connector.js';
import { MewsPmsConnector } from './mews/mews-pms-connector.js';
import { CloudbedsPmsConnector } from './cloudbeds/cloudbeds-pms-connector.js';

export const PMS_CONNECTORS = {
  apaleo: {
    key: 'apaleo',
    name: 'Apaleo',
    status: 'connected',
    statusLabel: 'Connected',
    authType: 'oauth_client_credentials',
    defaultBaseUrl: 'https://api.apaleo.com',
    region: 'Europe',
    type: 'Cloud PMS',
    readiness: 'Production connector',
    configurationMode: 'credentials',
    adapter: ApaleoPmsConnector
  },
  pluriel: {
    key: 'pluriel',
    name: 'Pluriel',
    status: 'beta',
    statusLabel: 'Beta connector',
    region: 'Popular in Morocco',
    type: 'Hotel PMS',
    readiness: 'Beta adapter scaffold ready',
    configurationMode: 'intake',
    adapter: PlurielPmsConnector
  },
  ubikos: {
    key: 'ubikos',
    name: 'Ubikos',
    status: 'coming_soon',
    statusLabel: 'Coming soon',
    region: 'Morocco',
    type: 'Riads & boutique hotels',
    readiness: 'Discovery placeholder',
    configurationMode: 'preview',
    adapter: UbikosPmsConnector
  },
  mews: {
    key: 'mews',
    name: 'Mews',
    status: 'coming_soon',
    statusLabel: 'Available soon',
    region: 'Europe / Global',
    type: 'Cloud PMS',
    readiness: 'Adapter scaffold ready',
    configurationMode: 'preview',
    adapter: MewsPmsConnector
  },
  cloudbeds: {
    key: 'cloudbeds',
    name: 'Cloudbeds',
    status: 'coming_soon',
    statusLabel: 'Available soon',
    region: 'Global',
    type: 'Cloud PMS',
    readiness: 'Adapter scaffold ready',
    configurationMode: 'preview',
    adapter: CloudbedsPmsConnector
  },
  opera_cloud: {
    key: 'opera_cloud',
    name: 'Opera Cloud',
    status: 'coming_soon',
    statusLabel: 'Coming soon',
    region: 'Global',
    type: 'Enterprise PMS',
    readiness: 'Enterprise roadmap',
    configurationMode: 'preview'
  },
  protel: {
    key: 'protel',
    name: 'Protel',
    status: 'coming_soon',
    statusLabel: 'Coming soon',
    region: 'Europe / MENA',
    type: 'Hotel PMS',
    readiness: 'Adapter planned',
    configurationMode: 'preview'
  },
  roomraccoon: {
    key: 'roomraccoon',
    name: 'RoomRaccoon',
    status: 'coming_soon',
    statusLabel: 'Coming soon',
    region: 'Europe / Global',
    type: 'Cloud PMS',
    readiness: 'Adapter planned',
    configurationMode: 'preview'
  }
};

export const listPmsConnectors = () => Object.values(PMS_CONNECTORS).map(({ adapter, ...connector }) => connector);

export const getPmsConnectorDefinition = (provider = 'apaleo') => PMS_CONNECTORS[provider] || null;

export const isPmsConnectorConfigurable = (provider = 'apaleo') => (
  getPmsConnectorDefinition(provider)?.configurationMode === 'credentials'
);

export const createPmsConnector = (provider = 'apaleo', options = {}) => {
  const definition = getPmsConnectorDefinition(provider);

  if (!definition) {
    throw new Error(`Unsupported PMS provider: ${provider}`);
  }

  if (!definition.adapter) {
    return null;
  }

  return new definition.adapter(options);
};
