// ============================================================
// FormulaDropdown — 完整的公式下拉面板
// 含高频函数区、AI写公式、分类导航、功能介绍
// ============================================================

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { FreeTable } from '@lingyi-doc/core';
import { useSheetStore } from '../../store/sheetStore';

// ─── Function Definitions ──────────────────────────────────

interface FunctionDef {
  name: string;
  description: string;
  template: string;
}

interface Category {
  id: string;
  name: string;
  functions: FunctionDef[];
}

const CATEGORIES: Category[] = [
  {
    id: 'date', name: '日期',
    functions: [
      { name: 'DATE', description: '由年/月/日构建日期值', template: '=DATE(year,month,day)' },
      { name: 'DATEDIF', description: '计算两个日期之间的天数差', template: '=DATEDIF(start_date,end_date,"d")' },
      { name: 'DATEVALUE', description: '将文本转换为日期值', template: '=DATEVALUE(date_text)' },
      { name: 'DAY', description: '返回日期中的日（1-31）', template: '=DAY(date)' },
      { name: 'DAYS', description: '返回两个日期之间的天数', template: '=DAYS(end_date,start_date)' },
      { name: 'DAYS360', description: '按360天/年计算日期差', template: '=DAYS360(start_date,end_date)' },
      { name: 'EDATE', description: '返回指定月数前后的日期', template: '=EDATE(start_date,months)' },
      { name: 'EOMONTH', description: '返回指定月数的月末日期', template: '=EOMONTH(start_date,months)' },
      { name: 'HOUR', description: '返回时间中的小时', template: '=HOUR(time)' },
      { name: 'MINUTE', description: '返回时间中的分钟', template: '=MINUTE(time)' },
      { name: 'MONTH', description: '返回日期中的月份', template: '=MONTH(date)' },
      { name: 'NETWORKDAYS', description: '返回两个日期间的工作日天数', template: '=NETWORKDAYS(start_date,end_date,holidays)' },
      { name: 'NOW', description: '返回当前日期和时间', template: '=NOW()' },
      { name: 'SECOND', description: '返回时间中的秒数', template: '=SECOND(time)' },
      { name: 'TIME', description: '由时/分/秒构建时间值', template: '=TIME(hour,minute,second)' },
      { name: 'TODAY', description: '返回当前日期', template: '=TODAY()' },
      { name: 'WEEKDAY', description: '返回星期几（1=星期日）', template: '=WEEKDAY(date,type)' },
      { name: 'WEEKNUM', description: '返回日期所在的周数', template: '=WEEKNUM(date)' },
      { name: 'WORKDAY', description: '返回N个工作日后的日期', template: '=WORKDAY(start_date,days)' },
      { name: 'YEAR', description: '返回日期中的年份', template: '=YEAR(date)' },
    ],
  },
  {
    id: 'info', name: '信息',
    functions: [
      { name: 'CELL', description: '返回单元格的格式/位置等信息', template: '=CELL(info_type,reference)' },
      { name: 'ISBLANK', description: '单元格为空则返回TRUE', template: '=ISBLANK(value)' },
      { name: 'ISERR', description: '值为#N/A之外的错误返回TRUE', template: '=ISERR(value)' },
      { name: 'ISERROR', description: '值为任何错误返回TRUE', template: '=ISERROR(value)' },
      { name: 'ISLOGICAL', description: '值为逻辑值返回TRUE', template: '=ISLOGICAL(value)' },
      { name: 'ISNA', description: '值为#N/A返回TRUE', template: '=ISNA(value)' },
      { name: 'ISNONTEXT', description: '值非文本返回TRUE', template: '=ISNONTEXT(value)' },
      { name: 'ISNUMBER', description: '值为数字返回TRUE', template: '=ISNUMBER(value)' },
      { name: 'ISREF', description: '值为有效引用返回TRUE', template: '=ISREF(value)' },
      { name: 'ISTEXT', description: '值为文本返回TRUE', template: '=ISTEXT(value)' },
      { name: 'N', description: '将值转换为数字', template: '=N(value)' },
      { name: 'NA', description: '返回 #N/A 错误值', template: '=NA()' },
      { name: 'TYPE', description: '返回数据类型编号', template: '=TYPE(value)' },
    ],
  },
  {
    id: 'logic', name: '逻辑',
    functions: [
      { name: 'AND', description: '所有参数为TRUE返回TRUE', template: '=AND(logical1,logical2,...)' },
      { name: 'FALSE', description: '返回逻辑值FALSE', template: '=FALSE()' },
      { name: 'IF', description: '条件判断，返回不同值', template: '=IF(condition,true_value,false_value)' },
      { name: 'IFERROR', description: '错误时返回指定值', template: '=IFERROR(value,value_if_error)' },
      { name: 'IFNA', description: '#N/A时返回指定值', template: '=IFNA(value,value_if_na)' },
      { name: 'IFS', description: '多条件判断', template: '=IFS(condition1,value1,condition2,value2,...)' },
      { name: 'NOT', description: '反转逻辑值', template: '=NOT(logical)' },
      { name: 'OR', description: '任一参数为TRUE返回TRUE', template: '=OR(logical1,logical2,...)' },
      { name: 'SWITCH', description: '按匹配值返回对应结果', template: '=SWITCH(expression,value1,result1,...)' },
      { name: 'TRUE', description: '返回逻辑值TRUE', template: '=TRUE()' },
      { name: 'XOR', description: '异或逻辑运算', template: '=XOR(logical1,logical2,...)' },
    ],
  },
  {
    id: 'lookup', name: '查找',
    functions: [
      { name: 'ADDRESS', description: '按行列号返回单元格地址', template: '=ADDRESS(row,col,abs,a1,sheet)' },
      { name: 'CHOOSE', description: '按序号从列表中选值', template: '=CHOOSE(index,value1,value2,...)' },
      { name: 'COLUMN', description: '返回引用的列号', template: '=COLUMN(reference)' },
      { name: 'FILTER', description: '按条件筛选范围', template: '=FILTER(range,condition)' },
      { name: 'HLOOKUP', description: '横向查找匹配值', template: '=HLOOKUP(lookup_value,table_array,row_index,range_lookup)' },
      { name: 'INDEX', description: '返回范围内指定位置的值', template: '=INDEX(range,row,col)' },
      { name: 'INDIRECT', description: '返回文本引用指向的值', template: '=INDIRECT(ref_text)' },
      { name: 'LOOKUP', description: '从单行/列查找值', template: '=LOOKUP(lookup_value,lookup_vector,result_vector)' },
      { name: 'MATCH', description: '返回匹配项的位置', template: '=MATCH(lookup_value,lookup_array,match_type)' },
      { name: 'OFFSET', description: '按偏移量返回引用', template: '=OFFSET(reference,rows,cols,height,width)' },
      { name: 'ROW', description: '返回引用的行号', template: '=ROW(reference)' },
      { name: 'SORT', description: '对范围排序', template: '=SORT(range,sort_column,sort_order)' },
      { name: 'TRANSPOSE', description: '转置数组', template: '=TRANSPOSE(range)' },
      { name: 'VLOOKUP', description: '纵向查找匹配值', template: '=VLOOKUP(lookup_value,table_array,col_index,range_lookup)' },
      { name: 'XMATCH', description: '返回匹配项位置(新版)', template: '=XMATCH(lookup_value,lookup_array,match_mode)' },
    ],
  },
  {
    id: 'math', name: '数学',
    functions: [
      { name: 'ABS', description: '返回绝对值', template: '=ABS(number)' },
      { name: 'CEILING', description: '向上舍入到指定倍数', template: '=CEILING(number,significance)' },
      { name: 'COMBIN', description: '组合数计算', template: '=COMBIN(n,k)' },
      { name: 'COS', description: '余弦值', template: '=COS(angle)' },
      { name: 'COUNTBLANK', description: '计算空单元格数量', template: '=COUNTBLANK(range)' },
      { name: 'EVEN', description: '向上舍入到偶数', template: '=EVEN(number)' },
      { name: 'EXP', description: 'e的n次幂', template: '=EXP(number)' },
      { name: 'FACT', description: '阶乘', template: '=FACT(number)' },
      { name: 'FLOOR', description: '向下舍入到指定倍数', template: '=FLOOR(number,significance)' },
      { name: 'GCD', description: '最大公约数', template: '=GCD(number1,number2,...)' },
      { name: 'INT', description: '向下取整', template: '=INT(number)' },
      { name: 'LCM', description: '最小公倍数', template: '=LCM(number1,number2,...)' },
      { name: 'LN', description: '自然对数', template: '=LN(number)' },
      { name: 'LOG', description: '指定底数的对数', template: '=LOG(number,base)' },
      { name: 'LOG10', description: '以10为底的对数', template: '=LOG10(number)' },
      { name: 'MOD', description: '取余数', template: '=MOD(number,divisor)' },
      { name: 'ODD', description: '向上舍入到奇数', template: '=ODD(number)' },
      { name: 'PI', description: '圆周率π', template: '=PI()' },
      { name: 'POWER', description: '幂运算', template: '=POWER(number,power)' },
      { name: 'PRODUCT', description: '连乘', template: '=PRODUCT(number1,number2,...)' },
      { name: 'RADIANS', description: '度转弧度', template: '=RADIANS(angle)' },
      { name: 'RAND', description: '0到1的随机数', template: '=RAND()' },
      { name: 'RANDBETWEEN', description: '两个数之间的随机整数', template: '=RANDBETWEEN(bottom,top)' },
      { name: 'ROUND', description: '四舍五入', template: '=ROUND(number,num_digits)' },
      { name: 'ROUNDDOWN', description: '向下舍入', template: '=ROUNDDOWN(number,num_digits)' },
      { name: 'ROUNDUP', description: '向上舍入', template: '=ROUNDUP(number,num_digits)' },
      { name: 'SIGN', description: '返回数字的符号', template: '=SIGN(number)' },
      { name: 'SIN', description: '正弦值', template: '=SIN(angle)' },
      { name: 'SQRT', description: '平方根', template: '=SQRT(number)' },
      { name: 'SUM', description: '求和', template: '=SUM(number1,number2,...)' },
      { name: 'SUMIF', description: '条件求和', template: '=SUMIF(range,criteria,sum_range)' },
      { name: 'SUMIFS', description: '多条件求和', template: '=SUMIFS(sum_range,criteria_range1,criteria1,...)' },
      { name: 'SUMPRODUCT', description: '数组乘积求和', template: '=SUMPRODUCT(array1,array2,...)' },
      { name: 'TAN', description: '正切值', template: '=TAN(angle)' },
      { name: 'TRUNC', description: '截断小数', template: '=TRUNC(number,num_digits)' },
    ],
  },
  {
    id: 'stats', name: '统计',
    functions: [
      { name: 'AVEDEV', description: '平均绝对偏差', template: '=AVEDEV(number1,number2,...)' },
      { name: 'AVERAGE', description: '算术平均值', template: '=AVERAGE(number1,number2,...)' },
      { name: 'AVERAGEA', description: '平均值（含逻辑值/文本）', template: '=AVERAGEA(value1,value2,...)' },
      { name: 'AVERAGEIF', description: '条件平均值', template: '=AVERAGEIF(range,criteria,average_range)' },
      { name: 'CORREL', description: '相关系数', template: '=CORREL(array1,array2)' },
      { name: 'COUNT', description: '数字单元格计数', template: '=COUNT(value1,value2,...)' },
      { name: 'COUNTA', description: '非空单元格计数', template: '=COUNTA(value1,value2,...)' },
      { name: 'COUNTIF', description: '条件计数', template: '=COUNTIF(range,criteria)' },
      { name: 'COUNTIFS', description: '多条件计数', template: '=COUNTIFS(criteria_range1,criteria1,...)' },
      { name: 'MAX', description: '最大值', template: '=MAX(number1,number2,...)' },
      { name: 'MEDIAN', description: '中位数', template: '=MEDIAN(number1,number2,...)' },
      { name: 'MIN', description: '最小值', template: '=MIN(number1,number2,...)' },
      { name: 'MODE', description: '众数', template: '=MODE(number1,number2,...)' },
      { name: 'STDEV', description: '样本标准差', template: '=STDEV(number1,number2,...)' },
      { name: 'VAR', description: '样本方差', template: '=VAR(number1,number2,...)' },
    ],
  },
  {
    id: 'text', name: '文本',
    functions: [
      { name: 'CHAR', description: '返回ASCII码对应的字符', template: '=CHAR(number)' },
      { name: 'CLEAN', description: '删除不可打印字符', template: '=CLEAN(text)' },
      { name: 'CODE', description: '返回首字符的ASCII码', template: '=CODE(text)' },
      { name: 'CONCAT', description: '拼接文本', template: '=CONCAT(text1,text2,...)' },
      { name: 'CONCATENATE', description: '拼接文本（兼容）', template: '=CONCATENATE(text1,text2,...)' },
      { name: 'EXACT', description: '区分大小写的相等比较', template: '=EXACT(text1,text2)' },
      { name: 'FIND', description: '查找文本位置（区分大小写）', template: '=FIND(find_text,within_text,start_num)' },
      { name: 'LEFT', description: '从左边截取N个字符', template: '=LEFT(text,num_chars)' },
      { name: 'LEN', description: '返回文本长度', template: '=LEN(text)' },
      { name: 'LOWER', description: '转小写', template: '=LOWER(text)' },
      { name: 'MID', description: '从中间截取N个字符', template: '=MID(text,start_num,num_chars)' },
      { name: 'REPLACE', description: '替换指定位置的文本', template: '=REPLACE(old_text,start_num,num_chars,new_text)' },
      { name: 'REPT', description: '重复文本N次', template: '=REPT(text,number_times)' },
      { name: 'RIGHT', description: '从右边截取N个字符', template: '=RIGHT(text,num_chars)' },
      { name: 'SEARCH', description: '查找文本位置（不区分大小写）', template: '=SEARCH(find_text,within_text,start_num)' },
      { name: 'SUBSTITUTE', description: '替换文本', template: '=SUBSTITUTE(text,old_text,new_text,instance)' },
      { name: 'TEXT', description: '格式化数字为文本', template: '=TEXT(value,format_text)' },
      { name: 'TRIM', description: '删除多余空格', template: '=TRIM(text)' },
      { name: 'UPPER', description: '转大写', template: '=UPPER(text)' },
      { name: 'VALUE', description: '文本转数字', template: '=VALUE(text)' },
    ],
  },
  {
    id: 'finance', name: '财务',
    functions: [
      { name: 'FV', description: '未来值（终值）', template: '=FV(rate,nper,pmt,pv,type)' },
      { name: 'IPMT', description: '期间利息支付额', template: '=IPMT(rate,per,nper,pv,fv,type)' },
      { name: 'IRR', description: '内部收益率', template: '=IRR(values,guess)' },
      { name: 'NPER', description: '还款期数', template: '=NPER(rate,pmt,pv,fv,type)' },
      { name: 'NPV', description: '净现值', template: '=NPV(rate,value1,value2,...)' },
      { name: 'PMT', description: '等额还款额', template: '=PMT(rate,nper,pv,fv,type)' },
      { name: 'PPMT', description: '本金偿还额', template: '=PPMT(rate,per,nper,pv,fv,type)' },
      { name: 'PV', description: '现值', template: '=PV(rate,nper,pmt,fv,type)' },
      { name: 'RATE', description: '利率', template: '=RATE(nper,pmt,pv,fv,type,guess)' },
      { name: 'SLN', description: '直线折旧', template: '=SLN(cost,salvage,life)' },
    ],
  },
  {
    id: 'engineering', name: '工程',
    functions: [
      { name: 'BIN2DEC', description: '二进制转十进制', template: '=BIN2DEC(number)' },
      { name: 'BIN2HEX', description: '二进制转十六进制', template: '=BIN2HEX(number,places)' },
      { name: 'CONVERT', description: '单位转换', template: '=CONVERT(number,from_unit,to_unit)' },
      { name: 'DEC2BIN', description: '十进制转二进制', template: '=DEC2BIN(number,places)' },
      { name: 'DEC2HEX', description: '十进制转十六进制', template: '=DEC2HEX(number,places)' },
      { name: 'HEX2BIN', description: '十六进制转二进制', template: '=HEX2BIN(number,places)' },
      { name: 'HEX2DEC', description: '十六进制转十进制', template: '=HEX2DEC(number)' },
    ],
  },
];

