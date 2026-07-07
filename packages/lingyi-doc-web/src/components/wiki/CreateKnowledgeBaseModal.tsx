import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KnowledgeBaseVisibility } from '../../stores/knowledgeBaseStore';

interface CreateKnowledgeBaseModalProps {
  open: boolean;
  organizationName: string;
  onClose: () => void;
  onCreate: (payload: {
    name: string;
    description: string;
    emoji: string;
    visibility: KnowledgeBaseVisibility;
  }) => void;
}

const EMOJI_OPTIONS = ['📘', '📚', '📖', '🗂️', '💡', '🧠', '📝', '✨'];

export const CreateKnowledgeBaseModal: React.FC<CreateKnowledgeBaseModalProps> = ({
  open,
  organizationName,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('📘');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [visibility, setVisibility] = useState<KnowledgeBaseVisibility>('members');

  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setEmoji('📘');
    setEmojiOpen(false);
    setVisibility('members');
  }, [open]);

  const canCreate = name.trim().length > 0;

  const organizationLabel = useMemo(
    () => `「${organizationName || '当前企业'}」所有人公开可见`,
    [organizationName],
  );

  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.45)',
        zIndex: 12000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="完善知识库信息"
        onMouseDown={e => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: '100%',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.18)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '20px 24px 8px',
        }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="返回"
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: '#646a73',
              fontSize: 18,
              lineHeight: 1,
              padding: 4,
            }}
          >
            ‹
          </button>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1f2329' }}>
            完善知识库信息
          </h2>
        </div>

        <div style={{ padding: '8px 24px 20px' }}>
          <FieldLabel required>名称</FieldLabel>
          <div style={{ position: 'relative', marginBottom: 20 }}>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setEmojiOpen(v => !v)}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: 18,
                  lineHeight: 1,
                  padding: 0,
                  zIndex: 1,
                }}
              >
                {emoji}
              </button>
              <input
                autoFocus
                value={name}
                placeholder="请输入名称"
                onChange={e => setName(e.target.value)}
                style={{
                  width: '100%',
                  height: 40,
                  border: '1px solid #3370ff',
                  borderRadius: 8,
                  padding: '0 12px 0 40px',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            {emojiOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                padding: 10,
                background: '#fff',
                border: '1px solid #dee0e3',
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                zIndex: 2,
              }}>
                {EMOJI_OPTIONS.map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => {
                      setEmoji(item);
                      setEmojiOpen(false);
                    }}
                    style={{
                      width: 32,
                      height: 32,
                      border: emoji === item ? '1px solid #3370ff' : '1px solid transparent',
                      borderRadius: 6,
                      background: emoji === item ? '#f0f4ff' : 'transparent',
                      cursor: 'pointer',
                      fontSize: 18,
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
          </div>

          <FieldLabel>简介</FieldLabel>
          <input
            value={description}
            placeholder="请输入简介"
            onChange={e => setDescription(e.target.value)}
            style={{
              width: '100%',
              height: 40,
              border: '1px solid #dee0e3',
              borderRadius: 8,
              padding: '0 12px',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: 20,
            }}
          />

          <FieldLabel required>可见范围</FieldLabel>
          <div style={{
            border: '1px solid #dee0e3',
            borderRadius: 8,
            padding: '4px 0',
          }}>
            <RadioRow
              checked={visibility === 'members'}
              label="仅当前知识库成员可见"
              onChange={() => setVisibility('members')}
            />
            <RadioRow
              checked={visibility === 'organization'}
              label={organizationLabel}
              onChange={() => setVisibility('organization')}
            />
          </div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12,
          padding: '16px 24px 20px',
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              minWidth: 88,
              height: 36,
              borderRadius: 8,
              border: '1px solid #dee0e3',
              background: '#fff',
              color: '#1f2329',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => {
              if (!canCreate) return;
              onCreate({
                name: name.trim(),
                description: description.trim(),
                emoji,
                visibility,
              });
            }}
            style={{
              minWidth: 88,
              height: 36,
              borderRadius: 8,
              border: 'none',
              background: canCreate ? '#3370ff' : '#c9cdd4',
              color: '#fff',
              fontSize: 14,
              cursor: canCreate ? 'pointer' : 'not-allowed',
            }}
          >
            创建
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{ marginBottom: 8, fontSize: 14, color: '#1f2329' }}>
      {children}
      {required && <span style={{ color: '#f54a45', marginLeft: 2 }}>*</span>}
    </div>
  );
}

function RadioRow({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 16px',
        border: 'none',
        background: checked ? '#f5f8ff' : 'transparent',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        border: checked ? '5px solid #3370ff' : '1px solid #c9cdd4',
        boxSizing: 'border-box',
        flexShrink: 0,
        background: '#fff',
      }} />
      <span style={{ fontSize: 14, color: '#1f2329', lineHeight: '20px' }}>{label}</span>
    </button>
  );
}
