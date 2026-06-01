const ACTIVE_WORKSPACE_KEY = 'staynex_active_workspace_id';
const ACTIVE_WORKSPACE_META_KEY = 'staynex_active_workspace';
const ACTIVE_WORKSPACE_COOKIE = 'staynex_active_hotel_id';
export const WORKSPACE_SELECTION_EVENT = 'staynex:workspace-selection-changed';

const isBrowser = () => typeof window !== 'undefined';

const getWorkspaceIdFromLocation = () => {
  if (!isBrowser()) {
    return null;
  }

  const params = new URLSearchParams(window.location.search || '');
  return params.get('hotelId')
    || params.get('hotel')
    || params.get('workspace')
    || params.get('tenant')
    || null;
};

export const getActiveWorkspace = () => {
  if (!isBrowser()) {
    return {
      hotelId: null,
      workspace: null
    };
  }

  const hotelId = getWorkspaceIdFromLocation() || window.localStorage.getItem(ACTIVE_WORKSPACE_KEY);
  const rawWorkspace = window.localStorage.getItem(ACTIVE_WORKSPACE_META_KEY);

  try {
    return {
      hotelId,
      workspace: rawWorkspace ? JSON.parse(rawWorkspace) : null
    };
  } catch {
    return {
      hotelId,
      workspace: null
    };
  }
};

export const persistWorkspaceSelection = ({ hotelId, workspace, notify = false }) => {
  if (!isBrowser() || !hotelId) {
    return;
  }

  window.localStorage.setItem(ACTIVE_WORKSPACE_KEY, hotelId);

  if (workspace) {
    window.localStorage.setItem(ACTIVE_WORKSPACE_META_KEY, JSON.stringify(workspace));
  }

  document.cookie = `${ACTIVE_WORKSPACE_COOKIE}=${encodeURIComponent(hotelId)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;

  if (notify) {
    window.dispatchEvent(new CustomEvent(WORKSPACE_SELECTION_EVENT, {
      detail: {
        hotelId,
        workspace: workspace || null
      }
    }));
  }
};

export const notifyWorkspaceSelectionChanged = ({ hotelId, workspace = null } = {}) => {
  if (!isBrowser() || !hotelId) {
    return;
  }

  window.dispatchEvent(new CustomEvent(WORKSPACE_SELECTION_EVENT, {
    detail: { hotelId, workspace }
  }));
};

export const clearWorkspaceSelection = () => {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(ACTIVE_WORKSPACE_KEY);
  window.localStorage.removeItem(ACTIVE_WORKSPACE_META_KEY);
  document.cookie = `${ACTIVE_WORKSPACE_COOKIE}=; path=/; max-age=0; samesite=lax`;
};

export const validateWorkspaceAccess = ({ hotelId, availableHotels = [] }) => {
  if (!hotelId) {
    return false;
  }

  return availableHotels.some((assignment) => assignment.hotel?.id === hotelId);
};

export const getWorkspaceRequestHeaders = () => {
  const { hotelId } = getActiveWorkspace();
  return hotelId ? { 'x-staynex-hotel-id': hotelId } : {};
};

export const switchWorkspace = async ({ hotelId, accessToken }) => {
  const response = await fetch('/api/current-hotel', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'Content-Type': 'application/json',
      'x-staynex-hotel-id': hotelId
    },
    body: JSON.stringify({ hotelId })
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error || 'Could not switch workspace');
  }

  persistWorkspaceSelection({
    hotelId,
    workspace: {
      hotel: body.hotel,
      role: body.role,
      hotelUser: body.hotelUser
    }
  });

  return body;
};
