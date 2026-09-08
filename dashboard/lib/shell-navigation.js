'use client';

import { createContext, useContext } from 'react';

// Presentation state only; never used to decide which routes a user can access.
export const ShellNavigationContext = createContext(null);
export const useShellNavigation = () => useContext(ShellNavigationContext);
