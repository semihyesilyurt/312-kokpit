/**
 * Notification Gateway
 * WebSocket gateway for real-time notifications
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);
  private userSockets: Map<string, Set<string>> = new Map();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    // Remove client from all user rooms
    this.userSockets.forEach((sockets, userId) => {
      if (sockets.has(client.id)) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
    });
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() userId: string,
  ) {
    client.join(`user:${userId}`);

    // Track user sockets
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)?.add(client.id);

    this.logger.log(`Client ${client.id} subscribed to user: ${userId}`);
    return { event: 'subscribed', data: userId };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() userId: string,
  ) {
    client.leave(`user:${userId}`);
    this.userSockets.get(userId)?.delete(client.id);

    this.logger.log(`Client ${client.id} unsubscribed from user: ${userId}`);
    return { event: 'unsubscribed', data: userId };
  }

  sendToUser(userId: string, notification: unknown) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }

  sendToBranch(branchId: string, notification: unknown) {
    this.server.to(`branch:${branchId}`).emit('notification', notification);
  }

  broadcastToAll(notification: unknown) {
    this.server.emit('notification', notification);
  }

  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId) && this.userSockets.get(userId)!.size > 0;
  }

  getOnlineUsers(): string[] {
    return Array.from(this.userSockets.keys());
  }
}
