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

const ownerPermissions = ['all'];

const rolePermissions = {
  owner: ownerPermissions,
  admin: ownerPermissions,
  manager: [
    'dashboard',
    'inbox',
    'tickets',
    'department_views',
    'reservations',
    'guest_memory',
    'upsells',
    'analytics',
    'automations',
    'knowledge_base',
    'qr_rooms',
    'onboarding',
    'pms_connections_read',
    'settings'
  ],
  receptionist: [
    'dashboard',
    'inbox',
    'tickets',
    'reservations_read',
    'guest_memory_limited'
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
    'dashboard',
    'analytics',
    'revenue_read',
    'upsells_read',
    'reservations_read'
  ]
};

const routeRules = [
  { pattern: /^\/dashboard\/settings\/users(?:\/.*)?$/, permission: 'user_management' },
  { pattern: /^\/dashboard\/settings\/pms(?:\/.*)?$/, permission: 'pms_connections' },
  { pattern: /^\/dashboard\/ai-logs(?:\/.*)?$/, permission: 'ai_logs' },
  { pattern: /^\/dashboard\/upsells(?:\/.*)?$/, permission: 'upsells' },
  { pattern: /^\/dashboard\/automations(?:\/.*)?$/, permission: 'automations' },
  { pattern: /^\/dashboard\/analytics(?:\/.*)?$/, permission: 'analytics' },
  { pattern: /^\/dashboard\/guest-memory(?:\/.*)?$/, permission: 'guest_memory' },
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
    pms_connections: 'pms_connections_read',
    housekeeping: 'tickets_housekeeping',
    maintenance: 'tickets_maintenance'
  };
  const alias = aliases[permission];

  if (Array.isArray(alias)) {
    return alias.some((item) => permissions.includes(item));
  }

  return alias ? permissions.includes(alias) : false;
};

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
