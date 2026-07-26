import { createContext, useContext } from 'react';
import type { BaseGridContextValue } from './baseGridContext.types';

export type { BaseGridContextValue };

const BaseGridContext = createContext<BaseGridContextValue | null>(null);

export function useBaseGridContext(): BaseGridContextValue {
  const ctx = useContext(BaseGridContext);
  if (!ctx) {
    throw new Error('useBaseGridContext must be used within BaseGridOrchestrator');
  }
  return ctx;
}

export function useBaseGridContextOptional(): BaseGridContextValue | null {
  return useContext(BaseGridContext);
}

export { BaseGridContext };
