// ============================================================
// 公式 Tokenizer（词法分析器）
// 将公式字符串拆分为 Token 流
// ============================================================

export enum TokenType {
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  BOOLEAN = 'BOOLEAN',
  CELL_REF = 'CELL_REF',
  RANGE_REF = 'RANGE_REF',
  FUNCTION = 'FUNCTION',
  OPERATOR = 'OPERATOR',
  COMPARISON = 'COMPARISON',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  COMMA = 'COMMA',
  PERCENT = 'PERCENT',
  COLON = 'COLON',
  ERROR = 'ERROR',
  EOF = 'EOF',
}

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

/** 二元运算符 */
const BINARY_OPS = new Set(['+', '-', '*', '/', '^', '&']);

/** 比较运算符 */
const COMPARISON_OPS = new Set(['=', '<', '>', '<=', '>=', '<>']);

export class Tokenizer {
  private _input: string;
  private _pos = 0;
  private _current: Token[] = [];

  constructor(input: string) {
    // Remove leading '=' if present
    this._input = input.startsWith('=') ? input.slice(1) : input;
  }

  tokenize(): Token[] {
    this._current = [];
    this._pos = 0;
    while (this._pos < this._input.length) {
      const ch = this._peek();
      if (ch === ' ') {
        this._advance();
        continue;
      }
      if (ch === '\n' || ch === '\r') {
        this._advance();
        continue;
      }

      // Parentheses
      if (ch === '(') { this._push(TokenType.LPAREN, '('); this._advance(); continue; }
      if (ch === ')') { this._push(TokenType.RPAREN, ')'); this._advance(); continue; }
      if (ch === ',') { this._push(TokenType.COMMA, ','); this._advance(); continue; }
      if (ch === '%') { this._push(TokenType.PERCENT, '%'); this._advance(); continue; }

      // String literal
      if (ch === '"' || ch === "'") {
        this._readString(ch as '"' | "'");
        continue;
      }

      // Numbers
      if (/[0-9]/.test(ch) || (ch === '.' && this._peekAhead(1) && /[0-9]/.test(this._peekAhead(1)!))) {
        this._readNumber();
        continue;
      }

      // Comparison operators (must check BEFORE binary operators to match <= >= <>)
      if (ch === '<' || ch === '>' || ch === '=') {
        if (this._input.slice(this._pos, this._pos + 2) === '<=') {
          this._push(TokenType.COMPARISON, '<='); this._pos += 2; continue;
        }
        if (this._input.slice(this._pos, this._pos + 2) === '>=') {
          this._push(TokenType.COMPARISON, '>='); this._pos += 2; continue;
        }
        if (this._input.slice(this._pos, this._pos + 2) === '<>') {
          this._push(TokenType.COMPARISON, '<>'); this._pos += 2; continue;
        }
        // Single char comparison
        if (ch === '=' || ch === '<' || ch === '>') {
          this._push(TokenType.COMPARISON, ch); this._advance(); continue;
        }
      }

      // Binary operators
      if (BINARY_OPS.has(ch)) {
        this._push(TokenType.OPERATOR, ch); this._advance(); continue;
      }

      // Colon (range separator)
      if (ch === ':') {
        this._push(TokenType.COLON, ':'); this._advance(); continue;
      }

      // Cell references or functions or booleans
      if (/[A-Za-z_\u4e00-\u9fff]/.test(ch)) {
        this._readIdentifier();
        continue;
      }

      // Unknown character → error token
      this._push(TokenType.ERROR, ch); this._advance();
    }

    this._push(TokenType.EOF, '');
    return this._current;
  }

  private _peek(): string {
    return this._pos < this._input.length ? this._input[this._pos] : '';
  }

  private _peekAhead(n: number): string | undefined {
    return this._pos + n < this._input.length ? this._input[this._pos + n] : undefined;
  }

  private _advance(): string {
    return this._input[this._pos++] || '';
  }

