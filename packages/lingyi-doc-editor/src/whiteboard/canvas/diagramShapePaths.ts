import type { ShapeKind } from '@lingyi-doc/core';
import { SEQ_LIFELINE_DASH_COLOR } from '@lingyi-doc/core';

type Box = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

const EXTENDED_KINDS = new Set<ShapeKind>([
  'lineSolid', 'lineDashed', 'lineArrow', 'lineArrowDouble',
  'swimlaneV2', 'swimlaneH2', 'swimlaneV3',
  'documentWavy', 'internalStorage', 'multiDocument', 'display', 'predefinedProcess', 'manualInput',
  'flowDataFlow', 'flowOffPage', 'flowQueue',
  'umlClass3', 'umlClass2', 'umlInterface', 'umlPackage', 'umlNote',
  'umlAggregation', 'umlComposition', 'umlGeneralization', 'umlRealization', 'umlDependency',
  'seqActor', 'seqLifeline', 'seqDbLifeline', 'seqStorageLifeline', 'seqBoundaryLifeline',
  'seqControlLifeline', 'seqEntityLifeline', 'seqMessage', 'seqActivation', 'seqFrame', 'seqAltFrame', 'seqNote',
  'dfdDataStore', 'dfdSubProcess', 'dfdStoreOpenRight', 'dfdStoreOpenLeft',
  'erTable1', 'erTable2', 'erTable3', 'erTable4',
  'compComponent', 'compComponentAlt', 'compProvided', 'compAssembly', 'compRequired',
  'stateInitial', 'stateFinal', 'stateForkJoin',
  'star4', 'star6', 'calloutBurst', 'actorStick',
]);

const STROKE_ONLY = new Set<ShapeKind>([
  'lineSolid', 'lineDashed', 'lineArrow', 'lineArrowDouble',
  'umlAggregation', 'umlComposition', 'umlGeneralization', 'umlRealization', 'umlDependency',
  'stateForkJoin',
  'compProvided', 'compAssembly', 'compRequired',
]);

export function isExtendedDiagramKind(kind: ShapeKind): boolean {
  return EXTENDED_KINDS.has(kind);
}

export function isExtendedStrokeOnlyKind(kind: ShapeKind): boolean {
  return STROKE_ONLY.has(kind);
}

function cx(b: Box) { return b.x + b.w / 2; }
function cy(b: Box) { return b.y + b.h / 2; }

function dashedLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, dash = 4) {
  ctx.setLineDash([dash, dash]);
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.setLineDash([]);
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  if (radius <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function drawSeqLifelineDash(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  y1: number,
  y2: number,
  strokeWidth = 1.5,
) {
  if (y2 <= y1) return;
  ctx.save();
  ctx.strokeStyle = SEQ_LIFELINE_DASH_COLOR;
  ctx.lineWidth = strokeWidth;
  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.moveTo(centerX, y1);
  ctx.lineTo(centerX, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

export interface SeqDrawOptions {
  seqLifelineLength?: number;
}

/** 流程图「数据流」：横向圆柱（右端椭圆盖 + 左端开口弧线） */
function flowHorizontalCylinderPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const capRx = Math.min(h * 0.28, w * 0.14);
  const bodyHalfH = h * 0.22;
  const bodyMid = y + h / 2;
  const bodyTop = bodyMid - bodyHalfH;
  const bodyBottom = bodyMid + bodyHalfH;
  const rightCx = x + w - capRx;
  const leftCx = x + capRx;

  ctx.moveTo(leftCx, bodyTop);
  ctx.lineTo(rightCx, bodyTop);
  ctx.ellipse(rightCx, bodyMid, capRx, bodyHalfH, 0, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(leftCx, bodyBottom);
  ctx.ellipse(leftCx, bodyMid, capRx, bodyHalfH, 0, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
}

function drawSeqFragmentFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const tabH = h * 0.12;
  const tabW = w * 0.34;
  ctx.moveTo(x, y + tabH);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w, y + tabH);
  ctx.lineTo(x + tabW, y + tabH);
  ctx.lineTo(x + tabW, y);
  ctx.lineTo(x, y);
  ctx.closePath();
}

function drawArrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, dir: 1 | -1, size = 6) {
  ctx.moveTo(x, y);
  ctx.lineTo(x - dir * size, y - size * 0.55);
  ctx.moveTo(x, y);
  ctx.lineTo(x - dir * size, y + size * 0.55);
}

function documentWavyPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const wave = Math.min(h * 0.18, 14);
  const base = y + h - wave;
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, base);
  const seg = w / 4;
  ctx.bezierCurveTo(x + w - seg * 0.5, base + wave, x + w - seg * 1.5, base - wave * 0.3, x + w - seg * 2, base);
  ctx.bezierCurveTo(x + w - seg * 2.5, base + wave, x + seg * 0.5, base - wave * 0.2, x, base);
  ctx.closePath();
}

