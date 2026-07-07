import { useCallback, useState } from 'react';

export function useSidebarContextMenu() {
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);

  const closeMenu = useCallback(() => {
    setMenuItemId(null);
    setMenuAnchor(null);
  }, []);

  const openMenuAt = useCallback((itemId: string, anchor: DOMRect) => {
    setMenuItemId(itemId);
    setMenuAnchor(anchor);
    setHoveredItemId(itemId);
  }, []);

  const openMenu = useCallback((itemId: string, btn: HTMLButtonElement) => {
    openMenuAt(itemId, btn.getBoundingClientRect());
  }, [openMenuAt]);

  const handleMenuClose = useCallback(() => {
    closeMenu();
    setHoveredItemId(null);
  }, [closeMenu]);

  return {
    hoveredItemId,
    setHoveredItemId,
    menuItemId,
    menuAnchor,
    openMenu,
    openMenuAt,
    closeMenu,
    handleMenuClose,
  };
}
