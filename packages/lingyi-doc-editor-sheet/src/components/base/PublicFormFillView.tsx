import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { BaseFormFieldItem, CellValue, ColumnDef } from '@lingyi-doc/core-types';
import { BASE_THEME } from '@lingyi-doc/core-sheet';
import { FormFieldCard } from './FormFieldCard';
import { isEmptyCellValue } from './formFillUtils';

export interface PublicFormSchemaField {
  fieldId: string;
  question: string;
  description?: string;
  required?: boolean;
  column: ColumnDef;
}

export interface PublicFormFillViewProps {
  title: string;
  description?: string;
  fields: PublicFormSchemaField[];
  submitting?: boolean;
  submitted?: boolean;
  submitError?: string | null;
  onSubmit: (values: Record<string, CellValue>) => void;
  onSubmitAgain?: () => void;
  /** 右上角管理操作区（编辑/统计/分享等） */
  headerExtra?: React.ReactNode;
  /** 左侧边栏（如提交记录） */
  leftSidebar?: React.ReactNode;
  /** 覆盖主内容区（如统计面板）；存在时隐藏表单主体 */
  contentOverlay?: React.ReactNode;
  /** 表单卡片下方品牌支持区 */
  supportFooter?: React.ReactNode;
  /** 外部注入的填写值（如查看历史提交） */
  reviewValues?: Record<string, CellValue> | null;
  /** 切换查看记录时递增，用于强制重挂载字段编辑器 */
  reviewKey?: string | number;
  /** 历史记录查看：只读且隐藏提交 */
  readOnly?: boolean;
}

export const PublicFormFillView: React.FC<PublicFormFillViewProps> = ({
  title,
  description = '',
  fields,
  submitting = false,
  submitted = false,
  submitError = null,
  onSubmit,
  onSubmitAgain,
  headerExtra,
  leftSidebar,
  contentOverlay,
  supportFooter,
  reviewValues = null,
  reviewKey,
  readOnly = false,
}) => {
  const [fillValues, setFillValues] = useState<Record<string, CellValue>>({});
  const [fillResetKey, setFillResetKey] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (readOnly && reviewValues) {
      setFillValues(reviewValues);
    } else if (!readOnly) {
      setFillValues({});
    }
    setFillResetKey(k => k + 1);
    setValidationError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewKey, readOnly]);

  const formItems = useMemo((): Array<{ item: BaseFormFieldItem; columnDef: ColumnDef }> => (
    fields.map(f => ({
      item: {
        fieldId: f.fieldId,
        question: f.question,
        description: f.description,
        required: f.required,
      },
      columnDef: f.column,
    }))
  ), [fields]);

  const handleSubmit = useCallback(() => {
    if (readOnly) return;
    setValidationError(null);
    for (const { item, columnDef } of formItems) {
      if (item.required && isEmptyCellValue(fillValues[item.fieldId])) {
        setValidationError(`请填写必填项「${item.question || columnDef.name}」`);
        return;
      }
    }
    onSubmit(fillValues);
  }, [readOnly, formItems, fillValues, onSubmit]);

  if (submitted) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#E8EDF5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        position: 'relative',
      }}>
        {headerExtra}
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
      height: '100vh',
      minHeight: '100vh',
      background: '#E8EDF5',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {headerExtra}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {leftSidebar}
        <div style={{ flex: 1, overflowY: 'auto', position: 'relative', minWidth: 0 }}>
          {contentOverlay ? (
            <div style={{
              minHeight: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '72px 24px 48px',
              background: 'linear-gradient(180deg, #dce8ff 0%, #E8EDF5 45%, #E8EDF5 100%)',
            }}>
              {contentOverlay}
              {supportFooter}
            </div>
          ) : (
            <>
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
                    {readOnly && (
                      <p style={{
                        margin: '12px 0 0',
                        fontSize: 13,
                        color: BASE_THEME.primaryColor,
                        background: '#e8f3ff',
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: 6,
                        lineHeight: '20px',
                      }}>
                        正在查看历史提交，仅可浏览不可编辑
                      </p>
                    )}
                  </div>

                  {formItems.length === 0 ? (
                    <div style={{ padding: '40px 0', textAlign: 'center', color: BASE_THEME.secondaryTextColor, fontSize: 14 }}>
                      此表单暂无题目
                    </div>
                  ) : formItems.map(({ item, columnDef }) => (
                    <FormFieldCard
                      key={item.fieldId}
                      item={item}
                      columnDef={columnDef}
                      expanded={false}
                      mode="fill"
                      fillValue={fillValues[item.fieldId]}
                      fillResetKey={fillResetKey}
                      fillReadOnly={readOnly}
                      onExpand={() => {}}
                      onUpdate={() => {}}
                      onRemove={() => {}}
                      onFillChange={readOnly
                        ? undefined
                        : v => setFillValues(prev => ({ ...prev, [item.fieldId]: v }))}
                    />
                  ))}

                  {!readOnly && (validationError || submitError) && (
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

                  {formItems.length > 0 && !readOnly && (
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
                {supportFooter}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
