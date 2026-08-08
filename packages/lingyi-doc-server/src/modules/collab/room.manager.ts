import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WebSocket } from 'ws';
import type { CollabClientContext, OnlineUser, ServerMessage } from './collab.types';

interface RoomClient {
  ws: WebSocket;
  ctx: CollabClientContext;
}

@Injectable()
export class RoomManager {
  private readonly logger = new Logger(RoomManager.name);
  private readonly rooms = new Map<string, Map<string, RoomClient>>();
  private readonly maxUsers: number;

  constructor(config: ConfigService) {
    this.maxUsers = config.get<number>('collab.roomMaxUsers', 50);
  }

  getStats(): { rooms: number; connections: number } {
    let connections = 0;
    for (const room of this.rooms.values()) {
      connections += room.size;
    }
    return { rooms: this.rooms.size, connections };
  }

  join(docId: string, socketId: string, ws: WebSocket, ctx: CollabClientContext): OnlineUser[] {
    let room = this.rooms.get(docId);
    if (!room) {
      room = new Map();
      this.rooms.set(docId, room);
    }

    if (room.size >= this.maxUsers && !room.has(socketId)) {
      throw new Error('ROOM_FULL');
    }

    const user: OnlineUser = {
      userId: ctx.userId,
      displayName: ctx.displayName,
      avatarUrl: ctx.avatarUrl,
      color: ctx.color,
      joinedAt: Date.now(),
    };

    room.set(socketId, { ws, ctx });
    return this.listOnlineUsers(docId);
  }

  leave(docId: string, socketId: string): string | null {
    const room = this.rooms.get(docId);
    if (!room) return null;
    const client = room.get(socketId);
    room.delete(socketId);
    if (room.size === 0) {
      this.rooms.delete(docId);
    }
    return client?.ctx.userId ?? null;
  }

  getClient(docId: string, socketId: string): RoomClient | null {
    return this.rooms.get(docId)?.get(socketId) ?? null;
  }

  listOnlineUsers(docId: string): OnlineUser[] {
    const room = this.rooms.get(docId);
    if (!room) return [];
    const seen = new Set<string>();
    const users: OnlineUser[] = [];
    for (const { ctx } of room.values()) {
      if (seen.has(ctx.userId)) continue;
      seen.add(ctx.userId);
      users.push({
        userId: ctx.userId,
        displayName: ctx.displayName,
        avatarUrl: ctx.avatarUrl,
        color: ctx.color,
        joinedAt: Date.now(),
      });
    }
    return users;
  }

  broadcast(
    docId: string,
    message: ServerMessage,
    options?: { excludeSocketId?: string; excludeUserId?: string },
  ): void {
    const room = this.rooms.get(docId);
    if (!room) return;

    const payload = JSON.stringify(message);
    for (const [socketId, client] of room.entries()) {
      if (options?.excludeSocketId && socketId === options.excludeSocketId) continue;
      if (options?.excludeUserId && client.ctx.userId === options.excludeUserId) continue;
      if (client.ws.readyState === client.ws.OPEN) {
        try {
          client.ws.send(payload);
        } catch (err) {
          this.logger.warn(`broadcast failed socket=${socketId}`, err);
        }
      }
    }
  }
}
