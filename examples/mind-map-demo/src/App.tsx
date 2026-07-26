import { useState, useCallback, useRef, useEffect } from 'react';
import { MindmapView } from '@lingyi-doc/mind-map-react';
import { createEmptyMindNode } from '@lingyi-doc/core-mindmap';
import type { MindNode } from '@lingyi-doc/core-mindmap';

function createDemoRoot(): MindNode {
  const root = createEmptyMindNode('零一思维导图');
  root.children = [
    createEmptyMindNode('开源引擎'),
    createEmptyMindNode('离线 Demo'),
    createEmptyMindNode('无商业依赖'),
  ];
  // 添加二级节点
  root.children[0].children = [
    createEmptyMindNode('React Native'),
    createEmptyMindNode('Web 端'),
  ];
  root.children[1].children = [
    createEmptyMindNode('无需账号'),
    createEmptyMindNode('本地存储'),
  ];
  root.children[2].children = [
    createEmptyMindNode('MIT 协议'),
    createEmptyMindNode('社区驱动'),
  ];
  return root;
}

export function App() {
  const [root, setRoot] = useState<MindNode>(createDemoRoot);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogMessages(prev => [...prev.slice(-49), `[${timestamp}] ${message}`]);
    setTimeout(() => {
      const el = logRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }, []);

  const handleSelectNode = useCallback((id: string | null) => {
    setActiveId(id);
    addLog(id ? `选中节点: ${id}` : '取消选中');
  }, [addLog]);

  const handleNodeTextChange = useCallback((nodeId: string, text: string, recordHistory?: boolean) => {
    setRoot(prev => {
      const updateNode = (node: MindNode): MindNode => {
        if (node.id === nodeId) {
          return { ...node, text };
        }
        return { ...node, children: node.children.map(updateNode) };
      };
      return updateNode(prev);
    });
    addLog(`节点 ${nodeId} 文本修改为: "${text}"`);
  }, [addLog]);

  const handleZoomChange = useCallback((newZoom: number) => {
    setZoom(Math.round(newZoom));
    addLog(`缩放变化: ${newZoom.toFixed(1)}%`);
  }, [addLog]);

  const handleAddChild = useCallback(() => {
    if (!activeId) {
      addLog('请先选中一个节点');
      return;
    }
    const newNode = createEmptyMindNode('新子节点');
    setRoot(prev => {
      const updateNode = (node: MindNode): MindNode => {
        if (node.id === activeId) {
          return { ...node, children: [...node.children, newNode] };
        }
        return { ...node, children: node.children.map(updateNode) };
      };
      return updateNode(prev);
    });
    addLog(`在节点 ${activeId} 下添加子节点`);
  }, [activeId, addLog]);

  const handleAddSibling = useCallback(() => {
    if (!activeId) {
      addLog('请先选中一个节点');
      return;
    }
    const newNode = createEmptyMindNode('新兄弟节点');
    setRoot(prev => {
      const updateInChildren = (nodes: MindNode[]): MindNode[] => {
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].id === activeId) {
            return [...nodes.slice(0, i), newNode, nodes[i], ...nodes.slice(i + 1)];
          }
          const updatedChildren = updateInChildren(nodes[i].children);
          if (updatedChildren !== nodes[i].children) {
            return [{ ...nodes[i], children: updatedChildren }, ...nodes.slice(i + 1)];
          }
        }
        return nodes;
      };
      return { ...prev, children: updateInChildren(prev.children) };
    });
    addLog(`在节点 ${activeId} 旁添加兄弟节点`);
  }, [activeId, addLog]);

  const handleDeleteNode = useCallback(() => {
    if (!activeId) {
      addLog('请先选中一个节点');
      return;
    }
    setRoot(prev => {
      const removeNode = (nodes: MindNode[]): MindNode[] => {
        return nodes.filter(n => n.id !== activeId).map(n => ({ ...n, children: removeNode(n.children) }));
      };
      return { ...prev, children: removeNode(prev.children) };
    });
    setActiveId(null);
    addLog(`删除节点: ${activeId}`);
  }, [activeId, addLog]);

  const handlePrintData = useCallback(() => {
    const data = JSON.stringify(root, null, 2);
    console.log('思维导图完整数据:', data);
    addLog('已在控制台打印完整数据');
    // 也可以在日志区域显示前2000字符
    setLogMessages(prev => [...prev.slice(-49), '=== 思维导图数据预览 ===']);
    setTimeout(() => {
      setLogMessages(prev => [...prev.slice(-49), data.slice(0, 1000) + (data.length > 1000 ? '...(truncated)' : '')]);
      setTimeout(() => {
        const el = logRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, 50);
    }, 50);
  }, [root]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && activeId) {
        e.preventDefault();
        handleDeleteNode();
      } else if (e.key === 'Enter' && activeId && !e.shiftKey) {
        e.preventDefault();
        handleAddSibling();
      } else if (e.key === 'Tab' && activeId) {
        e.preventDefault();
        handleAddChild();
      } else if (e.key === 'Escape') {
        setActiveId(null);
        addLog('取消选中');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeId, handleDeleteNode, handleAddSibling, handleAddChild, addLog]);

  const handleAddImage = useCallback(() => {
    if (!activeId) {
      addLog('请先选中一个节点');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const url = ev.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const maxDim = 128;
          const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
          setRoot(prev => {
            const updateNode = (node: MindNode): MindNode => {
              if (node.id === activeId) {
                return { ...node, image: url, imageWidth: img.width * scale, imageHeight: img.height * scale };
              }
              return { ...node, children: node.children.map(updateNode) };
            };
            return updateNode(prev);
          });
          addLog(`在节点 ${activeId} 添加图片 (${file.name})`);
        };
        img.src = url;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }, [activeId, addLog]);

  // 计算节点数量
  const countNodes = (node: MindNode): number => {
    return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      {/* 头部 */}
      <header style={{ padding: '12px 20px', borderBottom: '1px solid #e5e7eb', background: '#fafafa', display: 'flex', alignItems: 'center', gap: 12 }}>
        <strong>@lingyi-doc/mind-map-react</strong>
        <span style={{ marginLeft: 12, color: '#6b7280', fontSize: 14 }}>
          思维导图编辑器 Demo · 完整功能演示
        </span>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280', display: 'flex', gap: 20 }}>
          <span>节点数: {countNodes(root)}</span>
          <span>缩放: {zoom}%</span>
          <span>选中: {activeId ? '是' : '否'}</span>
        </div>
      </header>

      {/* 工具栏 */}
      <div style={{ padding: '8px 20px', borderBottom: '1px solid #e5e7eb', background: '#fff', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={handleAddChild} disabled={!activeId} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: activeId ? 'pointer' : 'not-allowed' }}>
          添加子节点
        </button>
        <button onClick={handleAddSibling} disabled={!activeId} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: activeId ? 'pointer' : 'not-allowed' }}>
          添加兄弟节点
        </button>
        <button onClick={handleDeleteNode} disabled={!activeId} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: activeId ? 'pointer' : 'not-allowed' }}>
          删除节点
        </button>
        <button onClick={handleAddImage} disabled={!activeId} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: activeId ? 'pointer' : 'not-allowed' }}>
          添加图片
        </button>
        <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />
        <button onClick={handlePrintData} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: '#5B8FF9', color: '#fff', cursor: 'pointer' }}>
          打印完整数据
        </button>
      </div>

      {/* 主内容区域 */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 思维导图区域 */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <MindmapView
            root={root}
            structure="right"
            branchStyle="straight"
            fitOnInit
            activeNodeId={activeId}
            zoom={zoom}
            onSelectNode={handleSelectNode}
            onNodeTextChange={handleNodeTextChange}
            onRootChange={setRoot}
            onZoomChange={handleZoomChange}
          />
        </div>

        {/* 日志区域 */}
        <div style={{ width: 400, borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid #e5e7eb', background: '#fafafa', fontSize: 12, fontWeight: 500, color: '#374151' }}>
            事件日志
          </div>
          <div ref={logRef} style={{ flex: 1, overflow: 'auto', padding: '8px 12px', fontSize: 12, fontFamily: 'monospace', color: '#4b5563', whiteSpace: 'pre-wrap' }}>
            {logMessages.length === 0 ? '等待事件...' : logMessages.join('\n')}
          </div>
        </div>
      </div>
    </div>
  );
}
