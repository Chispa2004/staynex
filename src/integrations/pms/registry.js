import { ApaleoPmsConnector } from './apaleo/apaleo-pms-connector.js';
import { PlurielPmsConnector } from './pluriel/pluriel-pms-connector.js';
import { UbikosPmsConnector } from './ubikos/ubikos-pms-connector.js';
import { MewsPmsConnector } from './mews/mews-pms-connector.js';
import { CloudbedsPmsConnector } from './cloudbeds/cloudbeds-pms-connector.js';

export const PMS_CONNECTORS = {
  apaleo: {
    key: 'apaleo',
    name: 'Apaleo',
    status: 'live_api',
    statusLabel: 'Live API',
    authType: 'oauth_client_credentials',
    defaultBaseUrl: 'https://api.apaleo.com',
    region: 'Europe',
    type: 'Cloud PMS',
    readiness: 'Production connector',
    configurationMode: 'live_api',
    adapter: ApaleoPmsConnector
  },
  pluriel: {
    key: 'pluriel',
    name: 'Pluriel',
    status: 'setup_available',
    statusLabel: 'Setup available',
    region: 'Popular in Morocco',
    type: 'Hotel PMS',
    readiness: 'API credentials required',
    configurationMode: 'manual_setup',
    adapter: PlurielPmsConnector
  },
  ubikos: {
    key: 'ubikos',
    name: 'Ubikos',
    status: 'setup_available',
    statusLabel: 'Setup available',
    region: 'Morocco',
    type: 'Riads & boutique hotels',
    readiness: 'Manual setup available',
    configurationMode: 'manual_setup',
    adapter: UbikosPmsConnector
  },
  mews: {
    key: 'mews',
    name: 'Mews',
    status: 'setup_available',
    statusLabel: 'Setup available',
    region: 'Europe / Global',
    type: 'Cloud PMS',
    readiness: 'Connector activation required',
    configurationMode: 'manual_setup',
    adapter: MewsPmsConnector
  },
  cloudbeds: {
    key: 'cloudbeds',
    name: 'Cloudbeds',
    status: 'setup_available',
    statusLabel: 'Setup available',
    region: 'Global',
    type: 'Cloud PMS',
    readiness: 'Connector activation required',
    configurationMode: 'manual_setup',
    adapter: CloudbedsPmsConnector
  },
  opera_cloud: {
    key: 'opera_cloud',
    name: 'Opera Cloud',
    status: 'setup_available',
    statusLabel: 'Setup available',
    region: 'Global',
    type: 'Enterprise PMS',
    readiness: 'Connector activation required',
    configurationMode: 'manual_setup'
  },
  protel: {
    key: 'protel',
    name: 'Protel',
    status: 'setup_available',
    statusLabel: 'Setup available',
    region: 'Europe / MENA',
    type: 'Hotel PMS',
    readiness: 'Manual setup available',
    configurationMode: 'manual_setup'
  },
  roomraccoon: {
    key: 'roomraccoon',
    name: 'RoomRaccoon',
    status: 'setup_available',
    statusLabel: 'Setup available',
    region: 'Europe / Global',
    type: 'Cloud PMS',
    readiness: 'Connector activation required',
    configurationMode: 'manual_setup'
  }
};

export const listPmsConnectors = () => Object.values(PMS_CONNECTORS).map(({ adapter, ...connector }) => connector);

export const getPmsConnectorDefinition = (provider = 'apaleo') => PMS_CONNECTORS[provider] || null;

export const isPmsConnectorConfigurable = (provider = 'apaleo') => (
  ['live_api', 'manual_setup', 'csv_import'].includes(getPmsConnectorDefinition(provider)?.configurationMode)
);

export const isPmsConnectorLiveApi = (provider = 'apaleo') => (
  getPmsConnectorDefinition(provider)?.configurationMode === 'live_api'
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