// ─── Quick Functions ────────────────────────────────────────

const QUICK_FUNCTIONS: FunctionDef[] = [
  { name: 'SUM', description: '求和 · 计算选区数值总和', template: '=SUM()' },
  { name: 'AVERAGE', description: '平均值 · 忽略空单元格与文本', template: '=AVERAGE()' },
  { name: 'COUNT', description: '计数 · 仅统计数字单元格数量', template: '=COUNT()' },
  { name: 'MAX', description: '最大值 · 提取选区最大数值', template: '=MAX()' },
  { name: 'MIN', description: '最小值 · 提取选区最小数值', template: '=MIN()' },
];

// ─── Styles ─────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  background: '#ffffff',
  border: '1px solid #e0e0e0',
  borderRadius: 10,
  boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
  minWidth: 240,
  maxWidth: 260,
  padding: '8px 0',
  zIndex: 10000,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  fontSize: 13,
  color: '#333',
};

const sectionTitleStyle: React.CSSProperties = {
  padding: '6px 14px 4px',
  fontSize: 11,
  color: '#999',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
};

const itemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '7px 14px',
  cursor: 'pointer',
  gap: 10,
  transition: 'background 0.1s',
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: '#eee',
  margin: '4px 0',
};

const categoryItemStyle: React.CSSProperties = {
  ...itemStyle,
  justifyContent: 'space-between',
};

