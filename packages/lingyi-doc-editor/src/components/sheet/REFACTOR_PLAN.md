# SheetContainer 拆分任务清单

> 目标：按「普通表格 / 多维表」拆分，共享 Canvas 内核，对外 API 不变。

## 现状

| 指标 | 数值 |
|------|------|
| 主文件行数 | ~4450 |
| `isBaseSheet` / `isFreeformSheet` 分支 | ~100+ 处 |
| 调用方 | `BaseSheetEditor`、`FreeformSheetEditor`、`DocBaseBlock` |
| 共用比例 | Canvas/选区/剪贴板/滚动 ~60–70% |

---

## Phase A — 基础设施（零行为变更）

- [x] A1. 创建目录 `components/sheet/{shared,base,freeform}`
- [x] A2. `SheetContainer.types.ts` — 共用 Props
- [x] A3. `shared/sheetUtils.ts` — 纯函数（快捷键判断、复制选区、range 比较）
- [x] A4. `shared/index.ts` — barrel export
- [x] A5. 旧路径 `components/SheetContainer.tsx` 保留 re-export

## Phase B — 多维表逻辑抽离

- [x] B1. `base/useBaseGrouping.ts` — 分组布局、折叠、组内加记录、coord 映射
- [x] B2. `base/useBaseColumnMenu.ts` — 列头菜单回调（字段增删改、排序、分组）
- [x] B3. `base/useBaseRowTree.ts` — 子记录树、折叠状态
- [x] B4. `base/BaseGridOverlays.tsx` — 多维表 overlay JSX（376 行）
- [x] B5. `freeform/FreeformGridOverlays.tsx` — 普通表 overlay JSX（255 行）
- [x] B6. `shared/SheetSharedOverlays.tsx` — 共用 overlay（图表、填充柄、删除框）

## Phase C — 门面与类型容器

- [x] C1. `SheetContainer.tsx` — 按 `sheet.type` 路由
- [x] C2. `base/BaseGridContainer.tsx` — 多维表入口（`mode="base"`）
- [x] C3. `freeform/FreeformGridContainer.tsx` — 普通表入口（`mode="freeform"`）
- [x] C4. `SheetGridView.tsx` — 共享网格实现（~3774 行，含 Canvas + 交互）
- [x] C5. `SheetGridView.types.ts` — mode 类型

## Phase D — 渲染与交互策略化（后续迭代）

- [ ] D1. `shared/SheetCanvasHost.tsx` — viewport / layer / scheduleRender
- [x] D2. `base/baseRenderPass.ts` — performRender 多维表分支
- [x] D3. `freeform/freeformRenderPass.ts` — performRender 普通表分支
- [x] D3b. `shared/sharedRenderPass.ts` + `runSheetRenderPass.ts` — 共享层编排
- [x] D4. `shared/useSheetSelection.ts` — 选区 / 轴拖拽 / 填充柄
- [x] D5. `shared/useSheetClipboard.ts` — 复制粘贴
- [x] D6. base hooks 上移到 `BaseGridContainer`（`SheetGridContext` + `BaseGridOrchestrator`）
- [x] D8. 视图层分离：`BaseGridView` / `FreeformGridView` + 共享 Canvas 内核 hooks
- [x] D7a. 交互 hooks：`useSheetCellHitTest` / `useSheetEditing` / `useSheetMouseHandlers` / `useSheetKeyboard`
- [ ] D7b. 进一步拆分 mouse handlers 为 base/freeform 专用（当前仍共用 `shared/mouse/*`）

---

## 目标目录结构

```
components/sheet/
├── SheetContainer.tsx          # 门面 ~19 行
├── SheetContainer.types.ts
├── SheetGridView.types.ts      # SheetGridMode（兼容）
├── REFACTOR_PLAN.md
├── shared/
│   ├── SheetGridContext.tsx    # Canvas 内核 host
│   ├── useSheetCanvasLifecycle.ts
│   ├── useSheetAxisResize.ts
│   ├── SheetCanvasSurface.tsx
│   └── ...
├── base/
│   ├── BaseGridContainer.tsx
│   ├── BaseGridView.tsx        # 多维表网格编排
│   └── ...
└── freeform/
    ├── FreeformGridContainer.tsx
    ├── FreeformGridView.tsx    # 普通表网格编排
    └── ...
```

---

## 验收标准（本 PR）

1. `import { SheetContainer } from '@lingyi-doc/editor'` 路径不变
2. 多维表 / 普通表功能无回归（build 通过）
3. 分组、列头菜单、编辑 overlay 行为与拆分前一致
4. 新模块可独立单元测试（纯函数 / hooks）

---

## 风险与规避

| 风险 | 规避 |
|------|------|
| 双份 render 逻辑 | 本 PR 不拆 performRender，仅抽 hooks + 路由 |
| props 爆炸 | 后续用 SheetGridContext 收敛 overlay props |
| 循环依赖 | base hooks 不 import SheetGridView |
