import React, { createContext, useContext } from 'react';

/** 撤销/重做时递增，用于强制同步 contentEditable DOM */
export const DocHistoryRevisionContext = createContext(0);

export function useDocHistoryRevision(): number {
  return useContext(DocHistoryRevisionContext);
}

export const DocHistoryRevisionProvider = DocHistoryRevisionContext.Provider;
