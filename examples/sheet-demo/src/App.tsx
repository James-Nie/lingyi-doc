import { useState, useCallback, useRef, useEffect } from 'react';
import { FreeTable } from '@lingyi-doc/core-sheet';
import { SheetContainer, SheetAntdProvider } from '@lingyi-doc/editor-sheet';
import type { CellValue, FreeformSheetModel, BaseSheetModel } from '@lingyi-doc/core-types';

function createDemoTable(): FreeTable {
  const table = new FreeTable({
    sheetId: 'demo-sheet',
    name: '示例表格',
    type: 'freeform',
    rowCount: 20,
    colCount: 10,
  } as FreeformSheetModel);

  // 设置一些示例数据
  table.setCell(0, 0, '姓名');
  table.setCell(0, 1, '部门');
  table.setCell(0, 2, '职位');
  table.setCell(0, 3, '入职日期');
  table.setCell(0, 4, '薪资');

  table.setCell(1, 0, '张三');
  table.setCell(1, 1, '技术部');
  table.setCell(1, 2, '前端工程师');
  table.setCell(1, 3, '2023-01-15');
  table.setCell(1, 4, 15000);

  table.setCell(2, 0, '李四');
  table.setCell(2, 1, '产品部');
  table.setCell(2, 2, '产品经理');
  table.setCell(2, 3, '2022-06-20');
  table.setCell(2, 4, 20000);

  table.setCell(3, 0, '王五');
  table.setCell(3, 1, '技术部');
  table.setCell(3, 2, '后端工程师');
  table.setCell(3, 3, '2023-03-10');
  table.setCell(3, 4, 18000);

  table.setCell(4, 0, '赵六');
  table.setCell(4, 1, '设计部');
  table.setCell(4, 2, 'UI设计师');
  table.setCell(4, 3, '2022-11-05');
  table.setCell(4, 4, 14000);

  // 添加公式
  table.setCell(5, 0, '合计');
  table.setCell(5, 4, '', 'SUM(E2:E5)');

  return table;
}

/** 使用 @lingyi-doc/core-sheet 和 @lingyi-doc/editor-sheet 的普通表格 Demo */
function NormalSheetDemo() {
  const [table] = useState<FreeTable>(createDemoTable);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (table.canUndo) {
          table.undo();
          addLog('执行撤销 (Ctrl+Z)');
        }
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (table.canRedo) {
          table.redo();
          addLog('执行重做 (Ctrl+Y)');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [table]);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogMessages(prev => [...prev.slice(-49), `[${timestamp}] ${message}`]);
    setTimeout(() => {
      const el = logRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }, []);

  const handleUndo = useCallback(() => {
    table.undo();
    addLog('执行撤销');
  }, [table, addLog]);

  const handleRedo = useCallback(() => {
    table.redo();
    addLog('执行重做');
  }, [table, addLog]);

  const handleInsertRow = useCallback(() => {
    table.insertRows(table.rowCount, 1);
    addLog(`在末尾插入行`);
  }, [table, addLog]);

  const handleDeleteRow = useCallback(() => {
    if (table.rowCount > 1) {
      table.deleteRows(table.rowCount - 1, 1);
      addLog(`删除最后一行`);
    }
  }, [table, addLog]);

  const handleInsertCol = useCallback(() => {
    table.insertColumns(table.colCount, 1);
    addLog(`在末尾插入列`);
  }, [table, addLog]);

  const handleDeleteCol = useCallback(() => {
    if (table.colCount > 1) {
      table.deleteColumns(table.colCount - 1, 1);
      addLog(`删除最后一列`);
    }
  }, [table, addLog]);

  const handlePrintData = useCallback(() => {
    const data = table.toJSON();
    const json = JSON.stringify(data, null, 2);
    console.log('表格完整数据:', json);
    addLog('已在控制台打印完整数据');
    setLogMessages(prev => [...prev.slice(-49), '=== 表格数据预览 ===']);
    setTimeout(() => {
      setLogMessages(prev => [...prev.slice(-49), json.slice(0, 1000) + (json.length > 1000 ? '...(truncated)' : '')]);
      setTimeout(() => {
        const el = logRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, 50);
    }, 50);
  }, [table, addLog]);

  return (
    <SheetAntdProvider>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
        {/* 工具栏 */}
        <header style={{ padding: '12px 20px', borderBottom: '1px solid #e5e7eb', background: '#fafafa', display: 'flex', alignItems: 'center', gap: 12 }}>
          <strong>@lingyi-doc/editor-sheet</strong>
          <span style={{ marginLeft: 12, color: '#6b7280', fontSize: 14 }}>
            普通表格编辑器演示（自由表）
          </span>
          <span style={{ marginLeft: 12, color: '#9ca3af', fontSize: 12 }}>
            基于 core-sheet + editor-sheet 组件
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={handleUndo} disabled={!table.canUndo} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: table.canUndo ? 'pointer' : 'not-allowed' }}>撤销</button>
            <button onClick={handleRedo} disabled={!table.canRedo} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: table.canRedo ? 'pointer' : 'not-allowed' }}>重做</button>
            <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />
            <button onClick={handleInsertRow} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>插入行</button>
            <button onClick={handleDeleteRow} disabled={table.rowCount <= 1} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: table.rowCount > 1 ? 'pointer' : 'not-allowed' }}>删除行</button>
            <button onClick={handleInsertCol} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>插入列</button>
            <button onClick={handleDeleteCol} disabled={table.colCount <= 1} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: table.colCount > 1 ? 'pointer' : 'not-allowed' }}>删除列</button>
            <div style={{ width: 1, height: 20, background: '#e5e7eb' }} />
            <button onClick={handlePrintData} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: '#5B8FF9', color: '#fff', cursor: 'pointer' }}>打印数据</button>
          </div>
        </header>

        {/* 表格区域 */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <SheetContainer table={table} />
        </div>

        {/* 日志区域 */}
        <div style={{ height: 150, borderTop: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '4px 12px', background: '#fafafa', fontSize: 11, fontWeight: 500, color: '#374151' }}>事件日志</div>
          <div ref={logRef} style={{ flex: 1, overflow: 'auto', padding: '4px 12px', fontSize: 11, fontFamily: 'monospace', color: '#4b5563', whiteSpace: 'pre-wrap' }}>
            {logMessages.length === 0 ? '等待事件...' : logMessages.join('\n')}
          </div>
        </div>

        {/* 状态栏 */}
        <footer style={{ padding: '8px 20px', borderTop: '1px solid #e5e7eb', background: '#fafafa', fontSize: 12, color: '#6b7280' }}>
          {table.rowCount} 行 × {table.colCount} 列 | 撤销: {table.canUndo ? '可用' : '无'} | 重做: {table.canRedo ? '可用' : '无'}
        </footer>
      </div>
    </SheetAntdProvider>
  );
}

