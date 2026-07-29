export const getInternalApiHeaders = (headers = {}) => {
  const token = process.env.STAYNEX_INTERNAL_API_TOKEN;

  if (!token) {
    throw new Error('STAYNEX_INTERNAL_API_TOKEN is not configured for internal API calls');
  }

  return {
    ...headers,
    'x-staynex-internal-token': token
  };
};

export const areServerTestRoutesEnabled = () => (
  process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_ROUTES === 'true'
);