// ─── Category Submenu Popup ─────────────────────────────────

const CategorySubmenu: React.FC<{
  category: Category;
  parentRect: DOMRect;
  onSelect: (fn: FunctionDef) => void;
  onClose: () => void;
}> = ({ category, parentRect, onSelect, onClose }) => {
  const popupStyle = useMemo(() => {
    const left = parentRect.right + 2;
    const top = parentRect.top - 4;
    const adjLeft = left + 240 > window.innerWidth ? parentRect.left - 244 : left;
    const maxH = window.innerHeight - 40;
    const adjTop = Math.min(Math.max(0, top), maxH - Math.min(category.functions.length * 32 + 16, 400));
    return {
      position: 'fixed' as const,
      left: adjLeft,
      top: adjTop,
      background: '#fff',
      border: '1px solid #e0e0e0',
      borderRadius: 8,
      boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
      minWidth: 220,
      maxWidth: 280,
      maxHeight: 400,
      overflowY: 'auto' as const,
      padding: '4px 0',
      zIndex: 10001,
      fontSize: 13,
    };
  }, [parentRect, category.functions.length]);

  return (
    <div style={popupStyle} onClick={e => e.stopPropagation()}>
      {category.functions.map(fn => (
        <div
          key={fn.name}
          style={itemStyle}
          onMouseEnter={e => (e.currentTarget.style.background = '#e8f0fe')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onClick={() => { onSelect(fn); onClose(); }}
        >
          <span style={{ fontWeight: 600, color: '#4285F4', minWidth: 70, fontSize: 12 }}>{fn.name}</span>
          <span style={{ color: '#666', fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fn.description}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────

interface FormulaDropdownProps {
  table: FreeTable;
  onInsertFormula?: (formula: string) => void;
}

export const FormulaDropdown: React.FC<FormulaDropdownProps> = ({ table, onInsertFormula }) => {
  const [visible, setVisible] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [categoryAnchor, setCategoryAnchor] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on outside click
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [visible]);

  // Close on Escape
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setVisible(false); setActiveCategory(null); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible]);

  // Compute button position for panel
  const panelPos = useMemo(() => {
    if (!buttonRef.current) return { left: 0, top: 0 };
    const rect = buttonRef.current.getBoundingClientRect();
    return { left: rect.left, top: rect.bottom + 4 };
  }, [visible]);

  const insertFormula = useCallback((fn: FunctionDef) => {
    const store = useSheetStore.getState();
    const sel = store.selectionRange;
    let targetRow: number = store.activeCell?.row ?? 0;
    let targetCol: number = store.activeCell?.col ?? 0;

    // Build formula with selection reference
    let formula = fn.template;
    if (sel && ['SUM', 'AVERAGE', 'COUNT', 'MAX', 'MIN'].includes(fn.name)) {
      // Quick functions: auto-fill selection
      const colToLetter = (c: number) => {
        let result = '';
        c += 1;
        while (c > 0) { c--; result = String.fromCharCode(65 + (c % 26)) + result; c = Math.floor(c / 26); }
        return result;
      };
      const startRef = `${colToLetter(sel.start.col)}${sel.start.row + 1}`;
      const endRef = `${colToLetter(sel.end.col)}${sel.end.row + 1}`;
      formula = `=${fn.name}(${startRef}:${endRef})`;

      // Auto-place formula below the selection (or at activeCell if no multi-row selection)
      if (sel.start.row !== sel.end.row || sel.start.col !== sel.end.col) {
        // Multi-cell selection: place formula below the last row, first column
        targetRow = sel.end.row + 1;
        targetCol = sel.start.col;
      } else {
        // Single cell: use active cell
        targetRow = store.activeCell?.row ?? 0;
        targetCol = store.activeCell?.col ?? 0;
      }
    } else if (sel && fn.template.includes('()')) {
      // Other general functions: set activeCell as editing cell
      targetRow = store.activeCell?.row ?? 0;
      targetCol = store.activeCell?.col ?? 0;
    }

    table.setCell(targetRow, targetCol, formula);
    store.setFormulaBarText(formula);
    store.setEditingCell({ row: targetRow, col: targetCol });
    // Also set selection to the formula cell so it's visually selected
    store.setSelection({
      sheetId: table.sheetId,
      start: { row: targetRow, col: targetCol },
      end: { row: targetRow, col: targetCol },
    }, { row: targetRow, col: targetCol });
    store.setStatusText(`已插入 ${fn.name} 公式（结果将显示在下方）`);

    if (onInsertFormula) onInsertFormula(formula);
    setVisible(false);
    setActiveCategory(null);
  }, [table, onInsertFormula]);

  const handleQuickFunction = useCallback((fn: FunctionDef) => {
    insertFormula(fn);
  }, [insertFormula]);

  const handleAIWrite = useCallback(() => {
    const store = useSheetStore.getState();
    store.setStatusText('AI写公式功能即将上线');
    setVisible(false);
  }, []);

  const handleCategoryHover = useCallback((catId: string, e: React.MouseEvent) => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setActiveCategory(catId);
    setCategoryAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
  }, []);

  const handleCategoryLeave = useCallback(() => {
    hoverTimeout.current = setTimeout(() => {
      setActiveCategory(null);
      setCategoryAnchor(null);
    }, 150);
  }, []);

  const handleHelp = useCallback(() => {
    const store = useSheetStore.getState();
    store.setStatusText('函数帮助文档即将上线');
    setVisible(false);
  }, []);

  const currentCategory = activeCategory ? CATEGORIES.find(c => c.id === activeCategory) : null;

  return (
    <>
      <div
        ref={buttonRef}
        onClick={() => setVisible(!visible)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '4px 8px',
          cursor: 'pointer',
          borderRadius: 4,
          background: 'transparent',
          userSelect: 'none',
          fontSize: 12,
          fontWeight: 600,
          color: visible ? '#4285F4' : '#4285F4',
        }}
      >
        <span style={{ fontSize: 16 }}>Σ</span>
        <span style={{ fontSize: 8, color: '#999' }}>▼</span>
      </div>

      {visible && createPortal(
        <div ref={panelRef} data-sheet-keep-selection style={{ ...panelStyle, left: panelPos.left, top: panelPos.top }} onClick={e => e.stopPropagation()}>
          {/* Quick Functions */}
          <div style={sectionTitleStyle}>常用函数</div>
          {QUICK_FUNCTIONS.map(fn => (
            <div
              key={fn.name}
              style={itemStyle}
              onClick={() => handleQuickFunction(fn)}
              onMouseEnter={e => (e.currentTarget.style.background = '#e8f0fe')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{
                fontWeight: 600, color: '#4285F4', minWidth: 60, fontSize: 13,
              }}>{fn.name}</span>
              <span style={{ color: '#888', fontSize: 11 }}>{fn.description}</span>
            </div>
          ))}

          <div style={dividerStyle} />

          {/* AI Write Formula */}
          <div style={itemStyle} onClick={handleAIWrite}
            onMouseEnter={e => (e.currentTarget.style.background = '#e8f0fe')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: 16, color: '#4285F4' }}>Σ</span>
            <span style={{ fontWeight: 600, color: '#4285F4', flex: 1 }}>AI 写公式</span>
          </div>

          <div style={dividerStyle} />

          {/* Category Navigation */}
          <div style={sectionTitleStyle}>函数分类</div>
          <div
            style={{ ...categoryItemStyle, color: '#333' }}
            onClick={() => {
              // "全部函数" shows the first category as default
              handleQuickFunction(QUICK_FUNCTIONS[0]);
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#e8f0fe')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span>全部函数</span>
          </div>
          {CATEGORIES.map(cat => (
            <div
              key={cat.id}
              style={categoryItemStyle}
              onMouseEnter={(e) => { handleCategoryHover(cat.id, e); (e.currentTarget as HTMLElement).style.background = '#e8f0fe'; }}
              onMouseLeave={(e) => { handleCategoryLeave(); (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              onClick={() => {
                // Click opens submenu too
                handleCategoryHover(cat.id, { currentTarget: { getBoundingClientRect: () => buttonRef.current?.getBoundingClientRect() || new DOMRect() } } as any);
              }}
            >
              <span>{cat.name}</span>
              <span style={{ color: '#999', fontSize: 12 }}>{cat.functions.length} 个 ›</span>
            </div>
          ))}

          <div style={dividerStyle} />

          {/* Help */}
          <div style={itemStyle} onClick={handleHelp}
            onMouseEnter={e => (e.currentTarget.style.background = '#e8f0fe')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ color: '#999', fontSize: 14 }}>?</span>
            <span style={{ color: '#666' }}>功能介绍</span>
          </div>
        </div>,
        document.body,
      )}

      {/* Category Submenu */}
      {activeCategory && currentCategory && categoryAnchor && (
        <div
          onMouseEnter={() => { if (hoverTimeout.current) clearTimeout(hoverTimeout.current); }}
          onMouseLeave={handleCategoryLeave}
        >
          <CategorySubmenu
            category={currentCategory}
            parentRect={categoryAnchor}
            onSelect={insertFormula}
            onClose={() => { setVisible(false); setActiveCategory(null); }}
          />
        </div>
      )}
    </>
  );
};

export default FormulaDropdown;
