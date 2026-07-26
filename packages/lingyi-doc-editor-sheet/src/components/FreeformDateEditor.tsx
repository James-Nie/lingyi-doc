import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Checkbox, DatePicker, TimePicker, Tooltip } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';
import type { CellCoord, CellValue, DataValidation } from '@lingyi-doc/core-types';
import { cellValueIncludeTime, formatFreeformDateCellText } from '@lingyi-doc/core-sheet';
import { useEditorDropdownOpen } from './editors/useEditorDropdownOpen';
import './freeformDateEditor.css';

dayjs.locale('zh-cn');

interface FreeformDateEditorProps {
  coord: CellCoord;
  rect: { x: number; y: number; width: number; height: number };
  validation: DataValidation;
  initialValue: CellValue;
  onCommit: (value: CellValue) => void;
  onClose: () => void;
}

function resolveInitialDate(value: CellValue): Dayjs | null {
  if (value.type === 'date') return dayjs(value.timestamp);
  return dayjs().startOf('day');
}

function resolveInitialIncludeTime(value: CellValue, validation: DataValidation): boolean {
  if (value.type === 'date') return cellValueIncludeTime(value);
  return validation.includeTime ?? false;
}

function resolveInitialReminder(value: CellValue): boolean {
  if (value.type === 'date') return value.reminder ?? false;
  return false;
}

export const FreeformDateEditor: React.FC<FreeformDateEditorProps> = ({
  rect,
  validation,
  initialValue,
  onCommit,
  onClose,
}) => {
  const allowReminder = validation.allowReminder ?? false;
  const [value, setValue] = useState<Dayjs | null>(() => resolveInitialDate(initialValue));
  const [includeTime, setIncludeTime] = useState(() => resolveInitialIncludeTime(initialValue, validation));
  const [reminder, setReminder] = useState(() => resolveInitialReminder(initialValue));
  const { open, handleOpenChange } = useEditorDropdownOpen();
  const latestRef = useRef({ value, includeTime, reminder });

  const patchLatestRef = useCallback((patch: Partial<{ value: Dayjs | null; includeTime: boolean; reminder: boolean }>) => {
    latestRef.current = { ...latestRef.current, ...patch };
  }, []);

  latestRef.current = { value, includeTime, reminder };

  const displayText = useMemo(() => {
    if (!value) return '';
    return formatFreeformDateCellText(value.valueOf(), includeTime);
  }, [value, includeTime]);

  const buildCommitValue = useCallback((
    current: Dayjs,
    withTime: boolean,
    withReminder: boolean,
  ): CellValue => {
    const hasClock = current.hour() !== 0
      || current.minute() !== 0
      || current.second() !== 0
      || current.millisecond() !== 0;
    const saveWithTime = withTime || hasClock;
    const next = saveWithTime
      ? current
      : current.hour(0).minute(0).second(0).millisecond(0);
    return {
      type: 'date',
      timestamp: next.valueOf(),
      format: saveWithTime ? { kind: 'datetime' } : { kind: 'short' },
      ...(allowReminder ? { reminder: withReminder } : {}),
    };
  }, [allowReminder]);

  const commitCurrent = useCallback(() => {
    const { value: current, includeTime: withTime, reminder: withReminder } = latestRef.current;
    if (!current) {
      onCommit({ type: 'empty' });
      return;
    }
    onCommit(buildCommitValue(current, withTime, withReminder));
  }, [buildCommitValue, onCommit]);

  const handleClose = useCallback(() => {
    commitCurrent();
    onClose();
  }, [commitCurrent, onClose]);

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    left: rect.x,
    top: rect.y,
    width: rect.width,
    height: rect.height,
    zIndex: 1000,
    background: '#fff',
    border: '2px solid #3370FF',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    padding: '2px 8px',
    gap: 4,
    overflow: 'hidden',
    borderRadius: 2,
  };

  const panelFooter = (
    <div className="freeform-date-panel-footer">
      <div className="freeform-date-panel-row">
        <Checkbox
          checked={includeTime}
          onChange={e => {
            const checked = e.target.checked;
            setIncludeTime(checked);
            patchLatestRef({ includeTime: checked });
            if (!checked) {
              setValue(prev => {
                if (!prev) return prev;
                const nextVal = prev.hour(0).minute(0).second(0).millisecond(0);
                patchLatestRef({ value: nextVal });
                return nextVal;
              });
            }
          }}
        >
          时间
        </Checkbox>
        {includeTime && (
          <div className="freeform-date-time-input">
            <TimePicker
              value={value}
              format="HH:mm"
              allowClear={false}
              needConfirm={false}
              minuteStep={1}
              suffixIcon={null}
              variant="borderless"
              style={{ width: '100%' }}
              onChange={next => {
                if (!next) return;
                setIncludeTime(true);
                setValue(prev => {
                  const base = prev ?? dayjs().startOf('day');
                  const nextVal = base.hour(next.hour()).minute(next.minute()).second(0).millisecond(0);
                  patchLatestRef({ value: nextVal, includeTime: true });
                  return nextVal;
                });
              }}
            />
          </div>
        )}
      </div>
      {allowReminder && (
        <div className="freeform-date-panel-row">
          <Checkbox
            checked={reminder}
            onChange={e => {
              const checked = e.target.checked;
              setReminder(checked);
              patchLatestRef({ reminder: checked });
            }}
          >
            提醒
          </Checkbox>
          <Tooltip title="开启后将在到期时收到提醒（功能即将上线）">
            <span className="freeform-date-reminder-info">i</span>
          </Tooltip>
        </div>
      )}
    </div>
  );

  return (
    <div style={overlayStyle} data-sheet-keep-selection onMouseDown={e => e.stopPropagation()}>
      <span className="freeform-date-editor-cell">{displayText}</span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="#86909C" style={{ flexShrink: 0 }}>
        <path d="M7 10l5 5 5-5z" />
      </svg>
      <DatePicker
        open={open}
        allowClear
        value={value}
        format="YYYY/M/D"
        className="freeform-date-picker-hidden"
        classNames={{ popup: { root: 'freeform-date-picker-popup' } }}
        getPopupContainer={() => document.body}
        placement="bottomLeft"
        showNow={false}
        needConfirm={false}
        style={{ position: 'absolute', inset: 0, opacity: 0 }}
        panelRender={panel => (
          <div>
            {panel}
            {panelFooter}
          </div>
        )}
        onChange={nextValue => {
          if (!nextValue) {
            setValue(null);
            patchLatestRef({ value: null });
            return;
          }
          setValue(prev => {
            const nextVal = includeTime && prev
              ? nextValue.hour(prev.hour()).minute(prev.minute()).second(0).millisecond(0)
              : nextValue.startOf('day');
            patchLatestRef({ value: nextVal });
            return nextVal;
          });
        }}
        onOpenChange={nextOpen => handleOpenChange(nextOpen, handleClose)}
      />
    </div>
  );
};