  private _push(type: TokenType, value: string): void {
    this._current.push({ type, value, pos: this._pos });
  }

  private _readNumber(): void {
    let num = '';
    let hasDecimal = false;
    const start = this._pos;
    while (this._pos < this._input.length) {
      const ch = this._input[this._pos];
      if (/[0-9]/.test(ch)) {
        num += ch; this._pos++;
      } else if (ch === '.' && !hasDecimal) {
        // Check if next char is a digit (to avoid consuming range colons like A1:B2.N)
        const next = this._peekAhead(1);
        if (next && /[0-9]/.test(next)) {
          hasDecimal = true;
          num += ch; this._pos++;
        } else {
          break;
        }
      } else if (ch === 'E' || ch === 'e') {
        // Scientific notation
        num += ch; this._pos++;
        const sign = this._peek();
        if (sign === '+' || sign === '-') { num += sign; this._pos++; }
      } else {
        break;
      }
    }
    this._current.push({ type: TokenType.NUMBER, value: num, pos: start });
  }

  private _readString(quote: '"' | "'"): void {
    this._advance(); // skip opening quote
    let str = '';
    const start = this._pos;
    while (this._pos < this._input.length) {
      const ch = this._input[this._pos];
      if (ch === '\\') {
        this._pos++;
        str += this._input[this._pos] || '';
        this._pos++;
      } else if (ch === quote) {
        this._pos++; // skip closing quote
        break;
      } else {
        str += ch;
        this._pos++;
      }
    }
    this._current.push({ type: TokenType.STRING, value: str, pos: start });
  }

  private _readIdentifier(): void {
    let id = '';
    const start = this._pos;
    while (this._pos < this._input.length && /[A-Za-z0-9_.\u4e00-\u9fff]/.test(this._input[this._pos])) {
      id += this._input[this._pos];
      this._pos++;
    }

    // Check if followed by '(' → function call
    const nextNonSpace = this._skipSpaces(this._pos);
    if (nextNonSpace < this._input.length && this._input[nextNonSpace] === '(') {
      this._current.push({ type: TokenType.FUNCTION, value: id.toUpperCase(), pos: start });
      return;
    }

    // Check if TRUE/FALSE
    const upper = id.toUpperCase();
    if (upper === 'TRUE') {
      this._current.push({ type: TokenType.BOOLEAN, value: 'TRUE', pos: start });
      return;
    }
    if (upper === 'FALSE') {
      this._current.push({ type: TokenType.BOOLEAN, value: 'FALSE', pos: start });
      return;
    }

    // Check for cell reference pattern: column letters + row numbers (like A1, AB123)
    const cellMatch = id.match(/^([A-Za-z]+)([0-9]+)$/);
    if (cellMatch) {
      // Check if the next token could be a colon (range) — peek ahead
      const peekPos = this._skipSpaces(this._pos);
      if (peekPos < this._input.length && this._input[peekPos] === ':') {
        // This might be the start of a range: A1:B2
        const peekAfterColon = this._skipSpaces(peekPos + 1);
        if (peekAfterColon < this._input.length && /[A-Za-z]/.test(this._input[peekAfterColon])) {
          // Potential range — just emit as CELL_REF now, parser will handle merging
        }
      }
      this._current.push({ type: TokenType.CELL_REF, value: id.toUpperCase(), pos: start });
      return;
    }

    // Generic identifier (named range, error like #VALUE!, etc.)
    if (id.startsWith('#')) {
      this._current.push({ type: TokenType.ERROR, value: id, pos: start });
      return;
    }

    // Unknown function or variable → treat as error reference
    this._current.push({ type: TokenType.ERROR, value: `#NAME?`, pos: start });
    return;
  }

  /** Skip whitespace and return the next non-space position */
  private _skipSpaces(from: number): number {
    let p = from;
    while (p < this._input.length && this._input[p] === ' ') p++;
    return p;
  }
}
