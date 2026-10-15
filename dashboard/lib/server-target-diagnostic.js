import 'server-only';

// Temporary, private runtime evidence. Call only AFTER an authorized read.
// Each serverless module instance attempts one log; this is not a global limit.
let attempted = false;

const projectRefFromClient = (client) => {
  const value = client?.supabaseUrl;
  if (typeof value !== 'string' || value.length > 256) return 'not_accredited';
  // Reject URL normalization tricks, credentials, paths, query strings and custom hosts.
  if (!/^https:\/\/[a-z]{20}\.supabase\.co\/?$/.test(value)) return 'not_accredited';
  const url = new URL(value);
  return url.hostname.slice(0, 20);
};

export const recordCurrentHotelServerTarget = (client) => {
  if (attempted) return;
  attempted = true; // Also bound failures/re-entrant loggers; never retry on every request.
  try {
    const environment = ['production', 'preview', 'development'].includes(process.env.VERCEL_ENV)
      ? process.env.VERCEL_ENV : 'unknown';
    const deployment = /^[a-f0-9]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA || '')
      ? process.env.VERCEL_GIT_COMMIT_SHA
      : /^dpl_[A-Za-z0-9]{20,40}$/.test(process.env.VERCEL_DEPLOYMENT_ID || '')
        ? process.env.VERCEL_DEPLOYMENT_ID : 'unavailable';
    console.info(JSON.stringify({
      event: 'staynex_server_supabase_target_v1',
      client: 'dashboard.getSupabaseAdmin.GET_current_hotel',
      environment,
      deployment,
      projectRef: projectRefFromClient(client)
    }));
  } catch {
    // Diagnostics cannot change a response or disclose an exception/configuration.
  }
};
