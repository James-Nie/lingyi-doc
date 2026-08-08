export function estimateJsonBytes(data: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(data ?? null), 'utf8');
  } catch {
    return 0;
  }
}

export function estimateSaveDelta(body: Record<string, unknown>, existingStorage: number): number {
  const payload = body.data ?? body;
  return estimateJsonBytes(payload) - existingStorage;
}

/** patch 请求体体积作为存储增长上界（保守） */
export function estimatePatchDelta(body: Record<string, unknown>): number {
  return estimateJsonBytes(body);
}
