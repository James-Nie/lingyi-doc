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
  | { type: 'connected'; docVersion: number; globalVersion: number; onlineUsers: OnlineUser[]; activeCellEditor?: ActiveCellEditor | null }
  | { type: 'heartbeat_ack'; serverTime: number }
  | { type: 'crdt_op'; operation: import('./index').CrdtOperation; globalVersion: number; senderId: string }
  | { type: 'user_joined'; user: OnlineUser }
  | { type: 'user_left'; userId: string }
  | { type: 'cursor_update'; userId: string; payload: Record<string, unknown> }
  | { type: 'selection_update'; userId: string; payload: Record<string, unknown> }
  | { type: 'cell_editing_update'; editor: ActiveCellEditor | null }
  | { type: 'sync_response'; operations: import('./index').CrdtOperation[]; currentVersion: number }
  | { type: 'comment_update'; senderId: string; payload: import('../doc/comments').CommentUpdatePayload }
  | { type: 'error'; code: number; message: string };

export interface CollabClientOptions {
  docId: string;
  token: string;
  url?: string;
  heartbeatIntervalMs?: number;
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

export class CollabClient {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private state: CollabConnectionState = 'idle';
  /** 主动断开时不应上报连接错误 */
  private closing = false;
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
    this.setState('connecting');
    const url = this.options.url ?? defaultWsUrl(this.options.docId, this.options.token);
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.setState('connected');
      this.startHeartbeat();
    };

    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      try {
        const message = JSON.parse(String(ev.data)) as ServerMessage;
        this.options.onMessage?.(message);
      } catch (err) {
        this.options.onError?.(err instanceof Error ? err : new Error('消息解析失败'));
      }
    };

    ws.onerror = () => {
      if (this.closing || this.ws !== ws) return;
      this.options.onError?.(new Error('WebSocket 连接错误'));
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.stopHeartbeat();
      this.ws = null;
      if (!this.closing) {
        this.setState('offline');
      }
    };
  }

  disconnect(): void {
    this.closing = true;
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
    this.setState('idle');
    this.closing = false;
  }

  sendOp(operation: import('./index').CrdtOperation): void {
    this.send('crdt_op', { operation });
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
