import JSZip from 'jszip';

export async function loadDocxZip(arrayBuffer: ArrayBuffer): Promise<JSZip> {
  return JSZip.loadAsync(arrayBuffer);
}

export async function readZipText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path);
  if (!file) return null;
  return file.async('text');
}

export async function readZipBytes(zip: JSZip, path: string): Promise<Uint8Array | null> {
  const file = zip.file(path);
  if (!file) return null;
  return file.async('uint8array');
}

export function parseRelationships(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  for (const rel of Array.from(doc.getElementsByTagName('*')).filter(el => el.localName === 'Relationship')) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target) map.set(id, target);
  }
  return map;
}

export function resolveDocxPath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const baseParts = baseDir.split('/').filter(Boolean);
  for (const part of target.split('/')) {
    if (part === '..') baseParts.pop();
    else if (part !== '.') baseParts.push(part);
  }
  return baseParts.join('/');
}

export function elementsByLocalName(root: Element | Document, name: string): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter(el => el.localName === name);
}

export function firstByLocalName(root: Element | Document, name: string): Element | null {
  return elementsByLocalName(root, name)[0] ?? null;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function guessMime(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'bmp': return 'image/bmp';
    case 'webp': return 'image/webp';
    case 'svg': return 'image/svg+xml';
    case 'emf': return 'image/emf';
    case 'wmf': return 'image/wmf';
    default: return 'application/octet-stream';
  }
}

export function emuToPx(emu: string | null | undefined, fallback = 480): number {
  const n = Number(emu);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(80, Math.min(760, Math.round(n / 914400 * 96)));
}
