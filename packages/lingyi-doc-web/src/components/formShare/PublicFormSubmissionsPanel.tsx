import React from 'react';
import type { FormSubmissionItem } from './formSubmissionUtils';
import { formatSubmissionTime } from './formSubmissionUtils';

const PRIMARY = '#3370ff';

export interface PublicFormSubmissionsPanelProps {
  items: FormSubmissionItem[];
  selectedRecordId: string | null;
  onSelect: (recordId: string) => void;
  onClose: () => void;
}

export const PublicFormSubmissionsPanel: React.FC<PublicFormSubmissionsPanelProps> = ({
  items,
  selectedRecordId,
  onSelect,
  onClose,
}) => {
  return (
    <aside style={{
      width: 320,
      flexShrink: 0,
      background: '#f5f6f7',
      borderRight: '1px solid #dee0e3',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
    }}>
      <div style={{ padding: '20px 20px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#1f2329' }}>提交记录</h2>
          <button
            type="button"
            title="关闭"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              border: 'none',
              borderRadius: 6,
              background: 'transparent',
              color: '#8f959e',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: '#8f959e' }}>
          共 {items.length} 条提交记录
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px' }}>
        {items.length === 0 ? (
          <div style={{ padding: '32px 8px', textAlign: 'center', fontSize: 13, color: '#8f959e' }}>
            暂无提交记录
          </div>
        ) : items.map(item => {
          const selected = item.recordId === selectedRecordId || (!selectedRecordId && item.isLatest);
          return (
            <button
              key={item.recordId}
              type="button"
              onClick={() => onSelect(item.recordId)}
              style={{
                width: '100%',
                textAlign: 'left',
                border: `1px solid ${selected ? PRIMARY : '#dee0e3'}`,
                background: selected ? '#e8f3ff' : '#fff',
                borderRadius: 10,
                padding: '12px 14px',
                marginBottom: 10,
                cursor: 'pointer',
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 6,
                marginBottom: 10,
              }}>
                <span style={{ fontSize: 13, color: selected ? PRIMARY : '#646a73', fontWeight: 500 }}>
                  提交于 {formatSubmissionTime(item.createdAt)}
                </span>
                {item.isLatest && (
                  <span style={{
                    fontSize: 11,
                    color: '#fff',
                    background: PRIMARY,
                    borderRadius: 4,
                    padding: '1px 6px',
                    lineHeight: '18px',
                  }}>
                    最新提交
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {item.fields.map(field => (
                  <div key={field.label} style={{
                    fontSize: 13,
                    color: '#1f2329',
                    display: 'flex',
                    gap: 4,
                    minWidth: 0,
                  }}>
                    <span style={{
                      color: '#646a73',
                      flexShrink: 0,
                      maxWidth: '55%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {field.label}：
                    </span>
                    <span style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {field.value}
                    </span>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{
        padding: '12px 20px 20px',
        fontSize: 12,
        color: '#8f959e',
        textAlign: 'center',
        lineHeight: '18px',
        flexShrink: 0,
      }}>
        提交记录仅支持查看，不支持在此编辑
      </div>
    </aside>
  );
};