/** 创建多维表示例数据 */
function createBaseTable(): FreeTable {
  const table = new FreeTable({
    sheetId: 'demo-base',
    name: '项目管理',
    type: 'base',
    rowCount: 10,
    colCount: 6,
  } as unknown as BaseSheetModel);

  // 设置字段定义
  const base = table.sheet;
  if (base.type === 'base') {
    base.columnDefs = [
      { id: 'col_title', name: '任务名称', type: 'text', width: 200, required: true },
      { id: 'col_status', name: '状态', type: 'select', width: 120, options: [
        { id: 'todo', name: '待办', color: '#6b7280' },
        { id: 'doing', name: '进行中', color: '#5B8FF9' },
        { id: 'done', name: '已完成', color: '#52c41a' },
      ]},
      { id: 'col_priority', name: '优先级', type: 'select', width: 100, options: [
        { id: 'high', name: '高', color: '#ff4d4f' },
        { id: 'medium', name: '中', color: '#ff9f43' },
        { id: 'low', name: '低', color: '#7c6cff' },
      ]},
      { id: 'col_assignee', name: '负责人', type: 'text', width: 120 },
      { id: 'col_date', name: '截止日期', type: 'date', width: 120 },
      { id: 'col_progress', name: '进度', type: 'number', width: 100 },
    ];
    table.syncColumnLayout();

    // 设置示例数据
    table.setCell(0, 0, '完成首页设计');
    table.setCell(0, 1, 'done');
    table.setCell(0, 2, 'high');
    table.setCell(0, 3, '张三');
    table.setCell(0, 4, '2024-01-15');
    table.setCell(0, 5, 100);

    table.setCell(1, 0, '开发用户登录模块');
    table.setCell(1, 1, 'doing');
    table.setCell(1, 2, 'high');
    table.setCell(1, 3, '李四');
    table.setCell(1, 4, '2024-01-20');
    table.setCell(1, 5, 60);

    table.setCell(2, 0, '编写API文档');
    table.setCell(2, 1, 'doing');
    table.setCell(2, 2, 'medium');
    table.setCell(2, 3, '王五');
    table.setCell(2, 4, '2024-01-25');
    table.setCell(2, 5, 40);

    table.setCell(3, 0, '测试支付功能');
    table.setCell(3, 1, 'todo');
    table.setCell(3, 2, 'high');
    table.setCell(3, 3, '赵六');
    table.setCell(3, 4, '2024-01-28');
    table.setCell(3, 5, 0);

    table.setCell(4, 0, '优化首页性能');
    table.setCell(4, 1, 'todo');
    table.setCell(4, 2, 'low');
    table.setCell(4, 3, '张三');
    table.setCell(4, 4, '2024-02-01');
    table.setCell(4, 5, 0);
  }

  return table;
}

