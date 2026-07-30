import type { AnchorId, ConnectorElement, ConnectorLabelLayout, ConnectorStyle, WhiteboardElement, WhiteboardPoint } from '@lingyi-doc/core-whiteboard';
import { anchorInwardReferencePoint, getAnchorPoint, getConnectorLabelAnchor, getConnectorLabelTextHeight, getConnectorPathFrameAtMidpoint, resolveConnectorLabelPosition, CONNECTOR_LABEL_PAD_X, CONNECTOR_LABEL_PAD_Y, resolveElbowRoute, resolveManualElbowRoute, ensureCurvePathPoints, isConnectable, effectiveConnectorPathMode, isCurveConnectorStyle, migrateConnectorToStyle, smoothCurvePath, type ElbowObstacle, type ResolveElbowRouteOpts } from '@lingyi-doc/core-whiteboard';
import { getShapeConnectorAnchorPoint } from './canvas/shapePaths';
import { elementBounds } from './viewportUtils';

const ARROW_REF_DISTANCE = 40;

/** 浮动工具栏预估高度 + 与连线的屏幕间距 */
const CONNECTOR_TOOLBAR_SCREEN_HEIGHT = 40;
const CONNECTOR_TOOLBAR_SCREEN_GAP = 18;
const CONNECTOR_TOOLBAR_EXTRA_FOR_FLAT = 14;

/** 终点箭头：有绑定时始终沿锚点内法线指入图形 */
export function resolveConnectorEndTipDirection(
  anchor: AnchorId,
  end: WhiteboardPoint,
): { from: WhiteboardPoint; to: WhiteboardPoint; tipAt: 'to' } {
  return {
    from: anchorInwardReferencePoint(anchor, end, ARROW_REF_DISTANCE),
    to: end,
    tipAt: 'to',
  };
}

/** 起点箭头：有绑定时始终沿锚点内法线指入图形 */
export function resolveConnectorStartTipDirection(
  anchor: AnchorId,
  start: WhiteboardPoint,
): { from: WhiteboardPoint; to: WhiteboardPoint; tipAt: 'to' } {
  return {
    from: anchorInwardReferencePoint(anchor, start, ARROW_REF_DISTANCE),
    to: start,
    tipAt: 'to',
  };
}

/** 获取元素锚点位置 */
export function getBoardAnchorPoint(el: WhiteboardElement, anchor: AnchorId): WhiteboardPoint {
  if (el.type === 'shape') {
    return getShapeConnectorAnchorPoint(
      el.shapeKind,
      el.x,
      el.y,
      el.width,
      el.height,
      anchor,
    );
  }
  return getAnchorPoint(el, anchor);
}

/** 获取连线端点位置 */
export function getBoardConnectorEndpoints(
  conn: ConnectorElement,
  elements: WhiteboardElement[],
): [WhiteboardPoint, WhiteboardPoint] {
  const pts = conn.points;
  let start = pts[0] ?? { x: conn.x, y: conn.y };
  let end = pts[pts.length - 1] ?? { x: conn.x + conn.width, y: conn.y + conn.height };

  if (conn.startBind) {
    const el = elements.find(e => e.id === conn.startBind!.elementId);
    if (el) start = getBoardAnchorPoint(el, conn.startBind.anchor);
  }
  if (conn.endBind) {
    const el = elements.find(e => e.id === conn.endBind!.elementId);
    if (el) end = getBoardAnchorPoint(el, conn.endBind.anchor);
  }
  return [start, end];
}

/** 获取连线的障碍物（可连接元素的包围盒） */
export function collectElbowObstacles(elements: WhiteboardElement[]): ElbowObstacle[] {
  const obstacles: ElbowObstacle[] = [];
  for (const el of elements) {
    if (!isConnectable(el)) continue;
    const b = elementBounds(el);
    obstacles.push({ id: el.id, x: b.x, y: b.y, w: b.w, h: b.h });
  }
  return obstacles;
}

/** 获取连线的路由选项 */
export function elbowRouteOpts(conn: ConnectorElement, elements: WhiteboardElement[]): ResolveElbowRouteOpts {
  const opts: ResolveElbowRouteOpts = {
    obstacles: collectElbowObstacles(elements),
  };
  if (conn.startBind) opts.startAnchor = conn.startBind.anchor;
  if (conn.endBind) opts.endAnchor = conn.endBind.anchor;
  return opts;
}

/** 获取连线的工具栏锚点位置 */
export function computeConnectorToolbarScreenAnchor(
  route: WhiteboardPoint[],
  viewport: { x: number; y: number; zoom: number },
): { x: number; y: number; placement: 'top' | 'bottom' } {
  const xs = route.map(p => p.x);
  const ys = route.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const widthScreen = width * viewport.zoom;
  const heightScreen = height * viewport.zoom;

  const isNearlyHorizontal = heightScreen < 10 && widthScreen > 48;
  const clearance = CONNECTOR_TOOLBAR_SCREEN_HEIGHT
    + CONNECTOR_TOOLBAR_SCREEN_GAP * 2
    + (isNearlyHorizontal ? CONNECTOR_TOOLBAR_EXTRA_FOR_FLAT : 0);

  const anchorX = isNearlyHorizontal
    ? viewport.x + (minX + width * 0.28) * viewport.zoom
    : viewport.x + ((minX + maxX) / 2) * viewport.zoom;

  // 连线中心点在屏幕上的 Y 坐标
  const centerYy = viewport.y + ((minY + maxY) / 2) * viewport.zoom;
  // 连线在屏幕中心线上方时工具栏在下方，反之在上方
  const placement = centerYy < window.innerHeight / 2 ? 'bottom' : 'top';

  return {
    x: anchorX,
    y: placement === 'top'
      ? viewport.y + minY * viewport.zoom - clearance
      : viewport.y + maxY * viewport.zoom + clearance,
    placement,
  };
}

