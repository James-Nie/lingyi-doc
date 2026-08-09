/** 稳定序列化，用于 diff / hash 对比 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.keys(val as object).sort().reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = (val as Record<string, unknown>)[k];
        return acc;
      }, {});
    }
    return val;
  });
}

export function hashSnapshot(snapshot: Record<string, unknown>): string {
  return stableStringify(snapshot);
}

export function cloneSnapshot(snapshot: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
}
