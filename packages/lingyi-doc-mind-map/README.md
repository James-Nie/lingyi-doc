# @lingyi-doc/mind-map

Canvas 思维导图引擎（Open Core 首发包）。依赖 `@lingyi-doc/core-mindmap`，**不依赖**任何商业包（`ai-ui` / `editor-pro` / `server` / `web`）。

## 安装

```bash
npm install @lingyi-doc/mind-map @lingyi-doc/core-mindmap
```

## 最小用法

```ts
import { MindmapEngine } from '@lingyi-doc/mind-map';
import { createEmptyMindNode } from '@lingyi-doc/core-mindmap';

const root = createEmptyMindNode('中心主题');
root.children = [
  createEmptyMindNode('分支 A'),
  createEmptyMindNode('分支 B'),
];

const engine = new MindmapEngine({
  mode: 'standalone',
  root,
  structure: 'right',
  branchStyle: 'straight',
});

const canvas = document.querySelector('canvas')!;
engine.fitView(canvas.width, canvas.height);
engine.paintStandalone(canvas.getContext('2d')!, canvas.width, canvas.height);
```

## React

见 [`@lingyi-doc/mind-map-react`](../lingyi-doc-mind-map-react/README.md) 与仓库内 `examples/mind-map-demo`。

## 许可

Apache-2.0（计划）。商业 AI / 协作云能力不在本包范围内。
