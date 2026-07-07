// ============================================================
// 公式 Parser（递归下降语法分析器）+ AST 节点定义
// ============================================================

import { Token, TokenType, Tokenizer } from './Tokenizer';

// ─── AST Node Types ─────────────────────────────────────────

export type AstNode =
  | NumberLiteralNode
  | StringLiteralNode
  | BooleanLiteralNode
  | CellRefNode
  | RangeRefNode
  | BinaryOpNode
  | UnaryOpNode
  | FunctionCallNode
  | ErrorNode;

export interface NumberLiteralNode {
  type: 'number';
  value: number;
}

export interface StringLiteralNode {
  type: 'string';
  value: string;
}

export interface BooleanLiteralNode {
  type: 'boolean';
  value: boolean;
}

export interface CellRefNode {
  type: 'cellRef';
  col: number;       // 0-based column index
  row: number;       // 0-based row index
  colStr: string;    // original column letters (e.g. "AB")
  rowNum: number;    // original row number (1-based)
  isAbsoluteCol: boolean;
  isAbsoluteRow: boolean;
}

export interface RangeRefNode {
  type: 'rangeRef';
  start: CellRefNode;
  end: CellRefNode;
}

export interface BinaryOpNode {
  type: 'binaryOp';
  operator: string;
  left: AstNode;
  right: AstNode;
}

export interface UnaryOpNode {
  type: 'unaryOp';
  operator: string;
  operand: AstNode;
}

export interface FunctionCallNode {
  type: 'functionCall';
  name: string;
  arguments: AstNode[];
}

export interface ErrorNode {
  type: 'error';
  error: string;
  rawText?: string;
}

// ─── Parser ─────────────────────────────────────────────────

/**
 * 递归下降 Parser
 *
 * Grammar (简化):
 *   expr       → comparison
 *   comparison → concat (('='|'<>'|'<'|'>'|'<='|'>=') concat)*
 *   concat     → sum (('&') sum)*
 *   sum        → term (('+'|'-') term)*
 *   term       → unary (('*'|'/') unary)*
 *   unary      → ('+'|'-') unary | power
 *   power      → atom ('^' power)?
 *   atom       → NUMBER | STRING | BOOLEAN | CELL_REF range? | FUNCTION call | '(' expr ')' | ERROR
 *   range      → ':' CELL_REF
 *   call       → '(' (expr (',' expr)*)? ')'
 */

export class Parser {
  private _tokens: Token[] = [];
  private _pos = 0;

  parse(formula: string): AstNode {
    const tokenizer = new Tokenizer(formula);
    this._tokens = tokenizer.tokenize();
    this._pos = 0;

    const ast = this._expr();
    // Check for unexpected trailing tokens
    if (this._current().type !== TokenType.EOF) {
      return { type: 'error', error: '#ERROR!', rawText: formula };
    }
    return ast;
  }

  private _current(): Token {
    return this._tokens[this._pos] || { type: TokenType.EOF, value: '', pos: -1 };
  }

  private _peek(offset = 0): Token {
    return this._tokens[this._pos + offset] || { type: TokenType.EOF, value: '', pos: -1 };
  }

  private _advance(): Token {
    return this._tokens[this._pos++] || { type: TokenType.EOF, value: '', pos: -1 };
  }

  private _expect(type: TokenType): Token {
    if (this._current().type === type) return this._advance();
    throw new Error(`Expected ${type} but got ${this._current().type}`);
  }

  // ─── Expression ───────────────────────────────────────────

  private _expr(): AstNode {
    return this._comparison();
  }

  // comparison → concat (COMPARISON concat)*
  private _comparison(): AstNode {
    let left = this._concat();
    while (this._current().type === TokenType.COMPARISON) {
      const op = this._advance().value;
      const right = this._concat();
      left = { type: 'binaryOp', operator: op, left, right } as BinaryOpNode;
    }
    return left;
  }

  // concat → sum (('&') sum)*
  private _concat(): AstNode {
    let left = this._sum();
    while (this._current().type === TokenType.OPERATOR && this._current().value === '&') {
      this._advance(); // consume '&'
      const right = this._sum();
      left = { type: 'binaryOp', operator: '&', left, right } as BinaryOpNode;
    }
    return left;
  }

  // sum → term (('+'|'-') term)*
  private _sum(): AstNode {
    let left = this._term();
    while (this._current().type === TokenType.OPERATOR &&
           (this._current().value === '+' || this._current().value === '-')) {
      const op = this._advance().value;
      const right = this._term();
      left = { type: 'binaryOp', operator: op, left, right } as BinaryOpNode;
    }
    return left;
  }

  // term → unary (('*'|'/') unary)*
  private _term(): AstNode {
    let left = this._unary();
    while (this._current().type === TokenType.OPERATOR &&
           (this._current().value === '*' || this._current().value === '/')) {
      const op = this._advance().value;
      const right = this._unary();
      left = { type: 'binaryOp', operator: op, left, right } as BinaryOpNode;
    }
    return left;
  }

