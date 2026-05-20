export const PMS_PROVIDER_CATALOG = [
  {
    key: 'apaleo',
    name: 'Apaleo',
    status: 'live_api',
    statusLabel: 'Live API',
    readiness: 'Production connector',
    region: 'Europe',
    type: 'Cloud PMS',
    defaultBaseUrl: 'https://api.apaleo.com',
    configurationMode: 'live_api',
    commonUse: 'Modern hotel groups and serviced apartments'
  },
  {
    key: 'pluriel',
    name: 'Pluriel',
    status: 'setup_available',
    statusLabel: 'Setup available',
    readiness: 'API credentials required',
    region: 'Popular in Morocco',
    type: 'Hotel PMS',
    configurationMode: 'manual_setup',
    commonUse: 'Morocco hotels and local operators'
  },
  {
    key: 'ubikos',
    name: 'Ubikos',
    status: 'setup_available',
    statusLabel: 'Setup available',
    readiness: 'Manual setup available',
    region: 'Morocco',
    type: 'Riads & boutique hotels',
    configurationMode: 'manual_setup',
    commonUse: 'Riads, boutique hotels and independent properties'
  },
  {
    key: 'mews',
    name: 'Mews',
    status: 'setup_available',
    statusLabel: 'Setup available',
    readiness: 'Connector activation required',
    region: 'Europe / Global',
    type: 'Cloud PMS',
    configurationMode: 'manual_setup',
    commonUse: 'Modern hotels and hybrid accommodation'
  },
  {
    key: 'cloudbeds',
    name: 'Cloudbeds',
    status: 'setup_available',
    statusLabel: 'Setup available',
    readiness: 'Connector activation required',
    region: 'Global',
    type: 'Cloud PMS',
    configurationMode: 'manual_setup',
    commonUse: 'Independent hotels and hostels'
  },
  {
    key: 'opera_cloud',
    name: 'Opera Cloud',
    status: 'setup_available',
    statusLabel: 'Setup available',
    readiness: 'Connector activation required',
    region: 'Global',
    type: 'Enterprise PMS',
    configurationMode: 'manual_setup',
    commonUse: 'Large hotels and enterprise groups'
  },
  {
    key: 'protel',
    name: 'Protel',
    status: 'setup_available',
    statusLabel: 'Setup available',
    readiness: 'Manual setup available',
    region: 'Europe / MENA',
    type: 'Hotel PMS',
    configurationMode: 'manual_setup',
    commonUse: 'Independent and mid-market hotels'
  },
  {
    key: 'roomraccoon',
    name: 'RoomRaccoon',
    status: 'setup_available',
    statusLabel: 'Setup available',
    readiness: 'Connector activation required',
    region: 'Europe / Global',
    type: 'Cloud PMS',
    configurationMode: 'manual_setup',
    commonUse: 'Boutique hotels and small groups'
  }
];

export const getPmsProvider = (key) => PMS_PROVIDER_CATALOG.find((provider) => provider.key === key);

export const isPmsProviderConfigurable = (provider) => ['live_api', 'manual_setup', 'csv_import'].includes(provider?.configurationMode);
export const isPmsProviderLiveApi = (provider) => provider?.configurationMode === 'live_api';
