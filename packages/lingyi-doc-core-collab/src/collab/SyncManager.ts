import type { CrdtOperation } from './index';
import { CollabClient, type CollabConnectionState, type OnlineUser, type ServerMessage } from './CollabClient';
import type { ActiveCellEditor, CellEditingPayload } from './cellEditing';
import { normalizeCellEditors } from './blockEditing';

/**
 * 同步管理器选项
 */
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

/**
 * 同步管理器类
 */
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

  /** 获取全局版本号 */
  getGlobalVersion(): number {
    return this.globalVersion;
  }

  /** 获取文档版本号 */
  getDocVersion(): number {
    return this.docVersion;
  }

  /** 获取当前在线用户 */
  getOnlineUsers(): OnlineUser[] {
    return this.onlineUsers;
  }

  /** 是否已成功连过 */
  get hasConnected(): boolean {
    return this.hasConnectedBefore;
  }

  /** 是否已连接 */
  isOnline(): boolean {
    return this.client?.getState() === 'connected';
  }

  /** 连接协同编辑 */
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

  /** 断开协同编辑 */
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

  /** 发送单个操作 */
  sendOp(operation: CrdtOperation): void {
    if (!this.isOnline()) return;
    this.client?.sendOp(operation);
  }

  /** 批量发送；使用批量消息减少 WebSocket 报文数量和服务端写入次数 */
  async sendOps(operations: CrdtOperation[]): Promise<void> {
    if (operations.length === 0 || !this.isOnline()) return;
    this.client?.sendOps(operations);
  }

  /** 请求同步 */
  requestSync(): void {
    if (!this.isOnline()) return;
    this.client?.requestSync(this.globalVersion);
  }

  /** 发送光标位置 */
  sendCursor(payload: Record<string, unknown>): void {
    if (!this.isOnline()) return;
    this.client?.sendCursor(payload);
  }

  /** 发送选择位置 */
  sendSelection(payload: Record<string, unknown>): void {
    if (!this.isOnline()) return;
    this.client?.sendSelection(payload);
  }

  /** 发送单元格编辑锁 */
  sendCellEditing(payload: CellEditingPayload): void {
    // 认证完成后即可发送；勿仅依赖 isOnline（与 ws open 时序可能短暂不一致）
    this.client?.sendCellEditing(payload);
  }

  /** 处理服务器消息 */
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
      /** 处理 CRDT 操作 */
      case 'crdt_op':
        this.globalVersion = Math.max(this.globalVersion, message.globalVersion);
        this.options.onRemoteOp?.(message.operation, {
          globalVersion: message.globalVersion,
          senderId: message.senderId,
        });
        break;
      /** 处理同步响应 */
      case 'sync_response':
        this.globalVersion = Math.max(this.globalVersion, message.currentVersion);
        for (const op of message.operations) {
          this.options.onRemoteOp?.(op, {
            globalVersion: message.currentVersion,
            senderId: 'sync',
          });
        }
        break;
      /** 处理用户加入 */
      case 'user_joined':
        if (!this.onlineUsers.some((u) => u.userId === message.user.userId)) {
          this.onlineUsers = [...this.onlineUsers, message.user];
          this.options.onPresenceChange?.(this.onlineUsers);
        }
        break;
      /** 处理用户离开 */
      case 'user_left':
        this.onlineUsers = this.onlineUsers.filter((u) => u.userId !== message.userId);
        this.options.onPresenceChange?.(this.onlineUsers);
        break;
      /** 处理光标位置更新 */
      case 'cursor_update':
        this.options.onCursorUpdate?.(message.userId, message.payload);
        break;
      /** 处理选择位置更新 */
      case 'selection_update':
        this.options.onSelectionUpdate?.(message.userId, message.payload);
        break;
      /** 处理单元格编辑锁更新 */
      case 'cell_editing_update':
        this.options.onCellEditingChange?.(
          normalizeCellEditors(message.editors, message.editor),
        );
        break;
      /** 处理评论更新 */
      case 'comment_update':
        this.options.onCommentUpdate?.(message.senderId, message.payload);
        break;
      /** 处理错误 */
      case 'error':
        this.options.onError?.(new Error(`[${message.code}] ${message.message}`));
        break;
      default:
        break;
    }
  }
}
