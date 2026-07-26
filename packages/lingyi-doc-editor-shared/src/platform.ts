export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

export function modShortcut(key: string): string {
  return isMacPlatform() ? `⌘ ${key}` : `Ctrl+${key}`;
}

export function redoShortcut(): string {
  return isMacPlatform() ? '⌘ Shift Z' : 'Ctrl+Y';
}

export function headingShortcut(level: number): string {
  return isMacPlatform() ? `⌥ ⌘ ${level}` : `Ctrl+Alt+${level}`;
}
