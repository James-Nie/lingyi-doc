import type { SheetContainerProps } from './SheetContainer.types';

export type SheetGridMode = 'base' | 'freeform';

/** @deprecated 使用 BaseGridView / FreeformGridView */
export type SheetGridViewProps = SheetContainerProps & { mode: SheetGridMode };
