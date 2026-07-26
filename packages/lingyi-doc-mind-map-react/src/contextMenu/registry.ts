import type {
  MindmapContextMenuContext,
  MindmapContextMenuEntry,
  MindmapContextMenuPlugin,
  MindmapContextMenuRegistry,
} from './types';

function matchesTarget(
  plugin: MindmapContextMenuPlugin,
  target: MindmapContextMenuContext['target'],
): boolean {
  if (!plugin.targets || plugin.targets.length === 0) return true;
  return plugin.targets.includes(target);
}

/** 创建可插拔右键菜单注册表 */
export function createMindmapContextMenuRegistry(
  initial: MindmapContextMenuPlugin[] = [],
): MindmapContextMenuRegistry {
  const plugins: MindmapContextMenuPlugin[] = [...initial];

  const sorted = () =>
    [...plugins].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

  return {
    register(plugin) {
      const idx = plugins.findIndex(p => p.id === plugin.id);
      if (idx >= 0) plugins.splice(idx, 1);
      plugins.push(plugin);
      return () => {
        const i = plugins.findIndex(p => p.id === plugin.id);
        if (i >= 0) plugins.splice(i, 1);
      };
    },
    unregister(pluginId) {
      const i = plugins.findIndex(p => p.id === pluginId);
      if (i >= 0) plugins.splice(i, 1);
    },
    list() {
      return sorted();
    },
    resolve(ctx) {
      const entries: MindmapContextMenuEntry[] = [];
      for (const plugin of sorted()) {
        if (!matchesTarget(plugin, ctx.target)) continue;
        const chunk = plugin.contribute(ctx);
        if (!chunk.length) continue;
        if (entries.length > 0) {
          const last = entries[entries.length - 1];
          const first = chunk[0];
          if (last.type !== 'separator' && first.type !== 'separator') {
            entries.push({ type: 'separator', id: `sep:${plugin.id}` });
          }
        }
        entries.push(...chunk);
      }
      // 去掉首尾与连续分隔线
      const cleaned: MindmapContextMenuEntry[] = [];
      for (const entry of entries) {
        if (entry.type === 'separator') {
          if (cleaned.length === 0) continue;
          if (cleaned[cleaned.length - 1].type === 'separator') continue;
          cleaned.push(entry);
        } else {
          cleaned.push(entry);
        }
      }
      while (cleaned.length && cleaned[cleaned.length - 1].type === 'separator') {
        cleaned.pop();
      }
      return cleaned;
    },
    async execute(actionId, ctx) {
      for (const plugin of sorted()) {
        if (!matchesTarget(plugin, ctx.target)) continue;
        if (!plugin.execute) continue;
        const handled = await plugin.execute(actionId, ctx);
        if (handled) return true;
      }
      return false;
    },
  };
}
