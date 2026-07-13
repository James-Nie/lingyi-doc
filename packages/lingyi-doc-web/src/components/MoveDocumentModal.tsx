import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DocumentManager } from '@lingyi-doc/core';
import type { DocumentListItem } from '@lingyi-doc/core';
import { knowledgeBaseStore } from '../stores/knowledgeBaseStore';
import type { KnowledgeBase, WikiSpaceNode } from '../stores/knowledgeBaseStore';
import { getDocTypeMeta } from '../utils/docTypeMeta';
import { listMoveTargets } from '../utils/kbTreeUtils';
import {
  moveDocument,
  type MoveDocumentSource,
  type MoveDocumentTarget,
} from '../utils/moveDocument';

interface MoveDocumentModalProps {
  open: boolean;
  source: MoveDocumentSource | null;
  onClose: () => void;
  onMoved?: (target: MoveDocumentTarget) => void;
  onError?: (message: string) => void;
}

type LeftSelection =
  | { scope: 'library' }
  | { scope: 'kb'; kbId: string };

type RightSelection =
  | { scope: 'library' }
  | { scope: 'kb'; kbId: string; parentId: string | null; label: string };

const LIBRARY_SCOPE = 'library' as const;

export const MoveDocumentModal: React.FC<MoveDocumentModalProps> = ({
  open,
  source,
  onClose,
  onMoved,
  onError,
}) => {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [libraryDocs, setLibraryDocs] = useState<DocumentListItem[]>([]);
  const [kbNodes, setKbNodes] = useState<WikiSpaceNode[]>([]);
  const [leftSelection, setLeftSelection] = useState<LeftSelection>({ scope: LIBRARY_SCOPE });
  const [rightSelection, setRightSelection] = useState<RightSelection | null>(null);

  useEffect(() => {
    if (!open || !source) return;
    setSearch('');
    setLeftSelection({ scope: LIBRARY_SCOPE });
    setRightSelection({ scope: LIBRARY_SCOPE });
    setLoading(true);

    void (async () => {
      try {
        await knowledgeBaseStore.reload();
        const kbList = knowledgeBaseStore.list();
        setKbs(kbList);
        const docs = await DocumentManager.list('updated');
        setLibraryDocs(docs);
        if (kbList.length > 0) {
          await knowledgeBaseStore.loadNodes(kbList[0].id);
        }
      } catch {
        setKbs([]);
        setLibraryDocs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, source?.docId]);

  useEffect(() => {
    if (!open || leftSelection.scope !== 'kb') {
      setKbNodes([]);
      return;
    }
    let cancelled = false;
    void knowledgeBaseStore.loadNodes(leftSelection.kbId).then(nodes => {
      if (!cancelled) setKbNodes(nodes);
    });
    return () => { cancelled = true; };
  }, [open, leftSelection]);

  const filteredKbs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return kbs;
    return kbs.filter(kb => kb.name.toLowerCase().includes(q));
  }, [kbs, search]);

  const homeNode = useMemo(
    () => kbNodes.find(node => node.isHome) ?? null,
    [kbNodes],
  );

  const kbMoveTargets = useMemo(() => {
    if (leftSelection.scope !== 'kb') return [];
    const excludeId = source?.kbNode?.kbId === leftSelection.kbId
      ? source.kbNode.nodeId
      : '__none__';
    return listMoveTargets(kbNodes, excludeId);
  }, [kbNodes, leftSelection, source?.kbNode]);

  const filteredLibraryDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return libraryDocs;
    return libraryDocs.filter(doc => (doc.title || '').toLowerCase().includes(q));
  }, [libraryDocs, search]);

  const filteredKbTargets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return kbMoveTargets;
    return kbMoveTargets.filter(node => (node.title || '').toLowerCase().includes(q));
  }, [kbMoveTargets, search]);

  const rightTitle = useMemo(() => {
    if (leftSelection.scope === LIBRARY_SCOPE) return '我的文档库';
    return kbs.find(kb => kb.id === leftSelection.kbId)?.name ?? '知识库';
  }, [leftSelection, kbs]);

  const handleSelectLeft = (selection: LeftSelection) => {
    setLeftSelection(selection);
    if (selection.scope === LIBRARY_SCOPE) {
      setRightSelection({ scope: LIBRARY_SCOPE });
      return;
    }
    const home = knowledgeBaseStore.listNodes(selection.kbId).find(node => node.isHome);
    setRightSelection({
      scope: 'kb',
      kbId: selection.kbId,
      parentId: home?.id ?? null,
      label: kbs.find(item => item.id === selection.kbId)?.name ?? '知识库',
    });
  };

  const buildTarget = (): MoveDocumentTarget | null => {
    if (!rightSelection) return null;
    if (rightSelection.scope === LIBRARY_SCOPE) {
      return { scope: 'library' };
    }
    return {
      scope: 'kb',
      kbId: rightSelection.kbId,
      parentId: rightSelection.parentId,
    };
  };

  const canSubmit = useMemo(() => {
    if (!source || !rightSelection) return false;
    const target = buildTarget();
    if (!target) return false;
    if (target.scope === 'library' && !source.kbNode) return false;
    if (target.scope === 'kb' && source.kbNode) {
      const homeId = knowledgeBaseStore.listNodes(target.kbId).find(node => node.isHome)?.id ?? null;
      const sourceParent = !source.kbNode.parentId || source.kbNode.parentId === homeId
        ? homeId
        : source.kbNode.parentId;
      const targetParent = !target.parentId || target.parentId === homeId
        ? homeId
        : target.parentId;
      if (source.kbNode.kbId === target.kbId && sourceParent === targetParent) return false;
    }
    return true;
  }, [rightSelection, source]);

  if (!open || !source) return null;

  return createPortal(
    <div style={overlayStyle} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="移动到"
        onMouseDown={e => e.stopPropagation()}
        style={dialogStyle}
      >
        <div style={headerStyle}>
          <span>从 {source.locationLabel} 移动到</span>
          <button type="button" onClick={onClose} aria-label="关闭" style={closeBtnStyle}>×</button>
        </div>

        <div style={bodyStyle}>
          <aside style={leftPaneStyle}>
            <div style={searchWrapStyle}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8f959e" strokeWidth="2">
                <circle cx="11" cy="11" r="7" /><path d="M20 20l-3-3" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="搜索目标位置"
                style={searchInputStyle}
              />
            </div>

            <button
              type="button"
              onClick={() => handleSelectLeft({ scope: LIBRARY_SCOPE })}
              style={{
                ...leftItemStyle,
                background: leftSelection.scope === LIBRARY_SCOPE ? '#edf3ff' : 'transparent',
                color: leftSelection.scope === LIBRARY_SCOPE ? '#3370ff' : '#1f2329',
              }}
            >
              <span style={libraryIconStyle}>库</span>
              我的文档库
            </button>

            <div style={groupLabelStyle}>全部知识库</div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              {filteredKbs.map(kb => {
                const active = leftSelection.scope === 'kb' && leftSelection.kbId === kb.id;
                return (
                  <button
                    key={kb.id}
                    type="button"
                    onClick={() => handleSelectLeft({ scope: 'kb', kbId: kb.id })}
                    style={{
                      ...leftItemStyle,
                      background: active ? '#edf3ff' : 'transparent',
                      color: active ? '#3370ff' : '#1f2329',
                    }}
                  >
                    <span style={kbEmojiStyle(kb.cover)}>{kb.emoji || '知'}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {kb.name}
                    </span>
                  </button>
                );
              })}
              {!loading && filteredKbs.length === 0 && (
                <div style={{ padding: '12px 14px', fontSize: 13, color: '#8f959e' }}>暂无知识库</div>
              )}
            </div>
          </aside>

          <section style={rightPaneStyle}>
            <div style={rightHeaderStyle}>{rightTitle}</div>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 0' }}>
              {loading ? (
                <div style={emptyStyle}>加载中…</div>
              ) : leftSelection.scope === LIBRARY_SCOPE ? (
                <>
                  <button
                    type="button"
                    onClick={() => setRightSelection({ scope: LIBRARY_SCOPE })}
                    style={{
                      ...rightItemStyle,
                      background: rightSelection?.scope === LIBRARY_SCOPE ? '#edf3ff' : 'transparent',
                    }}
                  >
                    <span style={libraryIconStyle}>库</span>
                    <span style={{ fontWeight: 500 }}>我的文档库</span>
                  </button>
                  {filteredLibraryDocs.map(doc => {
                    const meta = getDocTypeMeta(doc.docType);
                    const isMovingDoc = doc.id === source.docId;
                    return (
                      <div
                        key={doc.id}
                        style={{
                          ...rightItemStyle,
                          opacity: isMovingDoc ? 0.45 : 1,
                          cursor: 'default',
                        }}
                      >
                        <span style={{
                          width: 24, height: 24, borderRadius: 4, background: meta.bg,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, color: meta.color, fontWeight: 600, flexShrink: 0,
                        }}>
                          {meta.icon}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.title || '未命名文档'}
                        </span>
                      </div>
                    );
                  })}
                </>
              ) : (
                filteredKbTargets.map(node => {
                  const active = rightSelection?.scope === 'kb'
                    && rightSelection.kbId === leftSelection.kbId
                    && rightSelection.parentId === (node.isHome ? (homeNode?.id ?? null) : node.id);
                  const meta = node.isHome ? getDocTypeMeta('page') : getDocTypeMeta('folder');
                  const parentId = node.isHome ? (homeNode?.id ?? null) : node.id;
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => setRightSelection({
                        scope: 'kb',
                        kbId: leftSelection.kbId,
                        parentId,
                        label: node.title || (node.isHome ? '首页' : '文件夹'),
                      })}
                      style={{
                        ...rightItemStyle,
                        background: active ? '#edf3ff' : 'transparent',
                      }}
                    >
                      <span style={{
                        width: 24, height: 24, borderRadius: 4, background: meta.bg,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, color: meta.color, fontWeight: 600, flexShrink: 0,
                      }}>
                        {meta.icon}
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {node.title || (node.isHome ? '首页' : '未命名文件夹')}
                      </span>
                    </button>
                  );
                })
              )}
              {!loading && leftSelection.scope === 'kb' && filteredKbTargets.length === 0 && (
                <div style={emptyStyle}>暂无可选文件夹</div>
              )}
            </div>
          </section>
        </div>

        <div style={footerStyle}>
          <button type="button" onClick={onClose} style={btnSecondary}>取消</button>
          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={() => {
              const target = buildTarget();
              if (!target) return;
              setSubmitting(true);
              void moveDocument(source, target)
                .then(() => {
                  onMoved?.(target);
                  onClose();
                })
                .catch(err => {
                  onError?.((err as Error).message || '移动失败');
                })
                .finally(() => setSubmitting(false));
            }}
            style={{
              ...btnPrimary,
              opacity: !canSubmit || submitting ? 0.5 : 1,
              cursor: !canSubmit || submitting ? 'not-allowed' : 'pointer',
            }}
          >
            确定
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  zIndex: 12000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
};

