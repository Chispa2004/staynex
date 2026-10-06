'use client';
import {createContext,useContext} from 'react';
export const WorkspaceReadyContext=createContext(null);
export const useWorkspaceReady=()=>useContext(WorkspaceReadyContext);
