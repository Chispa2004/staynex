export const ROLES = [
  'owner',
  'admin',
  'manager',
  'receptionist',
  'housekeeping',
  'maintenance',
  'analyst'
];

export const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  receptionist: 'Receptionist',
  housekeeping: 'Housekeeping',
  maintenance: 'Maintenance',
  analyst: 'Analyst'
};

export const PLATFORM_ROLES = ['super_admin', 'platform_admin', 'internal_only', 'support', 'none'];

export const PLATFORM_ROLE_LABELS = {
  super_admin: 'Super admin',
  platform_admin: 'Platform admin',
  internal_only: 'Internal QA',
  support: 'Support',
  none: 'Hotel workspace'
};

const hotelAdminPermissions = [
  'dashboard',
  'inbox',
  'tickets',
  'department_views',
  'reservations',
  'reservations_manage',
  'guest_memory',
  'guest_memory_page',
  'upsells',
  'upsells_manage',
  'experiences',
  'experiences_manage',
  'local_knowledge',
  'local_knowledge_manage',
  'experience_bookings',
  'experience_bookings_manage',
  'analytics',
  'simulation',
  'automations',
  'knowledge_base',
  'qr_rooms',
  'onboarding',
  'academy',
  'pms_connections',
  'pms_connections_manage',
  'settings',
  'user_management',
  'ai_logs'
];

const rolePermissions = {
  owner: hotelAdminPermissions,
  admin: hotelAdminPermissions,
  manager: [
    'dashboard',
    'inbox',
    'tickets',
    'department_views',
    'reservations',
    'reservations_manage',
    'guest_memory',
    'guest_memory_page',
    'upsells',
    'upsells_manage',
    'experiences',
    'experiences_manage',
    'local_knowledge',
    'local_knowledge_manage',
    'experience_bookings',
    'experience_bookings_manage',
    'analytics',
    'simulation',
    'automations',
    'knowledge_base',
    'qr_rooms',
    'academy',
    'pms_connections'
  ],
  receptionist: [
    'inbox',
    'tickets',
    'reservations_read',
    'guest_memory_limited',
    'experiences',
    'experiences_manage',
    'local_knowledge',
    'local_knowledge_manage',
    'experience_bookings',
    'experience_bookings_manage',
    'academy'
  ],
  housekeeping: [
    'housekeeping',
    'tickets_housekeeping'
  ],
  maintenance: [
    'maintenance',
    'tickets_maintenance'
  ],
  analyst: [
    'analytics',
    'revenue_read',
    'upsells_read',
    'reservations_read'
  ]
};

const platformPermissions = {
  super_admin: [
    'workspace_switch',
    'workspace_create',
    'platform_console',
    'tenant_support',
    'ai_quality'
  ],
  platform_admin: [
    'workspace_switch',
    'workspace_create',
    'platform_console',
    'tenant_support',
    'ai_quality'
  ],
  internal_only: [
    'workspace_switch',
    'platform_console',
    'ai_quality'
  ],
  support: [
    'workspace_switch',
    'tenant_support'
  ],
  none: []
};

