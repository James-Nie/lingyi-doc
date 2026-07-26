import React, { createContext, useContext } from 'react';
import type { SheetGridMode } from '../SheetGridView.types';
import { useSheetGridHost, type SheetGridHostValue } from './useSheetGridHost';

export type { SheetGridHostValue };

const SheetGridContext = createContext<SheetGridHostValue | null>(null);

export function useSheetGridContext(): SheetGridHostValue {
  const ctx = useContext(SheetGridContext);
  if (!ctx) {
    throw new Error('useSheetGridContext must be used within SheetGridHost');
  }
  return ctx;
}

export const SheetGridHost: React.FC<{
  mode: SheetGridMode;
  children: React.ReactNode;
}> = ({ mode, children }) => {
  const host = useSheetGridHost(mode);
  return (
    <SheetGridContext.Provider value={host}>
      {children}
    </SheetGridContext.Provider>
  );
};
