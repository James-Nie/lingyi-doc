import {
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { AuthService } from '../../services/auth.service';
import { CollabService } from './collab.service';
import { RoomManager } from './room.manager';
import {
  COLLAB_ERROR,
  type CollabClientContext,
  type ServerMessage,
} from './collab.types';

interface PendingSocket {
  ws: WebSocket;
  socketId: string;
  authTimer: ReturnType<typeof setTimeout>;
}

interface AuthedSocket extends WebSocket {
  collab?: CollabClientContext;
}

@WebSocketGateway({
  path: '/api/v1/collab/ws',
  cors: { origin: true },
})
export class CollabGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  private readonly logger = new Logger(CollabGateway.name);
  private readonly pending = new Map<WebSocket, PendingSocket>();
  private readonly authTimeoutMs = 10_000;
  private enabled = false;

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly config: ConfigService,
    private readonly authService: AuthService,
    private readonly collabService: CollabService,
    private readonly roomManager: RoomManager,
  ) {}

  onModuleInit(): void {
    this.enabled = this.config.get<boolean>('collab.enabled', false);
    if (this.enabled) {
      this.logger.log('Collaboration WebSocket enabled at /api/v1/collab/ws');
    } else {
      this.logger.log('Collaboration WebSocket disabled (FEATURE_COLLAB_ENABLED!=true)');
    }
  }

  handleConnection(client: AuthedSocket, ...args: unknown[]): void {
    if (!this.enabled) {
      this.send(client, { type: 'error', code: COLLAB_ERROR.DISABLED, message: '协同编辑未开启' });
      client.close();
      return;
    }

    const socketId = uuidv4();
    const req = args[0] as { url?: string } | undefined;
    const params = this.parseQuery(req?.url);

    const authTimer = setTimeout(() => {
      if (!client.collab) {
        this.send(client, { type: 'error', code: COLLAB_ERROR.UNAUTHORIZED, message: '认证超时' });
        client.close();
      }
    }, this.authTimeoutMs);

    this.pending.set(client, { ws: client, socketId, authTimer });

    if (params.docId && params.token) {
      void this.authenticate(client, socketId, params.docId, params.token, authTimer);
    }
  }

  handleDisconnect(client: AuthedSocket): void {
    const pending = this.pending.get(client);
    if (pending) {
      clearTimeout(pending.authTimer);
      this.pending.delete(client);
    }

    const ctx = client.collab;
    if (!ctx) return;

    const leftUserId = this.roomManager.leave(ctx.docId, ctx.socketId);
    void this.collabService.removePresence(ctx.docId, ctx.userId);
    void this.handleCellEditorRelease(ctx.docId, ctx.userId, ctx.socketId);

    if (leftUserId) {
      void this.collabService.broadcast(ctx.docId, { type: 'user_left', userId: leftUserId });
    }
  }

  @SubscribeMessage('auth')
  async onAuth(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { token: string; docId: string },
  ): Promise<void> {
    const pending = this.pending.get(client);
    if (!pending) return;
    await this.authenticate(client, pending.socketId, body.docId, body.token, pending.authTimer);
  }

  @SubscribeMessage('heartbeat')
  onHeartbeat(@ConnectedSocket() client: AuthedSocket): void {
    this.send(client, { type: 'heartbeat_ack', serverTime: Date.now() });
    const ctx = client.collab;
    if (!ctx) return;
    void this.collabService.touchPresence(
      ctx.docId,
      this.collabService.makeOnlineUser(ctx.userId, ctx.displayName, ctx.avatarUrl),
    );
  }

  @SubscribeMessage('sync_request')
  async onSyncRequest(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { fromVersion: number },
  ): Promise<void> {
    const ctx = client.collab;
    if (!ctx) return;

    const { operations, currentVersion } = await this.collabService.getOperationsSince(
      ctx.docId,
      body.fromVersion,
    );
    this.send(client, {
      type: 'sync_response',
      operations,
      currentVersion,
    });
  }

  @SubscribeMessage('crdt_op')
  async onCrdtOp(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { operation: import('./collab.types').CrdtOperation },
  ): Promise<void> {
    const ctx = client.collab;
    if (!ctx) return;

    if (!ctx.canWrite) {
      this.send(client, { type: 'error', code: COLLAB_ERROR.FORBIDDEN, message: '无编辑权限' });
      return;
    }

    try {
      const result = await this.collabService.handleOperation(
        ctx.docId,
        ctx.userId,
        body.operation,
      );

      if (result.duplicate) return;

      const message: ServerMessage = {
        type: 'crdt_op',
        operation: body.operation,
        globalVersion: result.globalVersion,
        senderId: ctx.userId,
      };

      await this.collabService.broadcast(ctx.docId, message, {
        excludeSocketId: ctx.socketId,
      });
    } catch (err) {
      const code = (err as { code?: number }).code ?? COLLAB_ERROR.OP_INVALID;
      this.send(client, {
        type: 'error',
        code,
        message: err instanceof Error ? err.message : '操作失败',
      });
    }
  }

  @SubscribeMessage('cursor_move')
  async onCursorMove(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { payload: Record<string, unknown> },
  ): Promise<void> {
    const ctx = client.collab;
    if (!ctx) return;

    await this.collabService.broadcast(ctx.docId, {
      type: 'cursor_update',
      userId: ctx.userId,
      payload: body.payload,
    }, { excludeSocketId: ctx.socketId });
  }

  @SubscribeMessage('selection_change')
  async onSelectionChange(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { payload: Record<string, unknown> },
  ): Promise<void> {
    const ctx = client.collab;
    if (!ctx) return;

    await this.collabService.broadcast(ctx.docId, {
      type: 'selection_update',
      userId: ctx.userId,
      payload: body.payload,
    }, { excludeSocketId: ctx.socketId });
  }

  @SubscribeMessage('cell_editing')
  async onCellEditing(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { action: 'start' | 'end'; sheetId: string; row: number; col: number },
  ): Promise<void> {
    const ctx = client.collab;
    if (!ctx) return;

    if (body.action === 'start') {
      const result = await this.collabService.tryAcquireCellEditor(ctx.docId, {
        userId: ctx.userId,
        displayName: ctx.displayName,
        sheetId: body.sheetId,
        row: body.row,
        col: body.col,
      });
      if (!result.ok) {
        this.send(client, {
          type: 'error',
          code: COLLAB_ERROR.CELL_EDIT_LOCKED,
          message: `${result.holder.displayName} 正在编辑`,
        });
        return;
      }
      await this.collabService.broadcast(ctx.docId, {
        type: 'cell_editing_update',
        editor: {
          userId: ctx.userId,
          displayName: ctx.displayName,
          sheetId: body.sheetId,
          row: body.row,
          col: body.col,
        },
      }, { excludeSocketId: ctx.socketId });
      return;
    }

    await this.handleCellEditorRelease(ctx.docId, ctx.userId, ctx.socketId);
  }

  private async handleCellEditorRelease(docId: string, userId: string, excludeSocketId?: string): Promise<void> {
    const released = await this.collabService.releaseCellEditor(docId, userId);
    if (released !== null) return;
    await this.collabService.broadcast(docId, {
      type: 'cell_editing_update',
      editor: null,
    }, { excludeSocketId });
  }

  private async authenticate(
    client: AuthedSocket,
    socketId: string,
    docId: string,
    token: string,
    authTimer: ReturnType<typeof setTimeout>,
  ): Promise<void> {
    if (client.collab) return;

    try {
      const payload = this.authService.verifyAccessToken(token, 'consumer');
      const authUser = {
        userId: payload.sub,
        email: payload.email,
        userType: payload.userType,
        audience: 'consumer' as const,
        currentIdentityType: payload.currentIdentityType ?? 'personal' as const,
        currentTenantId: payload.currentTenantId ?? null,
        tenantRole: payload.tenantRole ?? null,
      };

      const access = await this.collabService.checkDocAccess(docId, authUser);
      if (!access.canRead) {
        this.send(client, { type: 'error', code: COLLAB_ERROR.DOC_NOT_FOUND, message: '文档不存在或无权访问' });
        client.close();
        return;
      }

      const profile = await this.collabService.resolveUser(authUser);
      const color = this.collabService.makeOnlineUser(authUser.userId, profile.displayName, profile.avatarUrl).color;

      const ctx: CollabClientContext = {
        socketId,
        userId: authUser.userId,
        email: authUser.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        color,
        docId,
        canWrite: access.canWrite,
        identityType: authUser.currentIdentityType ?? 'personal',
        tenantId: authUser.currentTenantId ?? null,
      };

      try {
        this.roomManager.join(docId, socketId, client, ctx);
      } catch (err) {
        if (err instanceof Error && err.message === 'ROOM_FULL') {
          this.send(client, { type: 'error', code: COLLAB_ERROR.ROOM_FULL, message: '协同房间人数已满' });
          client.close();
          return;
        }
        throw err;
      }

      client.collab = ctx;
      clearTimeout(authTimer);
      this.pending.delete(client);

      const onlineUser = this.collabService.makeOnlineUser(ctx.userId, ctx.displayName, ctx.avatarUrl);
      await this.collabService.touchPresence(docId, onlineUser);
      const activeCellEditor = await this.collabService.getActiveCellEditor(docId);

      this.send(client, {
        type: 'connected',
        docVersion: access.docVersion,
        globalVersion: access.globalVersion,
        onlineUsers: this.roomManager.listOnlineUsers(docId),
        activeCellEditor,
      });

      await this.collabService.broadcast(docId, { type: 'user_joined', user: onlineUser }, {
        excludeSocketId: socketId,
      });
    } catch {
      this.send(client, { type: 'error', code: COLLAB_ERROR.UNAUTHORIZED, message: 'Token 无效或已过期' });
      client.close();
    }
  }

  private send(client: WebSocket, message: ServerMessage): void {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }

  private parseQuery(url?: string): { docId?: string; token?: string } {
    if (!url) return {};
    const queryIndex = url.indexOf('?');
    if (queryIndex < 0) return {};
    const params = new URLSearchParams(url.slice(queryIndex + 1));
    return {
      docId: params.get('docId') ?? undefined,
      token: params.get('token') ?? undefined,
    };
  }
}