/** 获取曲线的路由点位置 */
export function resolveBoardCurveRoute(
  conn: ConnectorElement,
  start: WhiteboardPoint,
  end: WhiteboardPoint,
): WhiteboardPoint[] {
  const pts = ensureCurvePathPoints(conn.points, start, end);
  if (effectiveConnectorPathMode(conn) === 'auto') {
    return smoothCurvePath(pts);
  }
  return pts;
}

/** 获取肘型的路由点位置 */
export function resolveBoardElbowRoute(
  conn: ConnectorElement,
  start: WhiteboardPoint,
  end: WhiteboardPoint,
  elements: WhiteboardElement[],
): WhiteboardPoint[] {
  const opts = elbowRouteOpts(conn, elements);
  if (effectiveConnectorPathMode(conn) === 'manual') {
    return resolveManualElbowRoute(conn.points, start, end, opts);
  }
  return resolveElbowRoute(conn.points, start, end, opts);
}

/** 获取连线的路由点位置 */
export function getBoardConnectorRoute(
  conn: ConnectorElement,
  elements: WhiteboardElement[],
): WhiteboardPoint[] {
  const [start, end] = getBoardConnectorEndpoints(conn, elements);
  if (conn.style === 'elbow') {
    return resolveBoardElbowRoute(conn, start, end, elements);
  }
  if (isCurveConnectorStyle(conn.style)) {
    return resolveBoardCurveRoute(conn, start, end);
  }
  return [start, end];
}

/** 同步连线的路由点位置 */
export function syncBoardConnectors(elements: WhiteboardElement[]): WhiteboardElement[] {
  return elements.map(el => {
    if (el.type !== 'connector') return el;
    const [start, end] = getBoardConnectorEndpoints(el, elements);
    const points = el.style === 'elbow'
      ? resolveBoardElbowRoute(el, start, end, elements)
      : isCurveConnectorStyle(el.style)
        ? resolveBoardCurveRoute(el, start, end)
        : [start, end];
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    return {
      ...el,
      points,
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs) || 1,
      height: Math.max(...ys) - Math.min(...ys) || 1,
    };
  });
}

/** 转换连线样式并迁移路径点 */
export function convertBoardConnectorStyle(
  conn: ConnectorElement,
  elements: WhiteboardElement[],
  targetStyle: ConnectorStyle,
): ConnectorElement {
  const [start, end] = getBoardConnectorEndpoints(conn, elements);
  const route = getBoardConnectorRoute(conn, elements);
  const opts = elbowRouteOpts(conn, elements);

  if (targetStyle === 'curve') {
    return {
      ...conn,
      style: 'curve',
      pathMode: effectiveConnectorPathMode(conn),
      points: migrateConnectorToStyle(route, start, end, 'curve'),
    };
  }

  if (targetStyle === 'elbow') {
    const patch: ConnectorElement = {
      ...conn,
      style: 'elbow',
      pathMode: conn.startBind && conn.endBind ? 'auto' : 'manual',
      points: migrateConnectorToStyle(route, start, end, 'elbow', opts),
    };
    return syncBoardConnectors(elements.map(el => (el.id === conn.id ? patch : el)))
      .find(el => el.id === conn.id) as ConnectorElement;
  }

  if (targetStyle === 'straight' || targetStyle === 'arrow') {
    const patch: ConnectorElement = {
      ...conn,
      style: targetStyle,
      points: [start, end],
      pathMode: undefined,
    };
    if (targetStyle === 'arrow') {
      const endArrow = conn.arrowEnd === false || conn.arrowEnd === 'none' ? 'arrow' : conn.arrowEnd;
      patch.arrowEnd = endArrow;
    }
    return syncBoardConnectors(elements.map(el => (el.id === conn.id ? patch : el)))
      .find(el => el.id === conn.id) as ConnectorElement;
  }

  return conn;
}

/** 获取连线的标签布局 */
export function getBoardConnectorLabelLayout(
  conn: ConnectorElement,
  elements: WhiteboardElement[],
): ConnectorLabelLayout | null {
  const [a, b] = getBoardConnectorEndpoints(conn, elements);
  const route = getBoardConnectorRoute(conn, elements);
  const frame = getConnectorPathFrameAtMidpoint(conn.style, a, b, route);
  if (!frame) return null;
  return {
    frame,
    position: resolveConnectorLabelPosition(conn),
  };
}

/** 获取连线的标签边界框 */
export function getBoardConnectorLabelBounds(
  conn: ConnectorElement,
  elements: WhiteboardElement[],
  textWidth: number,
): { x: number; y: number; w: number; h: number; anchor: WhiteboardPoint } | null {
  const text = conn.text?.trim();
  if (!text) return null;
  const layout = getBoardConnectorLabelLayout(conn, elements);
  if (!layout) return null;
  const h = getConnectorLabelTextHeight();
  const anchor = getConnectorLabelAnchor(layout.frame, layout.position, h);
  return {
    x: anchor.x - textWidth / 2 - CONNECTOR_LABEL_PAD_X,
    y: anchor.y - h / 2 - CONNECTOR_LABEL_PAD_Y,
    w: textWidth + CONNECTOR_LABEL_PAD_X * 2,
    h: h + CONNECTOR_LABEL_PAD_Y * 2,
    anchor,
  };
}
