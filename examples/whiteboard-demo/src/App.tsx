import { useState, useCallback, useRef, useEffect } from 'react';
import { WhiteboardEditor, type WhiteboardEditorProps } from '@lingyi-doc/editor-whiteboard';
import { WhiteboardDocument } from '@lingyi-doc/core-whiteboard';
import { createShapeElement, createStickyElement, STICKY_COLORS, genWhiteboardId } from '@lingyi-doc/core-whiteboard';
import type { WhiteboardElement, WhiteboardViewport, WhiteboardJSON } from '@lingyi-doc/core-whiteboard';
import type { DocCommentThread } from '@lingyi-doc/core-doc';

function createDemoWhiteboard(): WhiteboardJSON {
  return {
    documentId: 'demo-whiteboard',
    title: '示例画板',
    viewport: { x: 80, y: 80, zoom: 1 },
    elements: [
      createShapeElement('rect', 100, 80, 0, { shapeCategoryId: 'basic' }),
      createShapeElement('roundRect', 300, 60, 1, { shapeCategoryId: 'basic' }),
      createShapeElement('ellipse', 500, 80, 2, { shapeCategoryId: 'basic' }),
      createShapeElement('diamond', 100, 200, 3, { shapeCategoryId: 'basic' }),
      createShapeElement('triangle', 300, 200, 4, { shapeCategoryId: 'basic' }),
      createStickyElement(500, 200, STICKY_COLORS[4], 5),
      // 队列图形测试 - 用于验证尺寸是否与边框对齐
      createShapeElement('flowQueue', 100, 350, 6, { shapeCategoryId: 'flowchart' }),
    ],
  };
}