  // unary → ('+'|'-') unary | power
  private _unary(): AstNode {
    if (this._current().type === TokenType.OPERATOR &&
        (this._current().value === '+' || this._current().value === '-')) {
      const op = this._advance().value;
      const operand = this._unary();
      return { type: 'unaryOp', operator: op, operand } as UnaryOpNode;
    }
    return this._power();
  }

  // power → atom ('^' power)?
  private _power(): AstNode {
    let left = this._atom();
    if (this._current().type === TokenType.OPERATOR && this._current().value === '^') {
      this._advance(); // consume '^'
      const right = this._power(); // right-associative
      left = { type: 'binaryOp', operator: '^', left, right } as BinaryOpNode;
    }
    // Handle % suffix (percentage)
    if (this._current().type === TokenType.PERCENT) {
      this._advance();
      const hundred: NumberLiteralNode = { type: 'number', value: 100 };
      left = { type: 'binaryOp', operator: '/', left, right: hundred } as BinaryOpNode;
    }
    return left;
  }

  // atom → NUMBER | STRING | BOOLEAN | CELL_REF range? | FUNCTION call | '(' expr ')' | ERROR
  private _atom(): AstNode {
    const tok = this._current();

    switch (tok.type) {
      case TokenType.NUMBER: {
        this._advance();
        return { type: 'number', value: parseFloat(tok.value) } as NumberLiteralNode;
      }

      case TokenType.STRING: {
        this._advance();
        return { type: 'string', value: tok.value } as StringLiteralNode;
      }

      case TokenType.BOOLEAN: {
        this._advance();
        return { type: 'boolean', value: tok.value === 'TRUE' } as BooleanLiteralNode;
      }

      case TokenType.CELL_REF: {
        this._advance();
        const ref = this._parseCellRef(tok.value);
        // Check if followed by colon → range
        if (this._current().type === TokenType.COLON) {
          this._advance(); // consume ':'
          const endTok = this._expect(TokenType.CELL_REF);
          const endRef = this._parseCellRef(endTok.value);
          return { type: 'rangeRef', start: ref, end: endRef } as RangeRefNode;
        }
        return ref;
      }

      case TokenType.FUNCTION: {
        const name = tok.value;
        this._advance(); // function name
        this._expect(TokenType.LPAREN);
        const args = this._parseCallArgs();
        this._expect(TokenType.RPAREN);
        return { type: 'functionCall', name, arguments: args } as FunctionCallNode;
      }

      case TokenType.LPAREN: {
        this._advance(); // '('
        const inner = this._expr();
        this._expect(TokenType.RPAREN);
        return inner;
      }

      case TokenType.ERROR: {
        this._advance();
        return { type: 'error', error: tok.value, rawText: tok.value } as ErrorNode;
      }

      case TokenType.EOF: {
        return { type: 'error', error: '#ERROR!' } as ErrorNode;
      }

      default:
        this._advance();
        return { type: 'error', error: '#ERROR!', rawText: tok.value } as ErrorNode;
    }
  }

  private _parseCallArgs(): AstNode[] {
    const args: AstNode[] = [];
    if (this._current().type === TokenType.RPAREN) {
      return args; // empty args
    }
    args.push(this._expr());
    while (this._current().type === TokenType.COMMA) {
      this._advance(); // consume comma
      // Handle trailing comma
      if (this._current().type === TokenType.RPAREN) break;
      args.push(this._expr());
    }
    return args;
  }

  /** Parse a cell reference string like "A1", "$B$2", "AB$123" */
  private _parseCellRef(ref: string): CellRefNode {
    let colStr = '';
    let rowStr = '';
    let isAbsoluteCol = false;
    let isAbsoluteRow = false;

    let i = 0;

    // Check and skip leading '$'
    if (ref[i] === '$') {
      isAbsoluteCol = true;
      i++;
    }

    // Read column letters
    while (i < ref.length && /[A-Za-z]/.test(ref[i])) {
      colStr += ref[i].toUpperCase();
      i++;
    }

    // Check and skip '$' before row
    if (i < ref.length && ref[i] === '$') {
      isAbsoluteRow = true;
      i++;
    }

    // Read row digits
    while (i < ref.length && /[0-9]/.test(ref[i])) {
      rowStr += ref[i];
      i++;
    }

    const rowNum = parseInt(rowStr) || 0;

    return {
      type: 'cellRef',
      col: this._colToNum(colStr),
      row: rowNum - 1,
      colStr,
      rowNum,
      isAbsoluteCol,
      isAbsoluteRow,
    };
  }

  private _colToNum(col: string): number {
    let n = 0;
    for (let i = 0; i < col.length; i++) {
      n = n * 26 + (col.charCodeAt(i) - 64);
    }
    return n - 1;
  }
}
