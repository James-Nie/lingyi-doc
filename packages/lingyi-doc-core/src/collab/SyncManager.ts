import type { CrdtOperation } from './index';
import { CollabClient, type CollabConnectionState, type OnlineUser, type ServerMessage } from './CollabClient';
import type { ActiveCellEditor, CellEditingPayload } from './cellEditing';

export interface SyncManagerOptions {
  docId: string;
  getToken: () => string | null;
  wsUrl?: string;
  onRemoteOp?: (op: CrdtOperation, meta: { globalVersion: number; senderId: string }) => void;
  onPresenceChange?: (users: OnlineUser[]) => void;
  onCellEditingChange?: (editor: ActiveCellEditor | null) => void;
  onCursorUpdate?: (userId: string, payload: Record<string, unknown>) => void;
  onSelectionUpdate?: (userId: string, payload: Record<string, unknown>) => void;
  onCommentUpdate?: (senderId: string, payload: import('../doc/comments').CommentUpdatePayload) => void;
  onStateChange?: (state: CollabConnectionState) => void;
  onConnected?: (info: { docVersion: number; globalVersion: number }) => void;
  onError?: (error: Error) => void;
}

export class SyncManager {
  private client: CollabClient | null = null;
  private globalVersion = 0;
  private docVersion = 0;
  private onlineUsers: OnlineUser[] = [];
  private readonly options: SyncManagerOptions;

  constructor(options: SyncManagerOptions) {
    this.options = options;
  }

  getGlobalVersion(): number {
    return this.globalVersion;
  }

  getDocVersion(): number {
    return this.docVersion;
  }

  getOnlineUsers(): OnlineUser[] {
    return this.onlineUsers;
  }

  isOnline(): boolean {
    return this.client?.getState() === 'connected';
  }

  connect(): void {
    const token = this.options.getToken();
    if (!token) {
      this.options.onError?.(new Error('未登录，无法建立协同连接'));
      return;
    }

    this.client?.disconnect();
    this.client = new CollabClient({
      docId: this.options.docId,
      token,
      url: this.options.wsUrl,
      onStateChange: (state) => this.options.onStateChange?.(state),
      onError: (err) => this.options.onError?.(err),
      onMessage: (msg) => this.handleMessage(msg),
    });
    this.client.connect();
  }

  disconnect(): void {
    this.client?.disconnect();
    this.client = null;
    this.onlineUsers = [];
  }

  sendOp(operation: CrdtOperation): void {
    if (!this.isOnline()) return;
    this.client?.sendOp(operation);
  }

  requestSync(): void {
    if (!this.isOnline()) return;
    this.client?.requestSync(this.globalVersion);
  }

  sendCursor(payload: Record<string, unknown>): void {
    if (!this.isOnline()) return;
    this.client?.sendCursor(payload);
  }

  sendSelection(payload: Record<string, unknown>): void {
    if (!this.isOnline()) return;
    this.client?.sendSelection(payload);
  }

  sendCellEditing(payload: CellEditingPayload): void {
    if (!this.isOnline()) return;
    this.client?.sendCellEditing(payload);
  }

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'connected':
        this.docVersion = message.docVersion;
        this.globalVersion = message.globalVersion;
        this.onlineUsers = message.onlineUsers;
        this.options.onPresenceChange?.(this.onlineUsers);
        this.options.onCellEditingChange?.(message.activeCellEditor ?? null);
        this.options.onConnected?.({
          docVersion: message.docVersion,
          globalVersion: message.globalVersion,
        });
        if (message.globalVersion > 0) {
          this.client?.requestSync(0);
        }
        break;
      case 'crdt_op':
        this.globalVersion = Math.max(this.globalVersion, message.globalVersion);
        this.options.onRemoteOp?.(message.operation, {
          globalVersion: message.globalVersion,
          senderId: message.senderId,
        });
        break;
      case 'sync_response':
        this.globalVersion = Math.max(this.globalVersion, message.currentVersion);
        for (const op of message.operations) {
          this.options.onRemoteOp?.(op, {
            globalVersion: message.currentVersion,
            senderId: 'sync',
          });
        }
        break;
      case 'user_joined':
        if (!this.onlineUsers.some((u) => u.userId === message.user.userId)) {
          this.onlineUsers = [...this.onlineUsers, message.user];
          this.options.onPresenceChange?.(this.onlineUsers);
        }
        break;
      case 'user_left':
        this.onlineUsers = this.onlineUsers.filter((u) => u.userId !== message.userId);
        this.options.onPresenceChange?.(this.onlineUsers);
        break;
      case 'cursor_update':
        this.options.onCursorUpdate?.(message.userId, message.payload);
        break;
      case 'selection_update':
        this.options.onSelectionUpdate?.(message.userId, message.payload);
        break;
      case 'cell_editing_update':
        this.options.onCellEditingChange?.(message.editor);
        break;
      case 'comment_update':
        this.options.onCommentUpdate?.(message.senderId, message.payload);
        break;
      case 'error':
        this.options.onError?.(new Error(`[${message.code}] ${message.message}`));
        break;
      default:
        break;
    }
  }
}