const SWIMLANE_HEADER_FILL = '#f2f2f2';

function swimlaneBands(w: number, h: number, vertical: boolean) {
  const main = vertical ? h * 0.14 : w * 0.14;
  const lane = vertical ? h * 0.10 : w * 0.10;
  return { main, lane };
}

function appendVerticalSwimlanePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  lanes: number,
) {
  const { main, lane } = swimlaneBands(w, h, true);
  const bodyTop = y + main + lane;
  ctx.rect(x, y, w, h);
  ctx.moveTo(x, y + main);
  ctx.lineTo(x + w, y + main);
  ctx.moveTo(x, bodyTop);
  ctx.lineTo(x + w, bodyTop);
  for (let i = 1; i < lanes; i++) {
    const lx = x + (w * i) / lanes;
    ctx.moveTo(lx, y + main);
    ctx.lineTo(lx, y + h);
  }
}

function appendHorizontalSwimlanePath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  lanes: number,
) {
  const { main, lane } = swimlaneBands(w, h, false);
  const bodyLeft = x + main + lane;
  ctx.rect(x, y, w, h);
  ctx.moveTo(x + main, y);
  ctx.lineTo(x + main, y + h);
  ctx.moveTo(bodyLeft, y);
  ctx.lineTo(bodyLeft, y + h);
  for (let i = 1; i < lanes; i++) {
    const ly = y + (h * i) / lanes;
    ctx.moveTo(x + main, ly);
    ctx.lineTo(x + w, ly);
  }
}

function drawSwimlaneLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  vertical = false,
  maxSize = 14,
) {
  const fontSize = Math.max(10, Math.min(maxSize, 13));
  ctx.save();
  ctx.fillStyle = '#1f2329';
  ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (vertical) {
    ctx.translate(centerX, centerY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(text, 0, 0);
  } else {
    ctx.fillText(text, centerX, centerY);
  }
  ctx.restore();
}

function drawVerticalSwimlane(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  lanes: number,
  fill: string,
  stroke: string,
  strokeWidth: number,
  mainTitle: string,
) {
  const { main, lane } = swimlaneBands(w, h, true);
  const bodyTop = y + main + lane;

  ctx.fillStyle = SWIMLANE_HEADER_FILL;
  ctx.fillRect(x, y, w, main);

  ctx.fillStyle = fill;
  ctx.fillRect(x, y + main, w, h - main);

  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.beginPath();
  appendVerticalSwimlanePath(ctx, x, y, w, h, lanes);
  ctx.stroke();

  drawSwimlaneLabel(ctx, mainTitle, x + w / 2, y + main / 2);
  for (let i = 0; i < lanes; i++) {
    const lx = x + (w * (i + 0.5)) / lanes;
    drawSwimlaneLabel(ctx, '泳道', lx, y + main + lane / 2);
  }
}

function drawHorizontalSwimlane(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  lanes: number,
  fill: string,
  stroke: string,
  strokeWidth: number,
  mainTitle: string,
) {
  const { main, lane } = swimlaneBands(w, h, false);
  const bodyLeft = x + main + lane;

  ctx.fillStyle = SWIMLANE_HEADER_FILL;
  ctx.fillRect(x, y, main, h);

  ctx.fillStyle = fill;
  ctx.fillRect(x + main, y, w - main, h);

  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;
  ctx.beginPath();
  appendHorizontalSwimlanePath(ctx, x, y, w, h, lanes);
  ctx.stroke();

  drawSwimlaneLabel(ctx, mainTitle, x + main / 2, y + h / 2, true);
  for (let i = 0; i < lanes; i++) {
    const ly = y + (h * (i + 0.5)) / lanes;
    drawSwimlaneLabel(ctx, '泳道', x + main + lane / 2, ly, true);
  }
}

function swimlanePath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lanes: number, vertical: boolean) {
  if (vertical) appendVerticalSwimlanePath(ctx, x, y, w, h, lanes);
  else appendHorizontalSwimlanePath(ctx, x, y, w, h, lanes);
}

