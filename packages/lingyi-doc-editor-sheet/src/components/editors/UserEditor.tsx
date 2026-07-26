import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Button, Checkbox, Divider, Select } from 'antd';
import type { BaseEditorProps } from './BaseCellEditor';
import { resolveBelowPopupStyle } from './editorUtils';
import { useEditorDropdownOpen } from './useEditorDropdownOpen';

/** 模拟成员数据 */
const MOCK_MEMBERS = [
  { id: 'u1', name: '聂建波', avatarColor: '#7c3aed' },
  { id: 'u2', name: '张三', avatarColor: '#2563eb' },
  { id: 'u3', name: '李四', avatarColor: '#059669' },
  { id: 'u4', name: '王五', avatarColor: '#dc2626' },
  { id: 'u5', name: '赵六', avatarColor: '#ea580c' },
  { id: 'u6', name: '孙七', avatarColor: '#0891b2' },
  { id: 'u7', name: '周八', avatarColor: '#7c3aed' },
  { id: 'u8', name: '吴九', avatarColor: '#db2777' },
] as const;

function getAvatarText(name: string): string {
  if (name.length <= 2) return name;
  return name.slice(-2);
}

function parsePeopleNames(initialValue: BaseEditorProps['initialValue']): string[] {
  if (initialValue.type === 'text' && initialValue.text) {
    return initialValue.text.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/** 人员选择编辑器 */
export const UserEditor: React.FC<BaseEditorProps> = ({
  rect, columnDef, initialValue, onCommit, onCancel, inline,
}) => {
  const allowMultiple = columnDef.allowMultiple ?? false;
  const [selectedNames, setSelectedNames] = useState<string[]>(() => parsePeopleNames(initialValue));
  const selectedRef = useRef(selectedNames);
  const committedRef = useRef(false);
  const [sendNotify, setSendNotify] = useState(false);
  const { open, handleOpenChange } = useEditorDropdownOpen({ autoOpen: !inline });

  const memberOptions = useMemo(
    () => MOCK_MEMBERS.map(member => ({
      value: member.name,
      label: member.name,
      member,
    })),
    [],
  );

  const commitNames = (names: string[]) => {
    if (committedRef.current) return;
    committedRef.current = true;
    if (names.length === 0) {
      onCommit({ type: 'empty' });
    } else {
      onCommit({ type: 'text', text: names.join(', ') });
    }
  };

  // 切换到其他单元格时编辑器被卸载，多选场景补一次提交
  useEffect(() => () => {
    if (!committedRef.current && allowMultiple) {
      const names = selectedRef.current;
      if (names.length === 0) {
        onCommit({ type: 'empty' });
      } else {
        onCommit({ type: 'text', text: names.join(', ') });
      }
    }
  }, [onCommit, allowMultiple]);

  return (
    <Select
      mode={allowMultiple ? 'multiple' : undefined}
      open={open}
      autoFocus
      showSearch
      allowClear={allowMultiple}
      placeholder="请选择人员"
      value={allowMultiple ? selectedNames : (selectedNames[0] || undefined)}
      options={memberOptions}
      optionFilterProp="label"
      onChange={(value: string | string[]) => {
        const names = Array.isArray(value) ? value.filter(Boolean) : (value ? [value] : []);
        selectedRef.current = names;
        setSelectedNames(names);
        if (!allowMultiple) {
          // 单选：立即提交；关闭时禁止再用过期 state 二次 commit
          commitNames(names);
        }
      }}
      onOpenChange={nextOpen => {
        handleOpenChange(nextOpen, () => {
          if (allowMultiple) {
            commitNames(selectedRef.current);
          } else if (!committedRef.current) {
            onCancel();
          }
        });
      }}
      style={resolveBelowPopupStyle(rect, inline, 240)}
      popupMatchSelectWidth
      getPopupContainer={() => document.body}
      dropdownRender={menu => (
        <>
          {menu}
          <Divider style={{ margin: '8px 0' }} />
          <div
            style={{
              padding: '0 12px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <Checkbox
              checked={sendNotify}
              onChange={e => setSendNotify(e.target.checked)}
            >
              同时发送通知
            </Checkbox>
            {allowMultiple && (
              <Button
                size="small"
                type="primary"
                onClick={() => commitNames(selectedRef.current)}
              >
                确定
              </Button>
            )}
          </div>
        </>
      )}
      optionRender={option => {
        const member = MOCK_MEMBERS.find(m => m.name === option.value);
        if (!member) return option.label;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar
              size={28}
              style={{ backgroundColor: member.avatarColor, flexShrink: 0 }}
            >
              {getAvatarText(member.name)}
            </Avatar>
            <span>{member.name}</span>
          </div>
        );
      }}
      tagRender={({ value, onClose }) => {
        const member = MOCK_MEMBERS.find(m => m.name === value);
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              marginInlineEnd: 4,
              padding: '0 8px',
              background: '#f5f5f5',
              borderRadius: 12,
              fontSize: 12,
            }}
          >
            {member && (
              <Avatar size={16} style={{ backgroundColor: member.avatarColor, fontSize: 9 }}>
                {getAvatarText(member.name).slice(-1)}
              </Avatar>
            )}
            {String(value)}
            <span onClick={onClose} style={{ cursor: 'pointer', color: '#999' }}>×</span>
          </span>
        );
      }}
    />
  );
};
