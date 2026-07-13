import type { ConnectorElement, ConnectorStyle, WhiteboardPoint } from './types';
import { isOrthogonalPath } from './elbowConnector';

export type ConnectorPathMode = 'auto' | 'manual';

const EPS = 0.5;

/** 正交连线族：直线 / 箭头 / 折线 */
export function isOrthogonalConnectorStyle(style: ConnectorStyle): boolean {
  return style === 'straight' || style === 'arrow' || style === 'elbow';
}

export function isCurveConnectorStyle(style: ConnectorStyle): boolean {
  return style === 'curve';
}

/** 未显式设置时：双端绑定默认自动路由，否则保留手动折点 */
export function effectiveConnectorPathMode(conn: ConnectorElement): ConnectorPathMode {
  if (conn.pathMode) return conn.pathMode;
  if (conn.startBind && conn.endBind) return 'auto';
  return 'manual';
}

/** 是否为单段水平/垂直直线（折线退化态） */
export function isDegenerateStraightRoute(route: WhiteboardPoint[]): boolean {
  if (route.length !== 2) return false;
  const [a, b] = route;
  return Math.abs(a.x - b.x) < EPS || Math.abs(a.y - b.y) < EPS;
}

/** 正交路径是否可降级为直线样式 */
export function canCollapseToStraight(route: WhiteboardPoint[]): boolean {
  return isDegenerateStraightRoute(route);
}

/** 拖动正交线段后是否应升级为折线（出现折点） */
export function shouldPromoteStraightToElbow(
  route: WhiteboardPoint[],
  segmentIndex: number,
  dx: number,
  dy: number,
): boolean {
  if (route.length !== 2 || segmentIndex !== 0) return false;
  const [a, b] = route;
  const horizontal = Math.abs(a.y - b.y) < EPS;
  const vertical = Math.abs(a.x - b.x) < EPS;
  if (horizontal) return Math.abs(dy) > 4 && Math.abs(dx) < Math.abs(dy);
  if (vertical) return Math.abs(dx) > 4 && Math.abs(dy) < Math.abs(dx);
  return Math.hypot(dx, dy) > 4;
}

/** 将直线段垂直/水平拖动转为 L 形折线点列 */
export function promoteStraightSegmentToElbow(
  route: WhiteboardPoint[],
  dx: number,
  dy: number,
): WhiteboardPoint[] {
  const [start, end] = route;
  const horizontal = Math.abs(start.y - end.y) < EPS;
  if (horizontal) {
    const y = start.y + dy;
    return [
      start,
      { x: start.x, y },
      { x: end.x, y },
      end,
    ];
  }
  const vertical = Math.abs(start.x - end.x) < EPS;
  if (vertical) {
    const x = start.x + dx;
    return [
      start,
      { x, y: start.y },
      { x, y: end.y },
      end,
    ];
  }
  return route;
}

/** 根据解析后的路径推断更适合展示的样式 */
export function inferOrthogonalConnectorStyle(
  current: ConnectorStyle,
  route: WhiteboardPoint[],
): ConnectorStyle {
  if (current === 'arrow') return 'arrow';
  if (canCollapseToStraight(route)) return 'straight';
  return 'elbow';
}

export function normalizeOrthogonalRoute(points: WhiteboardPoint[]): WhiteboardPoint[] {
  if (points.length < 2) return points.map(p => ({ ...p }));
  if (!isOrthogonalPath(points)) return points.map(p => ({ ...p }));
  return points.map(p => ({ ...p }));
}
