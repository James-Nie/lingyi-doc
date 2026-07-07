import React from 'react';
import { MN_COLORS } from './styles';

/** 渲染含 #标签 的文本 */
export function MindNoteRichText({
  text,
  completed,
  placeholder = '输入文字',
  fontSize,
}: {
  text: string;
  completed?: boolean;
  placeholder?: string;
  fontSize?: number;
}) {
  if (!text) {
    return (
      <span style={{ color: MN_COLORS.muted, fontSize }}>
        {placeholder}
      </span>
    );
  }

  const parts = text.split(/(#[^\s#]+)/g);
  return (
    <span style={{
      color: completed ? MN_COLORS.completed : MN_COLORS.text,
      textDecoration: completed ? 'line-through' : undefined,
      fontSize,
    }}>
      {parts.map((part, i) => {
        if (part.startsWith('#')) {
          return (
            <span key={i} style={{ color: MN_COLORS.tag }}>
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
