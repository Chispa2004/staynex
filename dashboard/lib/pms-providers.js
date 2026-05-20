export const PMS_PROVIDER_CATALOG = [
  {
    key: 'apaleo',
    name: 'Apaleo',
    status: 'connected',
    statusLabel: 'Connected',
    readiness: 'Production connector',
    region: 'Europe',
    type: 'Cloud PMS',
    defaultBaseUrl: 'https://api.apaleo.com',
    configurationMode: 'credentials',
    commonUse: 'Modern hotel groups and serviced apartments'
  },
  {
    key: 'pluriel',
    name: 'Pluriel',
    status: 'beta',
    statusLabel: 'Beta connector',
    readiness: 'Beta intake ready',
    region: 'Popular in Morocco',
    type: 'Hotel PMS',
    configurationMode: 'intake',
    commonUse: 'Morocco hotels and local operators'
  },
  {
    key: 'ubikos',
    name: 'Ubikos',
    status: 'coming_soon',
    statusLabel: 'Coming soon',
    readiness: 'Discovery placeholder',
    region: 'Morocco',
    type: 'Riads & boutique hotels',
    configurationMode: 'preview',
    commonUse: 'Riads, boutique hotels and independent properties'
  },
  {
    key: 'mews',
    name: 'Mews',
    status: 'coming_soon',
    statusLabel: 'Available soon',
    readiness: 'Adapter scaffold ready',
    region: 'Europe / Global',
    type: 'Cloud PMS',
    configurationMode: 'preview',
    commonUse: 'Modern hotels and hybrid accommodation'
  },
  {
    key: 'cloudbeds',
    name: 'Cloudbeds',
    status: 'coming_soon',
    statusLabel: 'Available soon',
    readiness: 'Adapter scaffold ready',
    region: 'Global',
    type: 'Cloud PMS',
    configurationMode: 'preview',
    commonUse: 'Independent hotels and hostels'
  },
  {
    key: 'opera_cloud',
    name: 'Opera Cloud',
    status: 'coming_soon',
    statusLabel: 'Coming soon',
    readiness: 'Enterprise roadmap',
    region: 'Global',
    type: 'Enterprise PMS',
    configurationMode: 'preview',
    commonUse: 'Large hotels and enterprise groups'
  },
  {
    key: 'protel',
    name: 'Protel',
    status: 'coming_soon',
    statusLabel: 'Coming soon',
    readiness: 'Adapter planned',
    region: 'Europe / MENA',
    type: 'Hotel PMS',
    configurationMode: 'preview',
    commonUse: 'Independent and mid-market hotels'
  },
  {
    key: 'roomraccoon',
    name: 'RoomRaccoon',
    status: 'coming_soon',
    statusLabel: 'Coming soon',
    readiness: 'Adapter planned',
    region: 'Europe / Global',
    type: 'Cloud PMS',
    configurationMode: 'preview',
    commonUse: 'Boutique hotels and small groups'
  }
];

export const getPmsProvider = (key) => PMS_PROVIDER_CATALOG.find((provider) => provider.key === key);

export const isPmsProviderConfigurable = (provider) => provider?.configurationMode === 'credentials';