const routeRules = [
  { pattern: /^\/dashboard\/settings\/users(?:\/.*)?$/, permission: 'user_management' },
  { pattern: /^\/dashboard\/settings\/pms(?:\/.*)?$/, permission: 'pms_connections' },
  { pattern: /^\/dashboard\/settings\/academy(?:\/.*)?$/, permission: 'academy' },
  { pattern: /^\/dashboard\/ai-logs(?:\/.*)?$/, permission: 'ai_logs' },
  { pattern: /^\/dashboard\/upsells(?:\/.*)?$/, permission: 'upsells' },
  { pattern: /^\/dashboard\/experiences(?:\/.*)?$/, permission: 'experiences' },
  { pattern: /^\/dashboard\/local-knowledge(?:\/.*)?$/, permission: 'local_knowledge' },
  { pattern: /^\/dashboard\/experience-bookings(?:\/.*)?$/, permission: 'experience_bookings' },
  { pattern: /^\/dashboard\/automations(?:\/.*)?$/, permission: 'automations' },
  { pattern: /^\/dashboard\/analytics(?:\/.*)?$/, permission: 'analytics' },
  { pattern: /^\/dashboard\/simulation(?:\/.*)?$/, permission: 'simulation' },
  { pattern: /^\/dashboard\/guest-memory(?:\/.*)?$/, permission: 'guest_memory_page' },
  { pattern: /^\/dashboard\/reservations(?:\/.*)?$/, permission: 'reservations' },
  { pattern: /^\/dashboard\/knowledge(?:\/.*)?$/, permission: 'knowledge_base' },
  { pattern: /^\/dashboard\/settings\/knowledge(?:\/.*)?$/, permission: 'knowledge_base' },
  { pattern: /^\/dashboard\/qr-rooms(?:\/.*)?$/, permission: 'qr_rooms' },
  { pattern: /^\/dashboard\/onboarding(?:\/.*)?$/, permission: 'onboarding' },
  { pattern: /^\/dashboard\/housekeeping(?:\/.*)?$/, permission: 'housekeeping' },
  { pattern: /^\/dashboard\/maintenance(?:\/.*)?$/, permission: 'maintenance' },
  { pattern: /^\/dashboard\/reception(?:\/.*)?$/, permission: 'reception' },
  { pattern: /^\/dashboard\/tickets(?:\/.*)?$/, permission: 'tickets' },
  { pattern: /^\/dashboard\/inbox(?:\/.*)?$/, permission: 'inbox' },
  { pattern: /^\/dashboard(?:\/)?$/, permission: 'dashboard' },
  { pattern: /^\/settings(?:\/.*)?$/, permission: 'settings' }
];

export const getPermissionsForRole = (role = 'receptionist') => {
  const normalizedRole = ROLES.includes(role) ? role : 'receptionist';
  return rolePermissions[normalizedRole] || rolePermissions.receptionist;
};

export const canAccess = (role, permission) => {
  const permissions = getPermissionsForRole(role);

  if (permissions.includes('all')) {
    return true;
  }

  if (permissions.includes(permission)) {
    return true;
  }

  const aliases = {
    reservations: 'reservations_read',
    guest_memory: 'guest_memory_limited',
    upsells: 'upsells_read',
    revenue: 'revenue_read',
    housekeeping: ['tickets_housekeeping', 'department_views'],
    maintenance: ['tickets_maintenance', 'department_views'],
    reception: 'department_views'
  };
  const alias = aliases[permission];

  if (Array.isArray(alias)) {
    return alias.some((item) => permissions.includes(item));
  }

  return alias ? permissions.includes(alias) : false;
};

export const getPermissionsForPlatformRole = (platformRole = 'none') => {
  const normalizedRole = PLATFORM_ROLES.includes(platformRole) ? platformRole : 'none';
  return platformPermissions[normalizedRole] || [];
};

export const canAccessPlatform = (platformRole, permission) => (
  getPermissionsForPlatformRole(platformRole).includes(permission)
);

export const getRoutePermission = (pathname = '') => (
  routeRules.find((rule) => rule.pattern.test(pathname))?.permission || 'dashboard'
);

export const canAccessRoute = (role, pathname = '') => canAccess(role, getRoutePermission(pathname));

export const filterNavigationByRole = (navigationGroups, role) => navigationGroups
  .map((group) => ({
    ...group,
    items: group.items.filter((item) => canAccessRoute(role, item.href))
  }))
  .filter((group) => group.items.length > 0);

export const getFirstAllowedRoute = (role) => {
  const roleDefaultRoutes = {
    owner: '/dashboard',
    admin: '/dashboard',
    manager: '/dashboard',
    receptionist: '/dashboard/inbox',
    housekeeping: '/dashboard/housekeeping',
    maintenance: '/dashboard/maintenance',
    analyst: '/dashboard/analytics'
  };
  const defaultRoute = roleDefaultRoutes[role];

  if (defaultRoute && canAccessRoute(role, defaultRoute)) {
    return defaultRoute;
  }

  const preferredRoutes = [
    '/dashboard',
    '/dashboard/inbox',
    '/dashboard/housekeeping',
    '/dashboard/maintenance',
    '/dashboard/tickets',
    '/dashboard/reservations',
    '/dashboard/analytics'
  ];

  return preferredRoutes.find((route) => canAccessRoute(role, route)) || '/dashboard';
};

export const getDefaultRouteForRole = getFirstAllowedRoute;
