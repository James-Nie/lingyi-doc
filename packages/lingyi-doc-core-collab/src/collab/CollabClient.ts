export type CollabConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface OnlineUser {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
  joinedAt: number;
}

export interface ActiveCellEditor {
  userId: string;
  displayName: string;
  sheetId: string;
  row: number;
  col: number;
}

export type ServerMessage =
  | {
      type: 'connected';
      docVersion: number;
      globalVersion: number;
      onlineUsers: OnlineUser[];
      activeCellEditor?: ActiveCellEditor | null;
      activeCellEditors?: ActiveCellEditor[];
    }
  | { type: 'heartbeat_ack'; serverTime: number }
  | { type: 'crdt_op'; operation: import('./index').CrdtOperation; globalVersion: number; senderId: string }
  | { type: 'user_joined'; user: OnlineUser }
  | { type: 'user_left'; userId: string }
  | { type: 'cursor_update'; userId: string; payload: Record<string, unknown> }
  | { type: 'selection_update'; userId: string; payload: Record<string, unknown> }
  | {
      type: 'cell_editing_update';
      editor: ActiveCellEditor | null;
      editors?: ActiveCellEditor[];
    }
  | { type: 'sync_response'; operations: import('./index').CrdtOperation[]; currentVersion: number }
  | { type: 'comment_update'; senderId: string; payload: import('@lingyi-doc/core-doc').CommentUpdatePayload }
  | { type: 'error'; code: number; message: string };

export interface CollabClientOptions {
  docId: string;
  token: string;
  /** 重连时取最新 token；未提供则沿用构造时的 token */
  getToken?: () => string | null;
  url?: string;
  heartbeatIntervalMs?: number;
  /** 是否在非主动断开后自动重连，默认 true */
  autoReconnect?: boolean;
  /** 最大重连次数，默认无限 */
  maxReconnectAttempts?: number;
  onStateChange?: (state: CollabConnectionState) => void;
  onMessage?: (message: ServerMessage) => void;
  onError?: (error: Error) => void;
}

function defaultWsUrl(docId: string, token: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const params = new URLSearchParams({ docId, token });
  return `${proto}//${host}/api/v1/collab/ws?${params.toString()}`;
}

function nestEvent(event: string, data: unknown): string {
  return JSON.stringify({ event, data });
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
/** 功能关闭 / 鉴权失败等：不应自动重连 */
const FATAL_ERROR_CODES = new Set([210007, 210008]);

export class CollabClient {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private state: CollabConnectionState = 'idle';
  /** 主动断开时不应上报连接错误 / 不重连 */
  private closing = false;
  /** 服务端明确拒绝（如协同未开启）后永久停连，直到主动 disconnect/connect */
  private fatalOffline = false;
  private reconnectAttempt = 0;
  private readonly options: CollabClientOptions;

  constructor(options: CollabClientOptions) {
    this.options = options;
  }

  getState(): CollabConnectionState {
    return this.state;
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.closing = false;
    this.fatalOffline = false;
    this.clearReconnectTimer();

    const token = this.resolveToken();
    if (!token) {
      this.setState('offline');
      this.options.onError?.(new Error('未登录，无法建立协同连接'));
      return;
    }

    this.setState(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    const url = this.options.url
      ? this.withToken(this.options.url, token)
      : defaultWsUrl(this.options.docId, token);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      // 握手成功 ≠ 业务就绪；勿在此清零重连计数，否则服务端立刻 close 时会每秒死循环
      this.setState('connected');
      this.startHeartbeat();
    };

    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      try {
        const message = JSON.parse(String(ev.data)) as ServerMessage;
        this.handleServerMessage(message);
      } catch (err) {
        this.options.onError?.(err instanceof Error ? err : new Error('消息解析失败'));
      }
    };

    ws.onerror = () => {
      if (this.closing || this.fatalOffline || this.ws !== ws) return;
      // onclose 会处理重连；此处避免噪音，仅首次连接失败时提示
      if (this.reconnectAttempt === 0 && this.state === 'connecting') {
        this.options.onError?.(new Error('WebSocket 连接错误'));
      }
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.stopHeartbeat();
      this.ws = null;
      if (this.closing || this.fatalOffline) return;
      this.scheduleReconnect();
    };
  }

  disconnect(): void {
    this.closing = true;
    this.fatalOffline = false;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
    this.reconnectAttempt = 0;
    this.setState('idle');
    this.closing = false;
  }

  private handleServerMessage(message: ServerMessage): void {
    if (message.type === 'connected') {
      this.reconnectAttempt = 0;
    }
    if (message.type === 'error' && FATAL_ERROR_CODES.has(message.code)) {
      this.fatalOffline = true;
      this.closing = true;
      this.clearReconnectTimer();
      this.setState('offline');
      this.options.onMessage?.(message);
      try {
        this.ws?.close();
      } catch {
        // ignore
      }
      return;
    }
    this.options.onMessage?.(message);
  }

  sendOp(operation: import('./index').CrdtOperation): void {
    this.send('crdt_op', { operation });
  }

  /** 批量发送多个 CRDT 操作，合并为一条 WebSocket 消息 */
  sendOps(operations: import('./index').CrdtOperation[]): void {
    if (operations.length === 0) return;
    if (operations.length === 1) {
      this.send('crdt_op', { operation: operations[0] });
      return;
    }
    this.send('crdt_op_batch', { operations });
  }

  requestSync(fromVersion: number): void {
    this.send('sync_request', { fromVersion });
  }

  sendCursor(payload: Record<string, unknown>): void {
    this.send('cursor_move', { payload });
  }

  sendSelection(payload: Record<string, unknown>): void {
    this.send('selection_change', { payload });
  }

  sendCellEditing(payload: import('./cellEditing').CellEditingPayload): void {
    this.send('cell_editing', payload);
  }

  private resolveToken(): string | null {
    const fresh = this.options.getToken?.();
    if (fresh) return fresh;
    return this.options.token || null;
  }

  /** 自定义 url 时刷新 query 中的 token */
  private withToken(url: string, token: string): string {
    try {
      const u = new URL(url, window.location.origin);
      u.searchParams.set('token', token);
      u.searchParams.set('docId', this.options.docId);
      return u.toString();
    } catch {
      return url;
    }
  }

  private scheduleReconnect(): void {
    const autoReconnect = this.options.autoReconnect !== false;
    if (!autoReconnect) {
      this.setState('offline');
      return;
    }

    const max = this.options.maxReconnectAttempts;
    if (max != null && this.reconnectAttempt >= max) {
      this.setState('offline');
      this.options.onError?.(new Error('协同连接已断开，重连次数已达上限'));
      return;
    }

    this.setState('reconnecting');
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);
    this.reconnectAttempt += 1;
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closing || this.fatalOffline) return;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private send(event: string, data: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(nestEvent(event, data));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const interval = this.options.heartbeatIntervalMs ?? 30_000;
    this.heartbeatTimer = setInterval(() => {
      this.send('heartbeat', { ts: Date.now() });
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private setState(state: CollabConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.options.onStateChange?.(state);
  }
}
