import React, { useCallback, useMemo, useState } from 'react';
import type { BaseView, CellValue, FreeTable } from '@lingyi-doc/core';
import { BASE_THEME, isBaseSheet } from '@lingyi-doc/core';
import { FormFieldCard } from './FormFieldCard';
import { getFormFieldItems } from './formViewUtils';
import { isEmptyCellValue } from './formFillUtils';

export interface PublicFormFillViewProps {
  table: FreeTable;
  formView: BaseView;
  submitting?: boolean;
  submitted?: boolean;
  submitError?: string | null;
  onSubmit: (values: Record<string, CellValue>) => void;
  onSubmitAgain?: () => void;
}

export const PublicFormFillView: React.FC<PublicFormFillViewProps> = ({
  table,
  formView,
  submitting = false,
  submitted = false,
  submitError = null,
  onSubmit,
  onSubmitAgain,
}) => {
  const [fillValues, setFillValues] = useState<Record<string, CellValue>>({});
  const [fillResetKey, setFillResetKey] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);

  const sheetModel = table.sheet;
  if (!isBaseSheet(sheetModel)) return null;

  const columnDefs = sheetModel.columnDefs;
  const formItems = useMemo(() => getFormFieldItems(formView), [formView]);

  const title = formView.config.formTitle ?? '表单';
  const description = formView.config.formDescription ?? '';

  const handleSubmit = useCallback(() => {
    setValidationError(null);
    for (const item of formItems) {
      if (item.required && isEmptyCellValue(fillValues[item.fieldId])) {
        const col = columnDefs.find(c => c.id === item.fieldId);
        setValidationError(`请填写必填项「${item.question || col?.name}」`);
        return;
      }
    }
    onSubmit(fillValues);
  }, [formItems, fillValues, columnDefs, onSubmit]);

  if (submitted) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#E8EDF5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          padding: '48px 40px',
          maxWidth: 480,
          width: '100%',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 600, color: BASE_THEME.cellTextColor }}>
            提交成功
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: 14, color: BASE_THEME.secondaryTextColor, lineHeight: '22px' }}>
            感谢您的填写，我们已收到您的回复。
          </p>
          {onSubmitAgain && (
            <button
              type="button"
              onClick={() => {
                setFillValues({});
                setFillResetKey(k => k + 1);
                setValidationError(null);
                onSubmitAgain();
              }}
              style={{
                padding: '10px 24px',
                border: `1px solid ${BASE_THEME.primaryColor}`,
                borderRadius: 8,
                background: '#fff',
                color: BASE_THEME.primaryColor,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              再填一份
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#E8EDF5',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        <div style={{
          height: 160,
          background: 'linear-gradient(135deg, #5B8FF9 0%, #3370FF 55%, #6C5CE7 100%)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, right: 0, width: '45%', height: '100%',
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.35) 1px, transparent 1px)',
            backgroundSize: '14px 14px',
            opacity: 0.5,
          }} />
          <div style={{ position: 'absolute', width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', top: 20, left: '15%' }} />
          <div style={{ position: 'absolute', width: 50, height: 50, borderRadius: 12, background: 'rgba(255,255,255,0.2)', top: 40, right: '20%', transform: 'rotate(15deg)' }} />
        </div>

        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 48px', position: 'relative', zIndex: 1 }}>
          <div style={{
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
            marginTop: -56,
            padding: '56px 40px 32px',
            position: 'relative',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 700, color: BASE_THEME.cellTextColor }}>
                {title}
              </h1>
              {description && (
                <p style={{ margin: 0, fontSize: 14, color: BASE_THEME.secondaryTextColor, lineHeight: '22px' }}>
                  {description}
                </p>
              )}
            </div>

            {formItems.length === 0 ? (
              <div style={{ padding: '40px 0', textAlign: 'center', color: BASE_THEME.secondaryTextColor, fontSize: 14 }}>
                此表单暂无题目
              </div>
            ) : formItems.map(item => {
              const colDef = columnDefs.find(c => c.id === item.fieldId);
              if (!colDef) return null;

              return (
                <FormFieldCard
                  key={item.fieldId}
                  item={item}
                  columnDef={colDef}
                  expanded={false}
                  mode="fill"
                  fillValue={fillValues[item.fieldId]}
                  fillResetKey={fillResetKey}
                  onExpand={() => {}}
                  onUpdate={() => {}}
                  onRemove={() => {}}
                  onFillChange={v => setFillValues(prev => ({ ...prev, [item.fieldId]: v }))}
                />
              );
            })}

            {(validationError || submitError) && (
              <div style={{
                marginTop: 8,
                padding: '10px 12px',
                background: '#fde2e0',
                borderRadius: 8,
                fontSize: 13,
                color: '#d83931',
              }}>
                {validationError || submitError}
              </div>
            )}

            {formItems.length > 0 && (
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                style={{
                  marginTop: 16,
                  width: '100%',
                  padding: '13px 0',
                  border: 'none',
                  borderRadius: 8,
                  background: submitting ? '#a0c4ff' : BASE_THEME.primaryColor,
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: submitting ? 'default' : 'pointer',
                  boxShadow: '0 2px 8px rgba(51, 112, 255, 0.25)',
                }}
              >
                {submitting ? '提交中…' : '提交'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
