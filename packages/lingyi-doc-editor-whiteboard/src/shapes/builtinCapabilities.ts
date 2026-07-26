import type { ShapeCapabilities, ShapeKind } from '@lingyi-doc/core-whiteboard';
import { getBuiltinShapeKinds, getShapeRegistry } from '@lingyi-doc/core-whiteboard';
import {
  appendShapePath,
  drawShapeBodyImpl,
  getShapeConnectorAnchorPoint,
  getShapeOutlinePoints,
  getShapeTextBounds,
  getShapeVisualBounds,
  pointInShapeBounds,
} from '../canvas/shapePaths';

let capabilitiesRegistered = false;

export function registerBuiltinShapeCapabilities(): void {
  if (capabilitiesRegistered) return;
  const registry = getShapeRegistry();

  for (const kind of getBuiltinShapeKinds()) {
    registry.attachCapabilities(kind, {
      drawBody: (ctx, x, y, w, h, fill, stroke, strokeWidth) => {
        drawShapeBodyImpl(ctx, kind, x, y, w, h, fill, stroke, strokeWidth);
      },
      appendPath: (ctx, x, y, w, h) => {
        appendShapePath(ctx, kind, x, y, w, h);
      },
      hitTest: (x, y, w, h, pt, pad = 2) => pointInShapeBounds(kind, x, y, w, h, pt, pad),
      getVisualBounds: (x, y, w, h) => getShapeVisualBounds(kind, x, y, w, h),
      getTextBounds: (x, y, w, h) => getShapeTextBounds(kind, x, y, w, h),
      getConnectorAnchorPoint: (x, y, w, h, anchor) =>
        getShapeConnectorAnchorPoint(kind, x, y, w, h, anchor as import('@lingyi-doc/core').AnchorId),
      getOutlinePoints: (x, y, w, h) => getShapeOutlinePoints(kind, x, y, w, h) ?? [],
    });
  }

  capabilitiesRegistered = true;
}

export function isBuiltinShapeCapabilitiesRegistered(): boolean {
  return capabilitiesRegistered;
}

/** 通过 registry 调用图形能力 */
export function invokeShapeCapability<M extends keyof ShapeCapabilities>(
  kind: ShapeKind,
  method: M,
  ...args: Parameters<NonNullable<ShapeCapabilities[M]>>
): ReturnType<NonNullable<ShapeCapabilities[M]>> | undefined {
  return getShapeRegistry().invoke(kind, method, ...args);
}
