'use client';

import { PmsConnectionsClient } from '@/components/PmsConnectionsClient';

// Wizard and settings share actions, permissions and evidence.
export const StepPmsConnection = ({onConfigurationChanged}) => <PmsConnectionsClient embedded onConfigurationChanged={onConfigurationChanged} />;
