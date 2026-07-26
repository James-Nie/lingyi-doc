import type { CrdtOperation } from './index';
import { CollabClient, type CollabConnectionState, type OnlineUser, type ServerMessage } from './CollabClient';
import type { ActiveCellEditor, CellEditingPayload } from './cellEditing';
import { normalizeCellEditors } from './blockEditing';

export interface SyncManagerOptions {
  docId: string;
  getToken: () => string | null;
  wsUrl?: string;
  onRemoteOp?: (op: CrdtOperation, meta: { globalVersion: number; senderId: string }) => void;
  onPresenceChange?: (users: OnlineUser[]) => void;
  /** 当前文档内所有区域编辑锁（可多人不同区域） */
  onCellEditingChange?: (editors: ActiveCellEditor[]) => void;
  onCursorUpdate?: (userId: string, payload: Record<string, unknown>) => void;
  onSelectionUpdate?: (userId: string, payload: Record<string, unknown>) => void;
  onCommentUpdate?: (senderId: string, payload: import('@lingyi-doc/core-doc').CommentUpdatePayload) => void;
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
  /** 是否已成功连过（用于区分冷启动与断线重连） */
  private hasConnectedBefore = false;

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
      getToken: this.options.getToken,
      url: this.options.wsUrl,
      autoReconnect: true,
      onStateChange: (state) => {
        if (state === 'reconnecting' || state === 'offline') {
          this.onlineUsers = [];
          this.options.onPresenceChange?.([]);
          this.options.onCellEditingChange?.([]);
        }
        this.options.onStateChange?.(state);
      },
      onError: (err) => this.options.onError?.(err),
      onMessage: (msg) => this.handleMessage(msg),
    });
    this.client.connect();
  }

  disconnect(): void {
    this.client?.disconnect();
    this.client = null;
    this.onlineUsers = [];
    this.options.onPresenceChange?.([]);
    this.options.onCellEditingChange?.([]);
    // 保留 hasConnectedBefore / globalVersion，便于同会话重连时增量补齐
  }

  /** 页面卸载或切换文档时重置，下次连接视为冷启动 */
  resetSyncCursor(): void {
    this.hasConnectedBefore = false;
    this.globalVersion = 0;
    this.docVersion = 0;
  }

  sendOp(operation: CrdtOperation): void {
    if (!this.isOnline()) return;
    this.client?.sendOp(operation);
  }

  /** 批量发送；使用批量消息减少 WebSocket 报文数量和服务端写入次数 */
  async sendOps(operations: CrdtOperation[]): Promise<void> {
    if (operations.length === 0 || !this.isOnline()) return;
    this.client?.sendOps(operations);
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
    // 认证完成后即可发送；勿仅依赖 isOnline（与 ws open 时序可能短暂不一致）
    this.client?.sendCellEditing(payload);
  }

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'connected': {
        const prevGlobalVersion = this.globalVersion;
        this.docVersion = message.docVersion;
        this.globalVersion = message.globalVersion;
        this.onlineUsers = message.onlineUsers;
        this.options.onPresenceChange?.(this.onlineUsers);
        this.options.onCellEditingChange?.(
          normalizeCellEditors(message.activeCellEditors, message.activeCellEditor),
        );
        this.options.onConnected?.({
          docVersion: message.docVersion,
          globalVersion: message.globalVersion,
        });
        // 冷启动：客户端已用 HTTP 文档快照 hydrate，禁止 requestSync(0)。
        // 否则会把 CRDT oplog 里旧的 set_cell 全量打回内存，覆盖刚加载的已保存内容。
        // 断线重连：从上次已应用版本增量补齐离线期间的 ops。
        if (this.hasConnectedBefore && prevGlobalVersion < message.globalVersion) {
          this.client?.requestSync(prevGlobalVersion);
        }
        this.hasConnectedBefore = true;
        break;
      }
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
        this.options.onCellEditingChange?.(
          normalizeCellEditors(message.editors, message.editor),
        );
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
