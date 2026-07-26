# @lingyi-doc/mind-map-react

`@lingyi-doc/mind-map` 的 React 封装（`MindmapView` 等）。Open Core 首发包之一，无商业依赖。

## 安装

```bash
npm install @lingyi-doc/mind-map-react @lingyi-doc/mind-map @lingyi-doc/core-mindmap react react-dom
```

## 最小用法

```tsx
import { useState } from 'react';
import { MindmapView } from '@lingyi-doc/mind-map-react';
import { createEmptyMindNode } from '@lingyi-doc/core-mindmap';
import { applyMindmapAction } from '@lingyi-doc/mind-map';
import type { MindNode } from '@lingyi-doc/core-mindmap';

export function Demo() {
  const [root, setRoot] = useState<MindNode>(() => {
    const r = createEmptyMindNode('中心主题');
    r.children = [createEmptyMindNode('想法 1'), createEmptyMindNode('想法 2')];
    return r;
  });

  return (
    <div style={{ height: '100vh' }}>
      <MindmapView
        root={root}
        structure="right"
        branchStyle="straight"
        fitOnInit
        onRootChange={(next) => setRoot(next)}
        onAction={(action, nodeId) => {
          const result = applyMindmapAction(root, nodeId, action);
          if (result) setRoot(result.root);
        }}
      />
    </div>
  );
}
```

离线 Demo：`examples/mind-map-demo`（无需账号）。

## 许可

Apache-2.0（计划）。
