/**
 * 工作流编辑器 - 中间画布
 *
 * 交互规则：
 * - 节点不可拖拽移动，间距自动均匀分布
 * - 连线不可删除，不可选中
 * - 连线中间的「+」按钮始终可见，hover 时背景加深
 * - 左侧面板仅用于节点类型参考和切换，不提供拖拽/点击添加
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Empty, Input, Popover, Tooltip } from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  GatewayOutlined,
  MinusOutlined,
  PlusOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import {
  computeWorkflowLayout,
  countIfElseConditions,
  getBranchLabel,
  getBranchPortPosition,
  getNodeBranchPorts,
  getNodeMeta,
  isBranchNodeType,
  isIfElseConfigured,
  isSwitchConfigured,
  normalizeSwitchConfig,
  WORKFLOW_NODE_HEIGHT,
  WORKFLOW_NODE_WIDTH,
  type WorkflowEdge,
  type WorkflowNode,
} from '@lingyi-doc/core-sheet';
import { NodeLibrary } from './NodeLibrary';

export interface CanvasNode extends WorkflowNode {}
export interface CanvasEdge extends WorkflowEdge {}

export interface CanvasTransform {
  x: number;
  y: number;
  scale: number;
}

interface WorkflowCanvasProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onDeleteNode: (id: string) => void;
  onRenameNode?: (id: string, name: string) => void;
  onChangeNodeType?: (id: string, newType: string) => void;
  onDuplicateNode?: (id: string) => void;
  onInsertNodeOnEdge?: (edgeId: string, type: string) => void;
}

const NODE_WIDTH = WORKFLOW_NODE_WIDTH;
const NODE_HEIGHT = WORKFLOW_NODE_HEIGHT;
const BRANCH_JUNCTION_OFFSET = 32;

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onDeleteNode,
  onRenameNode,
  onChangeNodeType,
  onDuplicateNode,
  onInsertNodeOnEdge,
}) => {
  const layoutNodes = useMemo(() => computeWorkflowLayout(nodes, edges), [nodes, edges]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<CanvasTransform>({ x: 0, y: 0, scale: 1 });
  const [panning, setPanning] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [linkingFrom, setLinkingFrom] = useState<{ nodeId: string; branch?: string } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [popoverEdgeId, setPopoverEdgeId] = useState<string | null>(null);
  const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  /** hover 在 "+" 按钮上的 edge id */
  const [hoveredBtnId, setHoveredBtnId] = useState<string | null>(null);

  const screenToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      return { x: (sx - transform.x) / transform.scale, y: (sy - transform.y) / transform.scale };
    },
    [transform],
  );

  // 空格键监听：按住空格可拖拽平移画布
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        setSpacePressed(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, []);

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // 中键 / 空格+左键 / 左键拖拽空白区域 → 平移画布
      const isPanningGesture = e.button === 1 || (e.button === 0 && spacePressed) || (e.button === 0 && e.target === e.currentTarget);
      if (isPanningGesture) {
        e.preventDefault();
        const startX = e.clientX;
        const startY = e.clientY;
        const startTransform = { ...transform };
        setPanning(true);
        const move = (ev: MouseEvent) => {
          setTransform({ x: startTransform.x + (ev.clientX - startX), y: startTransform.y + (ev.clientY - startY), scale: startTransform.scale });
        };
        const up = () => { setPanning(false); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        // 左键点空白同时取消选中
        if (e.button === 0 && e.target === e.currentTarget && !spacePressed) {
          onSelectNode(null);
        }
      } else if (e.button === 0) {
        if (e.target === e.currentTarget) { onSelectNode(null); }
      }
    },
    [onSelectNode, spacePressed, transform],
  );

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const handler = (e: WheelEvent) => {
      if (!wrap.contains(e.target as Node)) return;
      e.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const delta = -e.deltaY * 0.001;
      setTransform((prev) => {
        const nextScale = Math.max(0.4, Math.min(2, prev.scale + delta));
        const ratio = nextScale / prev.scale;
        return { scale: nextScale, x: cx - (cx - prev.x) * ratio, y: cy - (cy - prev.y) * ratio };
      });
    };
    wrap.addEventListener('wheel', handler, { passive: false });
    return () => wrap.removeEventListener('wheel', handler);
  }, []);

  // 连线端口拖拽
  const handlePortMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, node: CanvasNode, branch?: string) => {
      e.stopPropagation();
      e.preventDefault();
      setLinkingFrom({ nodeId: node.id, branch });
      const pos = screenToCanvas(e.clientX, e.clientY);
      setMousePos(pos);
    },
    [screenToCanvas],
  );

  useEffect(() => {
    if (!linkingFrom) return;
    const move = (e: MouseEvent) => {
      const pos = screenToCanvas(e.clientX, e.clientY);
      setMousePos(pos);
    };
    const up = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const portEl = el?.closest('[data-bwf-port-in]') as HTMLElement | null;
      if (portEl) {
        const targetId = portEl.getAttribute('data-bwf-port-in');
        if (targetId && targetId !== linkingFrom.nodeId) {
          window.dispatchEvent(new CustomEvent('bwf:connect', { detail: { sourceNodeId: linkingFrom.nodeId, targetNodeId: targetId, branch: linkingFrom.branch } }));
        }
      }
      setLinkingFrom(null);
      setMousePos(null);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, [linkingFrom, screenToCanvas]);

  const getNodeCenter = useCallback((node: CanvasNode) => ({ x: node.position.x + NODE_WIDTH / 2, y: node.position.y + NODE_HEIGHT }), []);

  const isBranchEdge = useCallback(
    (edge: CanvasEdge): boolean => {
      const source = layoutNodes.find((n) => n.id === edge.sourceNodeId);
      if (!source) return false;
      return isBranchNodeType(source.type) && Boolean(edge.branch);
    },
    [layoutNodes],
  );

  const getEdgeEndpoints = useCallback(
    (edge: CanvasEdge): { s: { x: number; y: number }; t: { x: number; y: number } } | null => {
      const source = layoutNodes.find((n) => n.id === edge.sourceNodeId);
      const target = layoutNodes.find((n) => n.id === edge.targetNodeId);
      if (!source || !target) return null;
      const t = { x: target.position.x + NODE_WIDTH / 2, y: target.position.y };
      if (isBranchEdge(edge)) {
        const ports = getNodeBranchPorts(source);
        const s = getBranchPortPosition(source.position, edge.branch ?? '', ports, NODE_WIDTH, NODE_HEIGHT);
        return { s, t };
      }
      return { s: getNodeCenter(source), t };
    },
    [getNodeCenter, isBranchEdge, layoutNodes],
  );

  const renderEdgePath = useCallback(
    (edge: CanvasEdge): string => {
      const ep = getEdgeEndpoints(edge);
      if (!ep) return '';
      const { s, t } = ep;
      if (isBranchEdge(edge)) {
        const junctionY = s.y + BRANCH_JUNCTION_OFFSET;
        if (Math.abs(t.x - s.x) < 1) {
          return `M ${s.x} ${s.y} L ${s.x} ${t.y}`;
        }
        return `M ${s.x} ${s.y} L ${s.x} ${junctionY} L ${t.x} ${junctionY} L ${t.x} ${t.y}`;
      }
      return `M ${s.x} ${s.y} L ${t.x} ${t.y}`;
    },
    [getEdgeEndpoints, isBranchEdge],
  );

  const getBranchLabelAnchor = useCallback(
    (edge: CanvasEdge): { x: number; y: number } | null => {
      const source = layoutNodes.find((n) => n.id === edge.sourceNodeId);
      const target = layoutNodes.find((n) => n.id === edge.targetNodeId);
      if (!source || !target || !edge.branch) return null;
      const ports = getNodeBranchPorts(source);
      const s = getBranchPortPosition(source.position, edge.branch, ports, NODE_WIDTH, NODE_HEIGHT);
      const junctionY = s.y + BRANCH_JUNCTION_OFFSET;
      return { x: target.position.x + NODE_WIDTH / 2, y: junctionY };
    },
    [getNodeBranchPorts, layoutNodes],
  );

  const getEdgeMidpoint = useCallback(
    (edge: CanvasEdge): { x: number; y: number } | null => {
      const ep = getEdgeEndpoints(edge);
      if (!ep) return null;
      return { x: (ep.s.x + ep.t.x) / 2, y: (ep.s.y + ep.t.y) / 2 };
    },
    [getEdgeEndpoints],
  );

  // 节点点击 → 选中（不可拖拽）
  const handleNodeClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, nodeId: string) => {
      e.stopPropagation();
      onSelectNode(nodeId);
    },
    [onSelectNode],
  );

  const showEmptyHint = nodes.length === 0;

  return (
    <div className="bwf-canvas-wrap" ref={wrapRef}>
      <div
        className={`bwf-canvas ${panning ? 'bwf-canvas--panning' : ''} ${spacePressed ? 'bwf-canvas--space' : ''}`}
        onMouseDown={handleCanvasMouseDown}
      >
        <div className="bwf-canvas__viewport" style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}>
          {/* 连线（不可点击、不可选中） */}
          <svg className="bwf-canvas__svg" width="1" height="1" style={{ overflow: 'visible' }}>
            {edges.map((edge) => {
              const d = renderEdgePath(edge);
              if (!d) return null;
              return (
                <g key={edge.id}>
                  <path d={d} className="bwf-canvas__edge-path" />
                  {isBranchEdge(edge) && edge.branch && (() => {
                    const source = layoutNodes.find((n) => n.id === edge.sourceNodeId);
                    const label = source ? getBranchLabel(source, edge.branch) : edge.branch;
                    const anchor = getBranchLabelAnchor(edge);
                    if (!anchor) return null;
                    const branchClass =
                      edge.branch === 'true' ? 'bwf-canvas__edge-label--true'
                      : edge.branch === 'false' ? 'bwf-canvas__edge-label--false'
                      : edge.branch === 'default' ? 'bwf-canvas__edge-label--default'
                      : '';
                    const isBoolean =
                      source && isBranchNodeType(source.type) && ['true', 'false'].includes(edge.branch);
                    return (
                      <g className={`bwf-canvas__edge-label-group ${branchClass}`} transform={`translate(${anchor.x}, ${anchor.y})`}>
                        <rect className="bwf-canvas__edge-label-bg" x={-38} y={-14} width={76} height={22} rx={11} />
                        {isBoolean && (
                          <text className="bwf-canvas__edge-label-icon" x={-30} y={2} textAnchor="middle" dominantBaseline="central">
                            {edge.branch === 'true' ? <CheckOutlined /> : <CloseOutlined />}
                          </text>
                        )}
                        <text
                          className="bwf-canvas__edge-label"
                          x={isBoolean ? -18 : 0}
                          y={2}
                          textAnchor={isBoolean ? 'start' : 'middle'}
                          dominantBaseline="central"
                        >
                          {label}
                        </text>
                      </g>
                    );
                  })()}
                </g>
              );
            })}
            {linkingFrom && mousePos && (() => {
              const source = layoutNodes.find((n) => n.id === linkingFrom.nodeId);
              if (!source) return null;
              const ports = getNodeBranchPorts(source);
              const s = linkingFrom.branch
                ? getBranchPortPosition(source.position, linkingFrom.branch, ports, NODE_WIDTH, NODE_HEIGHT)
                : { x: source.position.x + NODE_WIDTH / 2, y: source.position.y + NODE_HEIGHT };
              return <line x1={s.x} y1={s.y} x2={mousePos.x} y2={mousePos.y} className="bwf-canvas__edge-path" strokeDasharray="4 4" />;
            })()}
          </svg>

          {/* 连线中间「+」按钮 —— 始终可见 */}
          {edges.map((edge) => {
            if (!edge.sourceNodeId || !edge.targetNodeId) return null;
            const mid = getEdgeMidpoint(edge);
            if (!mid || !onInsertNodeOnEdge) return null;
            const isHovered = hoveredBtnId === edge.id;
            return (
              <div
                key={`add-${edge.id}`}
                className="bwf-edge-add"
                style={{ left: mid.x - 14, top: mid.y - 14 }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setPopoverEdgeId(edge.id); }}
                onMouseEnter={() => setHoveredBtnId(edge.id)}
                onMouseLeave={() => setHoveredBtnId((cur) => (cur === edge.id ? null : cur))}
              >
                <Popover
                  open={popoverEdgeId === edge.id}
                  onOpenChange={(o) => setPopoverEdgeId(o ? edge.id : null)}
                  trigger="click"
                  placement="right"
                  destroyTooltipOnHide
                  content={
                    <div className="bwf-pick-node-popover">
                      <div className="bwf-pick-node-popover__title">选择节点类型</div>
                      <NodeLibrary onClickAdd={(type) => { onInsertNodeOnEdge(edge.id, type); setPopoverEdgeId(null); }} />
                    </div>
                  }
                >
                  <Tooltip title="添加节点" placement="top">
                    <div
                      className="bwf-edge-add__btn"
                      aria-label="insert-node"
                      style={{
                        background: isHovered ? '#3370ff' : '#fff',
                        color: isHovered ? '#fff' : '#3370ff',
                      }}
                    >
                      <PlusOutlined />
                    </div>
                  </Tooltip>
                </Popover>
              </div>
            );
          })}

          {/* 节点 */}
          {layoutNodes.map((node) => {
            const meta = getNodeMeta(node.type);
            const isSelected = node.id === selectedNodeId;
            const branches = getNodeBranchPorts(node);
            const isBranchNode = isBranchNodeType(node.type);
            const isInit = node.type.startsWith('trigger.') || node.type === 'start';
            const isEnd = node.type === 'end';
            const isRenaming = renamingNodeId === node.id;
            return (
              <div key={node.id}
                className={`bwf-node ${isSelected ? 'bwf-node--selected' : ''} ${isInit ? 'bwf-node--start' : ''} ${isEnd ? 'bwf-node--end' : ''}`}
                style={{ left: node.position.x, top: node.position.y, width: NODE_WIDTH, cursor: 'default' }}
                onMouseDown={(e) => handleNodeClick(e, node.id)}>
                <div className="bwf-node__header">
                  <span className="bwf-node__icon" style={{ background: meta?.color ?? '#8c8c8c' }}>{meta?.icon ?? '\u2699\uFE0F'}</span>
                  {isRenaming ? (
                    <Input autoFocus size="small" value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => { if (renameDraft.trim()) onRenameNode?.(node.id, renameDraft.trim()); setRenamingNodeId(null); }}
                      onPressEnter={() => { if (renameDraft.trim()) onRenameNode?.(node.id, renameDraft.trim()); setRenamingNodeId(null); }}
                      onKeyDown={(e) => { if (e.key === 'Escape') setRenamingNodeId(null); e.stopPropagation(); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{ flex: 1, minWidth: 0 }} />
                  ) : (
                    <span className="bwf-node__title"
                      onDoubleClick={(e) => { if (isEnd) return; e.stopPropagation(); setRenamingNodeId(node.id); setRenameDraft(node.name || meta?.label || node.type); }}>
                      {node.name || meta?.label || node.type}
                    </span>
                  )}
                  <div className="bwf-node__actions" onMouseDown={(e) => e.stopPropagation()}>
                    {!isEnd && (
                    <Popover trigger="click" placement="bottomRight" destroyTooltipOnHide
                      content={
                        <div className="bwf-node-menu">
                          <div className="bwf-node-menu__item" onClick={() => { setRenamingNodeId(node.id); setRenameDraft(node.name || meta?.label || node.type); document.body.click(); }}>
                            <EditOutlined /><span>重命名</span>
                          </div>
                          <div className="bwf-node-menu__submenu">
                            <span className="bwf-node-menu__item"><SwapOutlined /><span>更换节点类型</span><span className="bwf-node-menu__arrow">{'>'}</span></span>
                            <div className="bwf-node-menu__submenu-panel">
                              <NodeLibrary 
                                onClickAdd={(type) => { onChangeNodeType?.(node.id, type); }} 
                                filterMode={isInit ? 'trigger' : 'all'}
                              />
                            </div>
                          </div>
                          {!isInit && (
                            <div className="bwf-node-menu__item" onClick={() => onDuplicateNode?.(node.id)}><CopyOutlined /><span>创建副本</span></div>
                          )}
                        </div>
                      }>
                      <Tooltip title="编辑节点" placement="top">
                        <span className="bwf-node__action-btn" onClick={(e) => e.stopPropagation()} role="button" aria-label="node-edit"><EditOutlined /></span>
                      </Tooltip>
                    </Popover>
                    )}
                    {!isInit && !isEnd && (
                      <Tooltip title="删除节点" placement="top">
                        <span className="bwf-node__action-btn bwf-node__action-btn--danger" onClick={(e) => { e.stopPropagation(); onDeleteNode(node.id); }} role="button" aria-label="node-delete">
                          <DeleteOutlined />
                        </span>
                      </Tooltip>
                    )}
                  </div>
                </div>
                <div className={`bwf-node__body ${isEnd || isInit || node.type === 'trigger.manual' ? 'bwf-node__body--empty' : ''}`}>
                  {summarizeNode(node)}
                </div>
                {!isInit && !isEnd && <div className="bwf-node__port bwf-node__port--in" data-bwf-port-in={node.id} />}
                {isEnd ? null : branches.length > 0 ? (
                  branches.map((b, bi) => {
                    const portTone =
                      b.key === 'true' ? 'bwf-node__port--branch-true'
                      : b.key === 'false' ? 'bwf-node__port--branch-false'
                      : b.key === 'default' ? 'bwf-node__port--branch-default'
                      : '';
                    return (
                      <div key={b.key} className={`bwf-node__port bwf-node__port--branch bwf-node__port--branch-bottom ${portTone}`}
                        style={{ left: `${((bi + 0.5) / branches.length) * 100}%`, bottom: -6, top: 'auto', right: 'auto', transform: 'translateX(-50%)' }}
                        data-bwf-port-out={node.id} data-bwf-port-branch={b.key} onMouseDown={(e) => handlePortMouseDown(e, node, b.key)} />
                    );
                  })
                ) : (
                  <div className="bwf-node__port bwf-node__port--out" data-bwf-port-out={node.id} onMouseDown={(e) => handlePortMouseDown(e, node)} />
                )}
                {isBranchNode && node.type === 'condition.switch' && (
                  <div className="bwf-node__branch-hint">
                    {normalizeSwitchConfig(node.config ?? {}).executionMode === 'first' ? '仅执行一条' : '同时执行多条'}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {showEmptyHint && (
          <div className="bwf-canvas__empty">
            <Empty image={<GatewayOutlined style={{ fontSize: 36, color: '#c9cdd4' }} />}
              description={<><div>从连线中间「+」按钮添加节点</div><div style={{ fontSize: 12, marginTop: 4 }}>建议以「触发器」开始（如：添加新记录时）</div></>} />
          </div>
        )}
      </div>

      <div className="bwf-canvas__zoom">
        <button className="bwf-canvas__zoom-btn" onClick={() => setTransform((t) => ({ ...t, scale: Math.max(0.4, t.scale - 0.1) }))} aria-label="缩小"><MinusOutlined /></button>
        <span className="bwf-canvas__zoom-value">{Math.round(transform.scale * 100)}%</span>
        <button className="bwf-canvas__zoom-btn" onClick={() => setTransform((t) => ({ ...t, scale: Math.min(2, t.scale + 0.1) }))} aria-label="放大"><PlusOutlined /></button>
        <button className="bwf-canvas__zoom-btn" onClick={() => setTransform({ x: 0, y: 0, scale: 1 })} aria-label="重置" title="重置视图">{'\u27F3'}</button>
      </div>
    </div>
  );
};

function summarizeNode(node: CanvasNode): React.ReactNode {
  const cfg = node.config ?? {};
  switch (node.type) {
    case 'condition.if': {
      if (!isIfElseConfigured(cfg)) return <span className="bwf-node__body--empty">未完成设置</span>;
      const count = countIfElseConditions(cfg);
      return count > 0 ? `${count} 个条件` : <span className="bwf-node__body--empty">未完成设置</span>;
    }
    case 'condition.switch': {
      if (!isSwitchConfigured(cfg)) return <span className="bwf-node__body--empty">未完成设置</span>;
      const switchCfg = normalizeSwitchConfig(cfg);
      return `${switchCfg.branches.length} 个分支`;
    }
    case 'record.create': {
      const fields = (cfg.fields as Record<string, unknown> | undefined) ?? {};
      const keys = Object.keys(fields);
      return keys.length ? `设置 ${keys.length} 个字段` : '未配置字段';
    }
    case 'record.update': {
      const fields = (cfg.fields as Record<string, unknown> | undefined) ?? {};
      return Object.keys(fields).length ? `更新 ${Object.keys(fields).length} 个字段` : '未配置';
    }
    case 'record.find': return '按条件查找记录';
    case 'ai.analyze': case 'ai.classify': case 'ai.generate_text': case 'ai.agent':
      return (cfg.prompt as string) || '未配置 Prompt';
    case 'notify.feishu_message': case 'notify.dingtalk_bot':
      return (cfg.title as string) || '未配置通知';
    case 'end': return '流程结束';
    case 'start': case 'trigger.manual': return '手动触发';
    default:
      if (node.type.startsWith('trigger.')) return '触发器';
      return '';
  }
}