export function App() {
  const docRef = useRef<WhiteboardDocument | null>(null);
  const [elements, setElements] = useState<WhiteboardElement[]>([]);
  const [viewport, setViewport] = useState<WhiteboardViewport>({ x: 0, y: 0, zoom: 1 });
  const [title, setTitle] = useState('示例画板');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [commentThreads, setCommentThreads] = useState<DocCommentThread[]>([]);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [, setTick] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogMessages(prev => [...prev.slice(-49), `[${timestamp}] ${message}`]);
    setTimeout(() => {
      const el = logRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }, []);

  const syncFromDoc = useCallback((doc: WhiteboardDocument) => {
    setElements([...doc.elements]);
    setViewport({ ...doc.viewport });
    setTitle(doc.title);
    setCanUndo(doc.canUndo());
    setCanRedo(doc.canRedo());
  }, []);

  useEffect(() => {
    const doc = new WhiteboardDocument(createDemoWhiteboard());
    docRef.current = doc;
    syncFromDoc(doc);
    addLog('初始化白板文档');
  }, [syncFromDoc, addLog]);

  const handleElementsChange: WhiteboardEditorProps['onElementsChange'] = useCallback((nextElements, recordHistory = true) => {
    const doc = docRef.current;
    if (!doc) return;
    doc.setElements(nextElements, recordHistory);
    syncFromDoc(doc);
    setTick(t => t + 1);
    
    const addedCount = nextElements.length - elements.length;
    const removedCount = elements.length - nextElements.length;
    if (addedCount > 0) {
      addLog(`添加了 ${addedCount} 个图形`);
    } else if (removedCount > 0) {
      addLog(`删除了 ${removedCount} 个图形`);
    } else {
      addLog('图形数据更新');
    }
  }, [syncFromDoc, elements.length, addLog]);

  const handleViewportChange: WhiteboardEditorProps['onViewportChange'] = useCallback((newViewport, recordHistory = false) => {
    const doc = docRef.current;
    if (!doc) return;
    doc.setViewport(newViewport, recordHistory);
    syncFromDoc(doc);
    
    if ('zoom' in newViewport) {
      addLog(`缩放变化: ${newViewport.zoom?.toFixed(1) || viewport.zoom.toFixed(1)}%`);
    }
    if ('x' in newViewport || 'y' in newViewport) {
      addLog(`视图平移: (${newViewport.x ?? viewport.x}, ${newViewport.y ?? viewport.y})`);
    }
  }, [syncFromDoc, viewport, addLog]);

  const handleElementUpdate: WhiteboardEditorProps['onElementUpdate'] = useCallback((id, patch, recordHistory = false) => {
    const doc = docRef.current;
    if (!doc) return;
    doc.updateElement(id, patch, recordHistory);
    syncFromDoc(doc);
    setTick(t => t + 1);
    
    const updatedProps = Object.keys(patch).join(', ');
    addLog(`更新图形 ${id}: ${updatedProps}`);
  }, [syncFromDoc, addLog]);

  const handleUndo = useCallback(() => {
    const doc = docRef.current;
    if (!doc || !doc.undo()) return;
    syncFromDoc(doc);
    setTick(t => t + 1);
    addLog('执行撤销');
  }, [syncFromDoc, addLog]);

  const handleRedo = useCallback(() => {
    const doc = docRef.current;
    if (!doc || !doc.redo()) return;
    syncFromDoc(doc);
    setTick(t => t + 1);
    addLog('执行重做');
  }, [syncFromDoc, addLog]);

  const handleTitleChange = useCallback((t: string) => {
    const doc = docRef.current;
    if (!doc) return;
    doc.title = t;
    setTitle(t);
    addLog(`标题修改为: "${t}"`);
  }, [addLog]);

  const handleSelectComment = useCallback((threadId: string) => {
    setSelectedCommentId(threadId);
    addLog(`选中评论: ${threadId}`);
  }, [addLog]);

  const handleCommentPinMove = useCallback((threadId: string, pinX: number, pinY: number) => {
    addLog(`评论 ${threadId} 移动到: (${pinX}, ${pinY})`);
  }, [addLog]);

  const handleRequestAddComment = useCallback((input: {
    elementId?: string;
    mindNodeId?: string;
    pinX: number;
    pinY: number;
    quote: string;
    pinOffsetX?: number;
    pinOffsetY?: number;
  }) => {
    const newThread: DocCommentThread = {
      id: genWhiteboardId(),
      docId: 'demo-whiteboard',
      elementId: input.elementId,
      pinX: input.pinX,
      pinY: input.pinY,
      pinOffsetX: input.pinOffsetX,
      pinOffsetY: input.pinOffsetY,
      status: 'open',
      createdAt: Date.now(),
      resolvedAt: null,
      comments: [{
        id: genWhiteboardId(),
        threadId: '',
        content: '新评论',
        author: { id: 'user1', name: '用户1', avatar: '' },
        createdAt: Date.now(),
        repliedToId: null,
      }],
      author: { id: 'user1', name: '用户1', avatar: '' },
      quote: input.quote,
    };
    setCommentThreads(prev => [...prev, newThread]);
    addLog(`添加评论: ${newThread.id} at (${input.pinX}, ${input.pinY})`);
  }, [addLog]);

  const handleDeleteComment = useCallback((threadId: string) => {
    setCommentThreads(prev => prev.filter(t => t.id !== threadId));
    if (selectedCommentId === threadId) {
      setSelectedCommentId(null);
    }
    addLog(`删除评论: ${threadId}`);
  }, [selectedCommentId, addLog]);

  const handlePrintData = useCallback(() => {
    const doc = docRef.current;
    if (!doc) return;
    
    const data = doc.toJSON();
    const json = JSON.stringify(data, null, 2);
    console.log('白板完整数据:', json);
    addLog('已在控制台打印完整数据');
    
    setLogMessages(prev => [...prev.slice(-49), '=== 白板数据预览 ===']);
    setTimeout(() => {
      setLogMessages(prev => [...prev.slice(-49), json.slice(0, 1000) + (json.length > 1000 ? '...(truncated)' : '')]);
      setTimeout(() => {
        const el = logRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, 50);
    }, 50);
  }, [docRef, addLog]);

  const handleExportData = useCallback(() => {
    const doc = docRef.current;
    if (!doc) return;
    
    const data = doc.toJSON();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'whiteboard'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addLog(`导出白板数据为 ${title || 'whiteboard'}.json`);
  }, [docRef, title, addLog]);

  const handleClearComments = useCallback(() => {
    setCommentThreads([]);
    setSelectedCommentId(null);
    addLog('清除所有评论');
  }, [addLog]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    const doc = docRef.current;
    if (!doc) return;
    const nextElements = doc.elements.filter(el => !selectedIds.includes(el.id));
    doc.setElements(nextElements, true);
    syncFromDoc(doc);
    setSelectedIds([]);
    setTick(t => t + 1);
    addLog(`删除了 ${selectedIds.length} 个选中元素`);
  }, [selectedIds, syncFromDoc, addLog]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault();
        handleDeleteSelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) handleUndo();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (canRedo) handleRedo();
      } else if (e.key === 'Escape') {
        setSelectedIds([]);
        setSelectedCommentId(null);
        addLog('取消选中');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, canUndo, canRedo, handleDeleteSelected, handleUndo, handleRedo, addLog]);

  // 统计各类元素数量
  const elementStats = useCallback(() => {
    const stats: Record<string, number> = {};
    elements.forEach(el => {
      stats[el.type] = (stats[el.type] || 0) + 1;
    });
    return stats;
  }, [elements]);

  const stats = elementStats();

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      {/* 头部 */}
      <header style={{ padding: '12px 20px', borderBottom: '1px solid #e5e7eb', background: '#fafafa', display: 'flex', alignItems: 'center', gap: 12 }}>
        <strong>@lingyi-doc/editor-whiteboard</strong>
        <span style={{ marginLeft: 12, color: '#6b7280', fontSize: 14 }}>
          画板编辑器 Demo · 完整功能演示
        </span>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280', display: 'flex', gap: 20 }}>
          <span>{elements.length} 个元素</span>
          <span>选中: {selectedIds.length} 个</span>
          <span>评论: {commentThreads.length} 条</span>
          <span>撤销: {canUndo ? '可用' : '无'}</span>
          <span>重做: {canRedo ? '可用' : '无'}</span>
        </div>
        <button onClick={handlePrintData} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>
          打印数据
        </button>
        <button onClick={handleExportData} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: '#5B8FF9', color: '#fff', cursor: 'pointer' }}>
          导出 JSON
        </button>
      </header>

      {/* 主内容区域 */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 白板编辑器 */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <WhiteboardEditor
            title={title}
            elements={elements}
            viewport={viewport}
            canUndo={canUndo}
            canRedo={canRedo}
            commentsEnabled={true}
            commentThreads={commentThreads}
            selectedCommentId={selectedCommentId}
            onTitleChange={handleTitleChange}
            onElementsChange={handleElementsChange}
            onViewportChange={handleViewportChange}
            onElementUpdate={handleElementUpdate}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onSelectComment={handleSelectComment}
            onCommentPinMove={handleCommentPinMove}
            onRequestAddComment={handleRequestAddComment}
          />
        </div>

        {/* 右侧面板 */}
        <div style={{ width: 350, borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* 元素统计 */}
          <div style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', background: '#fafafa' }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, color: '#374151' }}>元素统计</div>
            <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(stats).map(([type, count]) => (
                <span key={type}>{type}: {count}</span>
              ))}
              {Object.keys(stats).length === 0 && <span>暂无元素</span>}
            </div>
          </div>

          {/* 评论管理 */}
          <div style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>评论 ({commentThreads.length})</div>
              {commentThreads.length > 0 && (
                <button onClick={handleClearComments} style={{ padding: '2px 8px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 11 }}>
                  清除
                </button>
              )}
            </div>
            <div style={{ maxHeight: 150, overflow: 'auto' }}>
              {commentThreads.map(thread => (
                <div key={thread.id} style={{ padding: '6px', border: '1px solid #d1d5db', borderRadius: 4, marginBottom: 4, cursor: 'pointer', backgroundColor: selectedCommentId === thread.id ? '#E6F0FF' : '#fff' }} onClick={() => handleSelectComment(thread.id)}>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>ID: {thread.id.slice(0, 8)}...</div>
                  <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>位置: ({thread.pinX}, {thread.pinY})</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>评论数: {thread.comments.length}</div>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteComment(thread.id); }} style={{ marginTop: 4, padding: '2px 6px', border: 'none', background: '#fee2e2', borderRadius: 2, cursor: 'pointer', fontSize: 10, color: '#dc2626' }}>删除</button>
                </div>
              ))}
              {commentThreads.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: 8 }}>暂无评论，使用评论工具添加</div>}
            </div>
          </div>

          {/* 事件日志 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb', background: '#fafafa', fontSize: 12, fontWeight: 500, color: '#374151' }}>事件日志</div>
            <div ref={logRef} style={{ flex: 1, overflow: 'auto', padding: '8px 12px', fontSize: 11, fontFamily: 'monospace', color: '#4b5563', whiteSpace: 'pre-wrap' }}>
              {logMessages.length === 0 ? '等待事件...' : logMessages.join('\n')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
