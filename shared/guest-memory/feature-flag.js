export const GUEST_MEMORY_ENV_VAR = 'GUEST_MEMORY_ENABLED';

export const isGuestMemoryEnabled = (env = process.env) => (
  env?.[GUEST_MEMORY_ENV_VAR] === 'true'
);

export const getGuestMemoryPilotStatus = (env = process.env) => ({
  enabled: isGuestMemoryEnabled(env),
  envVar: GUEST_MEMORY_ENV_VAR,
  defaultBehavior: 'disabled',
  status: isGuestMemoryEnabled(env) ? 'enabled' : 'disabled'
});

export const guestMemoryDisabledResult = (action = 'skipped') => ({
  disabled: true,
  status: 'feature_disabled',
  action
});