/** 使用 @lingyi-doc/editor-sheet 的多维表 Demo */
function BaseSheetDemo() {
  const [table] = useState<FreeTable>(createBaseTable);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<string>('text');
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  const sheet = table.sheet;

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogMessages(prev => [...prev.slice(-49), `[${timestamp}] ${message}`]);
    setTimeout(() => {
      const el = logRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  }, []);

  const handleOpenFieldConfig = useCallback((fieldId?: string | null) => {
    if (fieldId) {
      const colIndex = sheet.type === 'base' ? sheet.columnDefs.findIndex(c => c.id === fieldId) : -1;
      if (colIndex >= 0 && sheet.type === 'base') {
        const field = sheet.columnDefs[colIndex];
        setNewFieldName(field.name);
        setNewFieldType(field.type);
        setEditingFieldId(fieldId);
        setShowFieldModal(true);
        addLog(`编辑字段: ${field.name}`);
      }
    } else {
      setNewFieldName('');
      setNewFieldType('text');
      setEditingFieldId(null);
      setShowFieldModal(true);
      addLog('打开添加字段弹窗');
    }
  }, [sheet, addLog]);

  const handleToggleFieldVisibility = useCallback((fieldId: string, visible: boolean) => {
    if (sheet.type === 'base') {
      const colIndex = sheet.columnDefs.findIndex(c => c.id === fieldId);
      if (colIndex >= 0) {
        sheet.columnDefs[colIndex].hidden = !visible;
        table.syncColumnLayout();
        addLog(`字段 ${sheet.columnDefs[colIndex].name} 设为${visible ? '显示' : '隐藏'}`);
      }
    }
  }, [sheet, table, addLog]);

  const handleDeleteField = useCallback((fieldId: string) => {
    if (sheet.type === 'base') {
      const colIndex = sheet.columnDefs.findIndex(c => c.id === fieldId);
      if (colIndex >= 0) {
        const fieldName = sheet.columnDefs[colIndex].name;
        sheet.columnDefs.splice(colIndex, 1);
        table.deleteColumns(colIndex, 1);
        table.syncColumnLayout();
        addLog(`删除字段: ${fieldName}`);
      }
    }
  }, [sheet, table, addLog]);

  const handleSaveField = useCallback(() => {
    if (!newFieldName.trim()) return;

    if (sheet.type === 'base') {
      if (editingFieldId) {
        const colIndex = sheet.columnDefs.findIndex(c => c.id === editingFieldId);
        if (colIndex >= 0) {
          sheet.columnDefs[colIndex].name = newFieldName;
          addLog(`保存字段: ${newFieldName}`);
        }
      } else {
        const colIndex = sheet.columnDefs.length;
        table.insertColumns(colIndex, 1);
        
        const fieldWidths: Record<string, number> = {
          boolean: 70, autoNumber: 80, date: 110,
          createdTime: 150, updatedTime: 150,
          createdBy: 120, updatedBy: 120,
          rating: 90, progress: 110,
        };
        
        const newField = {
          id: `col_${Date.now()}`,
          name: newFieldName,
          type: newFieldType as 'text' | 'number' | 'select' | 'multiSelect' | 'date' | 'boolean' | 'attachment',
          width: fieldWidths[newFieldType] || 160,
        };
        
        sheet.columnDefs.push(newField);
        table.setColumnWidth(colIndex, newField.width);
        table.syncColumnLayout();
        addLog(`添加字段: ${newFieldName} (${newFieldType})`);
      }
    }

    setShowFieldModal(false);
  }, [editingFieldId, newFieldName, newFieldType, sheet, table, addLog]);

  const handlePrintData = useCallback(() => {
    const data = table.toJSON();
    const json = JSON.stringify(data, null, 2);
    console.log('多维表完整数据:', json);
    addLog('已在控制台打印完整数据');
    setLogMessages(prev => [...prev.slice(-49), '=== 多维表数据预览 ===']);
    setTimeout(() => {
      setLogMessages(prev => [...prev.slice(-49), json.slice(0, 1000) + (json.length > 1000 ? '...(truncated)' : '')]);
      setTimeout(() => {
        const el = logRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, 50);
    }, 50);
  }, [table, addLog]);

  const fieldTypes = [
    { value: 'text', label: '文本' },
    { value: 'number', label: '数字' },
    { value: 'select', label: '单选' },
    { value: 'multiSelect', label: '多选' },
    { value: 'date', label: '日期' },
    { value: 'boolean', label: '复选框' },
    { value: 'attachment', label: '附件' },
  ];

  return (
    <SheetAntdProvider>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 头部 */}
        <header style={{ padding: '12px 20px', borderBottom: '1px solid #e5e7eb', background: '#fafafa', display: 'flex', alignItems: 'center', gap: 12 }}>
          <strong>@lingyi-doc/editor-sheet</strong>
          <span style={{ marginLeft: 12, color: '#6b7280', fontSize: 14 }}>多维表编辑器演示（Base）</span>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>
            {table.rowCount} 条记录 | {table.colCount} 个字段
          </div>
          <button onClick={handlePrintData} style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 4, background: '#5B8FF9', color: '#fff', cursor: 'pointer' }}>打印数据</button>
        </header>

        {/* SheetContainer */}
        <div style={{ flex: 1, minHeight: 0 }}>
          <SheetContainer 
            table={table}
            onOpenFieldConfig={handleOpenFieldConfig}
            onToggleFieldVisibility={handleToggleFieldVisibility}
            onDeleteField={handleDeleteField}
          />
        </div>

        {/* 日志区域 */}
        <div style={{ height: 150, borderTop: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '4px 12px', background: '#fafafa', fontSize: 11, fontWeight: 500, color: '#374151' }}>事件日志</div>
          <div ref={logRef} style={{ flex: 1, overflow: 'auto', padding: '4px 12px', fontSize: 11, fontFamily: 'monospace', color: '#4b5563', whiteSpace: 'pre-wrap' }}>
            {logMessages.length === 0 ? '等待事件...' : logMessages.join('\n')}
          </div>
        </div>

        {/* 字段配置弹窗 */}
        {showFieldModal && (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}>
            <div style={{
              background: '#fff', borderRadius: 8, padding: 24, width: 400,
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
            }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 600 }}>
                {editingFieldId ? '编辑字段' : '添加字段'}
              </h3>
              
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500 }}>字段名称</label>
                <input
                  type="text"
                  value={newFieldName}
                  onChange={(e) => setNewFieldName(e.target.value)}
                  placeholder="输入字段名称"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500 }}>字段类型</label>
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 14, boxSizing: 'border-box', background: '#fff' }}
                >
                  {fieldTypes.map(ft => (
                    <option key={ft.value} value={ft.value}>{ft.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowFieldModal(false)} style={{ padding: '8px 20px', border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer', fontSize: 14 }}>取消</button>
                <button onClick={handleSaveField} disabled={!newFieldName.trim()} style={{ padding: '8px 20px', border: 'none', borderRadius: 4, background: '#5B8FF9', color: '#fff', cursor: newFieldName.trim() ? 'pointer' : 'not-allowed', fontSize: 14 }}>
                  {editingFieldId ? '保存' : '添加'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SheetAntdProvider>
  );
}

export function App() {
  const [activeTab, setActiveTab] = useState<'normal' | 'base'>('normal');

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, sans-serif' }}>
      {/* Tab 切换 */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
        <button onClick={() => setActiveTab('normal')} style={{ padding: '12px 24px', border: 'none', borderBottom: activeTab === 'normal' ? '2px solid #5B8FF9' : '2px solid transparent', background: 'transparent', color: activeTab === 'normal' ? '#5B8FF9' : '#6b7280', cursor: 'pointer', fontSize: 14, fontWeight: activeTab === 'normal' ? 600 : 400 }}>
          普通表格（自由表）
        </button>
        <button onClick={() => setActiveTab('base')} style={{ padding: '12px 24px', border: 'none', borderBottom: activeTab === 'base' ? '2px solid #5B8FF9' : '2px solid transparent', background: 'transparent', color: activeTab === 'base' ? '#5B8FF9' : '#6b7280', cursor: 'pointer', fontSize: 14, fontWeight: activeTab === 'base' ? 600 : 400 }}>
          多维表（Base）
        </button>
      </div>

      {/* 内容区域 */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {activeTab === 'normal' && <NormalSheetDemo />}
        {activeTab === 'base' && <BaseSheetDemo />}
      </div>
    </div>
  );
}