function umlNotePath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const fold = Math.min(w, h) * 0.18;
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - fold, y);
  ctx.lineTo(x + w, y + fold);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.moveTo(x + w - fold, y);
  ctx.lineTo(x + w - fold, y + fold);
  ctx.lineTo(x + w, y + fold);
}

function burstPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const spikes = 12;
  const cxp = x + w / 2;
  const cyp = y + h / 2;
  const outer = Math.min(w, h) / 2;
  const inner = outer * 0.55;
  for (let i = 0; i < spikes; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / spikes;
    const r = i % 2 === 0 ? outer : inner;
    const px = cxp + r * Math.cos(a);
    const py = cyp + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function starN(ctx: CanvasRenderingContext2D, b: Box, points: number) {
  const outer = Math.min(b.w, b.h) / 2 * 0.9;
  const inner = outer * 0.42;
  const centerX = cx(b);
  const centerY = cy(b);
  const total = points * 2;
  for (let i = 0; i < total; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const px = centerX + r * Math.cos(a);
    const py = centerY + r * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function actorPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const headR = Math.min(w, h) * 0.14;
  const cxp = x + w / 2;
  const headY = y + headR + h * 0.05;
  ctx.moveTo(cxp + headR, headY);
  ctx.arc(cxp, headY, headR, 0, Math.PI * 2);
  ctx.moveTo(cxp, headY + headR);
  ctx.lineTo(cxp, y + h * 0.62);
  ctx.moveTo(cxp - w * 0.22, y + h * 0.38);
  ctx.lineTo(cxp + w * 0.22, y + h * 0.38);
  ctx.moveTo(cxp, y + h * 0.62);
  ctx.lineTo(x + w * 0.28, y + h * 0.92);
  ctx.moveTo(cxp, y + h * 0.62);
  ctx.lineTo(x + w * 0.72, y + h * 0.92);
}

export function appendExtendedDiagramPath(
  ctx: CanvasRenderingContext2D,
  kind: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const b: Box = { x, y, w, h };
  ctx.beginPath();

  switch (kind) {
    case 'lineSolid':
    case 'lineDashed':
    case 'lineArrow':
    case 'lineArrowDouble':
      ctx.rect(x, y, w, h);
      break;
    case 'swimlaneV2':
      swimlanePath(ctx, x, y, w, h, 2, true);
      break;
    case 'swimlaneH2':
      swimlanePath(ctx, x, y, w, h, 2, false);
      break;
    case 'swimlaneV3':
      swimlanePath(ctx, x, y, w, h, 3, true);
      break;
    case 'documentWavy':
      documentWavyPath(ctx, x, y, w, h);
      break;
    case 'internalStorage': {
      const ry = h * 0.11;
      ctx.moveTo(x, y + ry);
      ctx.ellipse(cx(b), y + ry, w / 2, ry, 0, Math.PI, 0);
      ctx.lineTo(x + w, y + h - ry);
      ctx.ellipse(cx(b), y + h - ry, w / 2, ry, 0, 0, Math.PI);
      ctx.closePath();
      ctx.moveTo(x + w * 0.28, y + ry);
      ctx.lineTo(x + w * 0.28, y + h - ry);
      ctx.moveTo(x + w * 0.72, y + ry);
      ctx.lineTo(x + w * 0.72, y + h - ry);
      break;
    }
    case 'multiDocument': {
      const off = Math.min(w, h) * 0.12;
      documentWavyPath(ctx, x + off, y, w - off, h - off);
      ctx.moveTo(x, y + off);
      documentWavyPath(ctx, x, y + off, w - off, h - off);
      break;
    }
    case 'display': {
      const r = h / 2;
      ctx.moveTo(x, y);
      ctx.lineTo(x + w - r, y);
      ctx.arc(x + w - r, cy(b), r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    }
    case 'predefinedProcess':
      ctx.rect(x, y, w, h);
      ctx.moveTo(x + w * 0.12, y);
      ctx.lineTo(x + w * 0.12, y + h);
      ctx.moveTo(x + w * 0.88, y);
      ctx.lineTo(x + w * 0.88, y + h);
      break;
    case 'manualInput':
      ctx.moveTo(x + w * 0.15, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    case 'flowDataFlow':
      flowHorizontalCylinderPath(ctx, x, y, w, h);
      break;
    case 'flowOffPage': {
      const splitY = y + h * 0.55;
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w, splitY);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x, splitY);
      ctx.closePath();
      break;
    }
    case 'flowQueue': {
      const r = Math.min(w, h) * 0.38;
      const cxp = cx(b);
      const cyp = y + h * 0.42;
      ctx.arc(cxp, cyp, r, 0, Math.PI * 2);
      const px = cxp + r * 0.707;
      const py = cyp + r * 0.707;
      ctx.moveTo(px, py);
      ctx.lineTo(px + w * 0.18, py);
      break;
    }
    case 'umlClass3':
    case 'umlClass2':
    case 'umlInterface':
    case 'umlPackage':
    case 'umlNote':
    case 'seqFrame':
    case 'seqAltFrame':
    case 'dfdDataStore':
    case 'dfdSubProcess':
    case 'erTable1':
    case 'erTable2':
    case 'erTable3':
    case 'erTable4':
    case 'compComponent':
    case 'compComponentAlt':
    case 'seqMessage':
      ctx.rect(x, y, w, h);
      break;
    case 'umlAggregation':
    case 'umlComposition':
    case 'umlGeneralization':
    case 'umlRealization':
    case 'umlDependency':
    case 'compProvided':
    case 'compAssembly':
    case 'compRequired':
      ctx.rect(x, y, w, h);
      break;
    case 'seqActor':
    case 'actorStick':
      ctx.rect(x, y, w, h);
      break;
    case 'seqLifeline':
    case 'seqBoundaryLifeline':
    case 'seqControlLifeline':
    case 'seqEntityLifeline':
    case 'seqStorageLifeline':
    case 'seqDbLifeline':
      ctx.rect(x, y, w, h);
      break;
    case 'seqActivation':
    case 'stateForkJoin':
      ctx.rect(x, y, w, h);
      break;
    case 'stateInitial':
      ctx.arc(cx(b), cy(b), Math.min(w, h) / 2, 0, Math.PI * 2);
      break;
    case 'stateFinal': {
      const r = Math.min(w, h) / 2;
      ctx.arc(cx(b), cy(b), r, 0, Math.PI * 2);
      ctx.moveTo(cx(b) + r - 3, cy(b));
      ctx.arc(cx(b), cy(b), r - 4, 0, Math.PI * 2);
      break;
    }
    case 'dfdStoreOpenRight':
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + h);
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w, y + h);
      break;
    case 'dfdStoreOpenLeft':
      ctx.moveTo(x + w, y);
      ctx.lineTo(x + w, y + h);
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w, y + h);
      break;
    case 'star4':
      starN(ctx, b, 4);
      break;
    case 'star6':
      starN(ctx, b, 6);
      break;
    case 'calloutBurst':
      burstPath(ctx, x, y, w, h);
      break;
    case 'seqNote':
      umlNotePath(ctx, x, y, w, h);
      break;
    default:
      ctx.rect(x, y, w, h);
  }
}