const dialogStyle: React.CSSProperties = {
  width: 720,
  maxWidth: '100%',
  maxHeight: '80vh',
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 20px',
  borderBottom: '1px solid #eee',
  fontSize: 16,
  fontWeight: 600,
};

const closeBtnStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  fontSize: 22,
  lineHeight: 1,
  color: '#8f959e',
  cursor: 'pointer',
  padding: 0,
};

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  minHeight: 360,
  flex: 1,
  overflow: 'hidden',
};

const leftPaneStyle: React.CSSProperties = {
  width: 220,
  flexShrink: 0,
  borderRight: '1px solid #eee',
  display: 'flex',
  flexDirection: 'column',
  background: '#fafbfc',
};

const searchWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  margin: '12px 12px 8px',
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid #dee0e3',
  background: '#fff',
};

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  border: 'none',
  outline: 'none',
  fontSize: 13,
  background: 'transparent',
};

const groupLabelStyle: React.CSSProperties = {
  padding: '8px 14px 4px',
  fontSize: 12,
  color: '#8f959e',
};

const leftItemStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '9px 14px',
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  textAlign: 'left',
};

const rightPaneStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
};

const rightHeaderStyle: React.CSSProperties = {
  padding: '14px 16px 10px',
  fontSize: 14,
  fontWeight: 600,
  color: '#1f2329',
  borderBottom: '1px solid #f0f1f2',
};

const rightItemStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 16px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: 14,
  color: '#1f2329',
  textAlign: 'left',
};

const emptyStyle: React.CSSProperties = {
  padding: 24,
  textAlign: 'center',
  color: '#8f959e',
  fontSize: 13,
};

const footerStyle: React.CSSProperties = {
  padding: '12px 20px',
  borderTop: '1px solid #eee',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
};

const btnSecondary: React.CSSProperties = {
  height: 32,
  padding: '0 16px',
  borderRadius: 6,
  border: '1px solid #dee0e3',
  background: '#fff',
  cursor: 'pointer',
  fontSize: 13,
};

const btnPrimary: React.CSSProperties = {
  height: 32,
  padding: '0 16px',
  borderRadius: 6,
  border: 'none',
  background: '#3370ff',
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13,
};

const libraryIconStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 6,
  background: '#e8f0fe',
  color: '#3370ff',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 700,
  flexShrink: 0,
};

function kbEmojiStyle(cover: KnowledgeBase['cover']): React.CSSProperties {
  const palette = cover === 'sunset'
    ? { bg: '#ffe8e1', color: '#e8714a' }
    : { bg: '#e8f5e9', color: '#2e7d32' };
  return {
    width: 24,
    height: 24,
    borderRadius: 6,
    background: palette.bg,
    color: palette.color,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
  };
}