export function drawExtendedDiagramBody(
  ctx: CanvasRenderingContext2D,
  kind: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  stroke: string,
  strokeWidth: number,
  options?: SeqDrawOptions,
): void {
  const tailLen = options?.seqLifelineLength ?? 0;
  const drawTail = (centerX: number, headBottom: number) => {
    if (tailLen > 0) drawSeqLifelineDash(ctx, centerX, headBottom, headBottom + tailLen, strokeWidth);
  };
  const b: Box = { x, y, w, h };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = strokeWidth;

  const strokeShape = () => {
    appendExtendedDiagramPath(ctx, kind, x, y, w, h);
    ctx.stroke();
  };

  const fillStrokeShape = (pathFn: () => void) => {
    ctx.beginPath();
    pathFn();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };

  switch (kind) {
    case 'lineSolid': {
      const midY = cy(b);
      ctx.beginPath();
      ctx.moveTo(x, midY);
      ctx.lineTo(x + w, midY);
      ctx.stroke();
      return;
    }
    case 'lineDashed': {
      const midY = cy(b);
      ctx.beginPath();
      dashedLine(ctx, x, midY, x + w, midY);
      ctx.stroke();
      return;
    }
    case 'lineArrow': {
      const midY = cy(b);
      ctx.beginPath();
      ctx.moveTo(x, midY);
      ctx.lineTo(x + w - 8, midY);
      drawArrowHead(ctx, x + w, midY, 1);
      ctx.stroke();
      return;
    }
    case 'lineArrowDouble': {
      const midY = cy(b);
      ctx.beginPath();
      drawArrowHead(ctx, x, midY, -1);
      ctx.moveTo(x + 8, midY);
      ctx.lineTo(x + w - 8, midY);
      drawArrowHead(ctx, x + w, midY, 1);
      ctx.stroke();
      return;
    }
    case 'swimlaneV2':
      drawVerticalSwimlane(ctx, x, y, w, h, 2, fill, stroke, strokeWidth, '垂直泳道');
      return;
    case 'swimlaneH2':
      drawHorizontalSwimlane(ctx, x, y, w, h, 2, fill, stroke, strokeWidth, '水平泳道');
      return;
    case 'swimlaneV3':
      drawVerticalSwimlane(ctx, x, y, w, h, 3, fill, stroke, strokeWidth, '垂直泳道');
      return;
    case 'documentWavy':
      fillStrokeShape(() => documentWavyPath(ctx, x, y, w, h));
      return;
    case 'internalStorage': {
      ctx.fillStyle = fill;
      ctx.beginPath();
      const ry = h * 0.11;
      ctx.moveTo(x, y + ry);
      ctx.ellipse(cx(b), y + ry, w / 2, ry, 0, Math.PI, 0);
      ctx.lineTo(x + w, y + h - ry);
      ctx.ellipse(cx(b), y + h - ry, w / 2, ry, 0, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w * 0.28, y + ry);
      ctx.lineTo(x + w * 0.28, y + h - ry);
      ctx.moveTo(x + w * 0.72, y + ry);
      ctx.lineTo(x + w * 0.72, y + h - ry);
      ctx.stroke();
      return;
    }
    case 'multiDocument': {
      const off = Math.min(w, h) * 0.12;
      ctx.fillStyle = fill;
      ctx.beginPath();
      documentWavyPath(ctx, x + off, y, w - off, h - off);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      documentWavyPath(ctx, x, y + off, w - off, h - off);
      ctx.fill();
      ctx.stroke();
      return;
    }
    case 'display':
      fillStrokeShape(() => {
        const r = h / 2;
        ctx.moveTo(x, y);
        ctx.lineTo(x + w - r, y);
        ctx.arc(x + w - r, cy(b), r, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(x, y + h);
        ctx.closePath();
      });
      return;
    case 'predefinedProcess':
      fillStrokeShape(() => {
        ctx.rect(x, y, w, h);
        ctx.moveTo(x + w * 0.12, y);
        ctx.lineTo(x + w * 0.12, y + h);
        ctx.moveTo(x + w * 0.88, y);
        ctx.lineTo(x + w * 0.88, y + h);
      });
      return;
    case 'manualInput':
      fillStrokeShape(() => {
        ctx.moveTo(x + w * 0.15, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
      });
      return;
    case 'flowDataFlow':
      fillStrokeShape(() => flowHorizontalCylinderPath(ctx, x, y, w, h));
      return;
    case 'flowOffPage': {
      const splitY = y + h * 0.55;
      fillStrokeShape(() => {
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, splitY);
        ctx.lineTo(x + w / 2, y + h);
        ctx.lineTo(x, splitY);
        ctx.closePath();
      });
      return;
    }
    case 'flowQueue': {
      const r = Math.min(w, h) * 0.38;
      const cxp = cx(b);
      const cyp = y + h * 0.42;
      fillStrokeShape(() => ctx.arc(cxp, cyp, r, 0, Math.PI * 2));
      ctx.beginPath();
      const px = cxp + r * 0.707;
      const py = cyp + r * 0.707;
      ctx.moveTo(px, py);
      ctx.lineTo(px + w * 0.18, py);
      ctx.stroke();
      return;
    }
    case 'umlClass3':
      fillStrokeShape(() => {
        ctx.rect(x, y, w, h);
        ctx.moveTo(x, y + h / 3);
        ctx.lineTo(x + w, y + h / 3);
        ctx.moveTo(x, y + (h * 2) / 3);
        ctx.lineTo(x + w, y + (h * 2) / 3);
      });
      return;
    case 'umlClass2':
      fillStrokeShape(() => {
        ctx.rect(x, y, w, h);
        ctx.moveTo(x, y + h / 2);
        ctx.lineTo(x + w, y + h / 2);
      });
      return;
    case 'umlInterface':
      fillStrokeShape(() => {
        ctx.rect(x, y, w, h);
        const s = Math.min(w, h) * 0.22;
        ctx.moveTo(x + w - s, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + s);
      });
      return;
    case 'umlPackage':
      fillStrokeShape(() => {
        const tabH = h * 0.18;
        const tabW = w * 0.38;
        ctx.rect(x, y + tabH, w, h - tabH);
        ctx.rect(x, y, tabW, tabH);
      });
      return;
    case 'umlNote':
    case 'seqNote':
      fillStrokeShape(() => umlNotePath(ctx, x, y, w, h));
      return;
    case 'umlAggregation': {
      const midY = cy(b);
      ctx.beginPath();
      ctx.moveTo(x, midY);
      ctx.lineTo(x + w * 0.55, midY);
      const ds = h * 0.22;
      ctx.moveTo(x + w * 0.55, midY - ds);
      ctx.lineTo(x + w * 0.72, midY);
      ctx.lineTo(x + w * 0.55, midY + ds);
      ctx.closePath();
      ctx.stroke();
      return;
    }
    case 'umlComposition': {
      const midY = cy(b);
      ctx.beginPath();
      ctx.moveTo(x, midY);
      ctx.lineTo(x + w * 0.55, midY);
      const ds = h * 0.22;
      ctx.moveTo(x + w * 0.55, midY - ds);
      ctx.lineTo(x + w * 0.72, midY);
      ctx.lineTo(x + w * 0.55, midY + ds);
      ctx.closePath();
      ctx.fillStyle = stroke;
      ctx.fill();
      ctx.stroke();
      return;
    }
    case 'umlGeneralization': {
      const midY = cy(b);
      ctx.beginPath();
      ctx.moveTo(x, midY);
      ctx.lineTo(x + w * 0.62, midY);
      const ts = h * 0.28;
      ctx.moveTo(x + w * 0.62, midY - ts / 2);
      ctx.lineTo(x + w, midY);
      ctx.lineTo(x + w * 0.62, midY + ts / 2);
      ctx.closePath();
      ctx.stroke();
      return;
    }
    case 'umlRealization': {
      const midY = cy(b);
      ctx.beginPath();
      dashedLine(ctx, x, midY, x + w * 0.62, midY);
      const ts = h * 0.28;
      ctx.moveTo(x + w * 0.62, midY - ts / 2);
      ctx.lineTo(x + w, midY);
      ctx.lineTo(x + w * 0.62, midY + ts / 2);
      ctx.closePath();
      ctx.stroke();
      return;
    }
    case 'umlDependency': {
      const midY = cy(b);
      ctx.beginPath();
      dashedLine(ctx, x, midY, x + w * 0.7, midY);
      drawArrowHead(ctx, x + w, midY, 1, 7);
      ctx.stroke();
      return;
    }
    case 'seqActor': {
      const actorH = h * 0.72;
      const headR = Math.min(w, actorH) * 0.14;
      const cxp = x + w / 2;
      const headY = y + headR + actorH * 0.05;
      ctx.beginPath();
      ctx.arc(cxp, headY, headR, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.beginPath();
      actorPath(ctx, x, y, w, actorH);
      ctx.stroke();
      drawTail(cx(b), y + h);
      return;
    }
    case 'actorStick': {
      ctx.beginPath();
      actorPath(ctx, x, y, w, h);
      ctx.stroke();
      return;
    }
    case 'seqLifeline': {
      const r = Math.min(h / 2, w / 4, 8);
      ctx.beginPath();
      roundRectPath(ctx, x, y, w, h, r);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
      drawTail(cx(b), y + h);
      return;
    }
    case 'seqDbLifeline': {
      const ry = h * 0.14;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(x, y + ry);
      ctx.ellipse(cx(b), y + ry, w / 2, ry, 0, Math.PI, 0);
      ctx.lineTo(x + w, y + h - ry);
      ctx.ellipse(cx(b), y + h - ry, w / 2, ry, 0, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawTail(cx(b), y + h);
      return;
    }
    case 'seqStorageLifeline': {
      const ry = h * 0.34;
      const bodyY = y + h * 0.08;
      const bodyMidY = bodyY + h * 0.42;
      const bodyH = h * 0.84;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(x + ry, bodyY);
      ctx.lineTo(x + w - ry, bodyY);
      ctx.ellipse(x + w - ry, bodyMidY, ry, bodyH / 2, 0, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(x + ry, bodyY + bodyH);
      ctx.ellipse(x + ry, bodyMidY, ry, bodyH / 2, 0, Math.PI / 2, -Math.PI / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawTail(cx(b), y + h);
      return;
    }
    case 'seqBoundaryLifeline': {
      const iconH = h * 0.58;
      const r = Math.min(w * 0.28, iconH * 0.42);
      const circleCx = x + w * 0.58;
      const circleCy = y + iconH / 2;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(circleCx, circleCy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, circleCy - r);
      ctx.lineTo(x, circleCy + r);
      ctx.moveTo(x, circleCy);
      ctx.lineTo(circleCx - r, circleCy);
      ctx.arc(circleCx, circleCy, r, 0, Math.PI * 2);
      ctx.stroke();
      drawTail(circleCx, y + h);
      return;
    }
    case 'seqControlLifeline': {
      const iconH = h * 0.58;
      const r = Math.min(w * 0.3, iconH * 0.38);
      const circleCx = cx(b);
      const circleCy = y + iconH / 2 + r * 0.12;
      ctx.beginPath();
      ctx.arc(circleCx, circleCy, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(circleCx, circleCy - r, r * 0.55, Math.PI * 0.15, Math.PI * 1.35);
      ctx.stroke();
      drawTail(circleCx, y + h);
      return;
    }
    case 'seqEntityLifeline': {
      const iconH = h * 0.58;
      const r = Math.min(w * 0.3, iconH * 0.38);
      const circleCx = cx(b);
      const circleCy = y + iconH / 2;
      ctx.beginPath();
      ctx.arc(circleCx, circleCy, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(circleCx - r * 0.9, circleCy + r + r * 0.08);
      ctx.lineTo(circleCx + r * 0.9, circleCy + r + r * 0.08);
      ctx.stroke();
      drawTail(circleCx, y + h);
      return;
    }
    case 'seqMessage': {
      const boxH = h * 0.42;
      const r = Math.min(6, boxH / 3);
      const off = w * 0.14;
      ctx.fillStyle = fill;
      ctx.beginPath();
      roundRectPath(ctx, x + off, y, w - off, boxH, r);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      roundRectPath(ctx, x, y + boxH * 0.42, w - off, boxH, r);
      ctx.fill();
      ctx.stroke();
      drawTail(cx(b), y + h);
      return;
    }
    case 'seqActivation':
      ctx.fillStyle = fill;
      ctx.fillRect(x + w * 0.3, y, w * 0.4, h);
      return;
    case 'seqFrame':
      fillStrokeShape(() => drawSeqFragmentFrame(ctx, x, y, w, h));
      return;
    case 'seqAltFrame': {
      fillStrokeShape(() => drawSeqFragmentFrame(ctx, x, y, w, h));
      const tabH = h * 0.12;
      const midY = y + tabH + (h - tabH) * 0.5;
      ctx.beginPath();
      dashedLine(ctx, x, midY, x + w, midY);
      ctx.stroke();
      return;
    }
    case 'dfdDataStore':
      fillStrokeShape(() => {
        ctx.rect(x, y, w, h);
        ctx.moveTo(x, y + h * 0.22);
        ctx.lineTo(x + w, y + h * 0.22);
      });
      return;
    case 'dfdSubProcess':
      fillStrokeShape(() => ctx.rect(x, y, w, h));
      ctx.fillStyle = stroke;
      ctx.font = `${Math.max(12, h * 0.2)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('...', cx(b), cy(b));
      return;
    case 'dfdStoreOpenRight':
    case 'dfdStoreOpenLeft':
      ctx.beginPath();
      if (kind === 'dfdStoreOpenRight') {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + h);
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w, y + h);
      } else {
        ctx.moveTo(x + w, y);
        ctx.lineTo(x + w, y + h);
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w, y + h);
      }
      ctx.stroke();
      return;
    case 'erTable1':
    case 'erTable2':
    case 'erTable3':
    case 'erTable4': {
      const cols = Number(kind.slice(-1));
      fillStrokeShape(() => {
        ctx.rect(x, y, w, h);
        ctx.moveTo(x, y + h * 0.28);
        ctx.lineTo(x + w, y + h * 0.28);
        for (let i = 1; i < cols; i++) {
          const lx = x + (w * i) / cols;
          ctx.moveTo(lx, y);
          ctx.lineTo(lx, y + h * 0.28);
        }
      });
      return;
    }
    case 'compComponent':
      fillStrokeShape(() => {
        ctx.rect(x + w * 0.12, y, w * 0.88, h);
        ctx.rect(x, y + h * 0.22, w * 0.22, h * 0.35);
        ctx.rect(x, y + h * 0.62, w * 0.22, h * 0.35);
      });
      return;
    case 'compComponentAlt':
      fillStrokeShape(() => {
        ctx.rect(x, y, w, h);
        ctx.rect(x + w * 0.68, y + h * 0.08, w * 0.24, h * 0.18);
      });
      return;
    case 'compProvided': {
      const midY = cy(b);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.35, midY);
      ctx.lineTo(x + w, midY);
      ctx.arc(x + w * 0.35, midY, h * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    case 'compAssembly': {
      const midY = cy(b);
      ctx.beginPath();
      ctx.moveTo(x, midY);
      ctx.lineTo(x + w * 0.45, midY);
      ctx.arc(x + w * 0.55, midY, h * 0.2, Math.PI / 2, -Math.PI / 2, true);
      ctx.arc(x + w * 0.38, midY, h * 0.12, -Math.PI / 2, Math.PI / 2, true);
      ctx.stroke();
      return;
    }
    case 'compRequired': {
      const midY = cy(b);
      ctx.beginPath();
      ctx.moveTo(x + w, midY);
      ctx.lineTo(x + w * 0.45, midY);
      ctx.arc(x + w * 0.45, midY, h * 0.2, -Math.PI / 2, Math.PI / 2, true);
      ctx.stroke();
      return;
    }
    case 'stateInitial':
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(cx(b), cy(b), Math.min(w, h) / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    case 'stateFinal': {
      const r = Math.min(w, h) / 2;
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(cx(b), cy(b), r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(cx(b), cy(b), r - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.beginPath();
      ctx.arc(cx(b), cy(b), r, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    case 'stateForkJoin':
      ctx.fillStyle = stroke;
      ctx.fillRect(x, y + h * 0.42, w, h * 0.16);
      return;
    case 'star4':
      ctx.fillStyle = fill;
      ctx.beginPath();
      starN(ctx, b, 4);
      ctx.fill();
      ctx.stroke();
      return;
    case 'star6':
      ctx.fillStyle = fill;
      ctx.beginPath();
      starN(ctx, b, 6);
      ctx.fill();
      ctx.stroke();
      return;
    case 'calloutBurst':
      fillStrokeShape(() => burstPath(ctx, x, y, w, h));
      return;
    default:
      strokeShape();
  }
}

export function getExtendedDiagramOutlinePoints(
  kind: ShapeKind,
  x: number,
  y: number,
  w: number,
  h: number,
): Pt[] | null {
  if (kind === 'documentWavy' || kind === 'display' || kind === 'manualInput' || kind === 'calloutBurst'
    || kind === 'flowOffPage') {
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ];
  }
  if (kind === 'star4' || kind === 'star6') {
    const b: Box = { x, y, w, h };
    const points = kind === 'star4' ? 4 : 6;
    const outer = Math.min(w, h) / 2 * 0.9;
    const inner = outer * 0.42;
    const centerX = cx(b);
    const centerY = cy(b);
    const pts: Pt[] = [];
    const total = points * 2;
    for (let i = 0; i < total; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = -Math.PI / 2 + (i * Math.PI) / points;
      pts.push({ x: centerX + r * Math.cos(a), y: centerY + r * Math.sin(a) });
    }
    return pts;
  }
  return null;
}
