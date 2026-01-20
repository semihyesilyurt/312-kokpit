/**
 * Order Gateway
 * WebSocket gateway for real-time order updates
 *
 * Events emitted:
 * - newOrder: When a new order is created
 * - orderStatusChanged: When order status changes
 * - orderCourierAssigned: When a courier is assigned to an order
 * - orderUpdated: General order updates
 *
 * Room structure:
 * - branch:{branchId} - Subscribe to orders for a specific branch
 * - order:{orderId} - Subscribe to updates for a specific order
 * - courier:{courierId} - Subscribe to orders assigned to a courier
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * Event payload interfaces
 */
interface OrderEventPayload {
  id: number;
  orderNumber: string;
  status: string;
  platform: string;
  customerName: string;
  totalAmount: number | string;
  branchId: number;
  items?: Array<{
    productName: string;
    quantity: number;
  }>;
  [key: string]: unknown;
}

interface StatusChangedPayload {
  orderId: number;
  status: string;
  previousStatus: string;
  timestamp: string;
  orderNumber?: string;
}

interface CourierAssignedPayload {
  orderId: number;
  courier: {
    id: number;
    name: string;
  };
  timestamp: string;
  orderNumber?: string;
}

@WebSocketGateway({
  namespace: '/orders',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class OrderGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(OrderGateway.name);
  private connectedClients: Map<string, { userId?: string; branchId?: string }> =
    new Map();

  constructor(private readonly jwtService: JwtService) {}

  /**
   * Initialize gateway
   */
  afterInit(server: Server) {
    this.logger.log('Order WebSocket Gateway initialized');
  }

  /**
   * Handle client connection
   */
  async handleConnection(client: Socket) {
    try {
      // Extract token from handshake
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (token) {
        try {
          const payload = this.jwtService.verify(token);
          this.connectedClients.set(client.id, {
            userId: payload.sub,
            branchId: payload.branchId,
          });

          // Auto-join branch room if user has branch
          if (payload.branchId) {
            client.join(`branch:${payload.branchId}`);
            this.logger.debug(
              `Client ${client.id} auto-joined branch:${payload.branchId}`,
            );
          }

          this.logger.log(
            `Client connected: ${client.id} (user: ${payload.sub})`,
          );
        } catch (err) {
          this.logger.warn(`Invalid token for client ${client.id}`);
          this.connectedClients.set(client.id, {});
        }
      } else {
        this.connectedClients.set(client.id, {});
        this.logger.log(`Anonymous client connected: ${client.id}`);
      }
    } catch (error) {
      this.logger.error(`Connection error for client ${client.id}:`, error);
    }
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(client: Socket) {
    const clientInfo = this.connectedClients.get(client.id);
    this.connectedClients.delete(client.id);
    this.logger.log(
      `Client disconnected: ${client.id} (user: ${clientInfo?.userId || 'anonymous'})`,
    );
  }

  /**
   * Join branch room to receive orders for that branch
   */
  @SubscribeMessage('join-branch')
  handleJoinBranch(
    @ConnectedSocket() client: Socket,
    @MessageBody() branchId: string | number,
  ) {
    const roomName = `branch:${branchId}`;
    client.join(roomName);

    const clientInfo = this.connectedClients.get(client.id);
    if (clientInfo) {
      clientInfo.branchId = String(branchId);
    }

    this.logger.debug(`Client ${client.id} joined ${roomName}`);

    return {
      event: 'joined',
      data: { room: roomName, branchId },
    };
  }

  /**
   * Leave branch room
   */
  @SubscribeMessage('leave-branch')
  handleLeaveBranch(
    @ConnectedSocket() client: Socket,
    @MessageBody() branchId: string | number,
  ) {
    const roomName = `branch:${branchId}`;
    client.leave(roomName);

    this.logger.debug(`Client ${client.id} left ${roomName}`);

    return {
      event: 'left',
      data: { room: roomName, branchId },
    };
  }

  /**
   * Join specific order room to receive updates for that order
   */
  @SubscribeMessage('join-order')
  handleJoinOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() orderId: string | number,
  ) {
    const roomName = `order:${orderId}`;
    client.join(roomName);

    this.logger.debug(`Client ${client.id} joined ${roomName}`);

    return {
      event: 'joined',
      data: { room: roomName, orderId },
    };
  }

  /**
   * Leave specific order room
   */
  @SubscribeMessage('leave-order')
  handleLeaveOrder(
    @ConnectedSocket() client: Socket,
    @MessageBody() orderId: string | number,
  ) {
    const roomName = `order:${orderId}`;
    client.leave(roomName);

    this.logger.debug(`Client ${client.id} left ${roomName}`);

    return {
      event: 'left',
      data: { room: roomName, orderId },
    };
  }

  /**
   * Join courier room to receive order assignments
   */
  @SubscribeMessage('join-courier')
  handleJoinCourier(
    @ConnectedSocket() client: Socket,
    @MessageBody() courierId: string | number,
  ) {
    const roomName = `courier:${courierId}`;
    client.join(roomName);

    this.logger.debug(`Client ${client.id} joined ${roomName}`);

    return {
      event: 'joined',
      data: { room: roomName, courierId },
    };
  }

  /**
   * Leave courier room
   */
  @SubscribeMessage('leave-courier')
  handleLeaveCourier(
    @ConnectedSocket() client: Socket,
    @MessageBody() courierId: string | number,
  ) {
    const roomName = `courier:${courierId}`;
    client.leave(roomName);

    this.logger.debug(`Client ${client.id} left ${roomName}`);

    return {
      event: 'left',
      data: { room: roomName, courierId },
    };
  }

  /**
   * Ping handler for connection health check
   */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    return {
      event: 'pong',
      data: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * Get list of connected clients (for debugging/monitoring)
   */
  @SubscribeMessage('get-connected-count')
  handleGetConnectedCount(@ConnectedSocket() client: Socket) {
    return {
      event: 'connected-count',
      data: {
        total: this.connectedClients.size,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ===================================================================
  // Server-side emit methods (called from OrderService)
  // ===================================================================

  /**
   * Emit new order event to branch room
   */
  emitNewOrder(branchId: string, order: OrderEventPayload) {
    const payload = {
      ...order,
      timestamp: new Date().toISOString(),
    };

    // Emit to branch room
    this.server.to(`branch:${branchId}`).emit('newOrder', payload);

    // Also emit to global room for dashboards
    this.server.emit('order:new', payload);

    this.logger.debug(
      `Emitted newOrder event for branch ${branchId}: Order #${order.orderNumber}`,
    );
  }

  /**
   * Emit order status changed event
   */
  emitOrderStatusChanged(
    branchId: string,
    orderId: number,
    status: string,
    previousStatus: string,
  ) {
    const payload: StatusChangedPayload = {
      orderId,
      status,
      previousStatus,
      timestamp: new Date().toISOString(),
    };

    // Emit to branch room
    this.server.to(`branch:${branchId}`).emit('orderStatusChanged', payload);

    // Emit to order-specific room
    this.server.to(`order:${orderId}`).emit('orderStatusChanged', payload);

    this.logger.debug(
      `Emitted orderStatusChanged event: Order #${orderId} ${previousStatus} -> ${status}`,
    );
  }

  /**
   * Emit courier assigned event
   */
  emitOrderCourierAssigned(
    branchId: string,
    orderId: number,
    courier: { id: number; name: string },
  ) {
    const payload: CourierAssignedPayload = {
      orderId,
      courier,
      timestamp: new Date().toISOString(),
    };

    // Emit to branch room
    this.server.to(`branch:${branchId}`).emit('orderCourierAssigned', payload);

    // Emit to order-specific room
    this.server.to(`order:${orderId}`).emit('orderCourierAssigned', payload);

    // Emit to courier room
    this.server.to(`courier:${courier.id}`).emit('orderAssigned', {
      orderId,
      timestamp: payload.timestamp,
    });

    this.logger.debug(
      `Emitted orderCourierAssigned event: Order #${orderId} -> Courier ${courier.name}`,
    );
  }

  /**
   * Emit general order updated event
   */
  emitOrderUpdated(branchId: string, order: OrderEventPayload) {
    const payload = {
      ...order,
      timestamp: new Date().toISOString(),
    };

    // Emit to branch room
    this.server.to(`branch:${branchId}`).emit('orderUpdated', payload);

    // Emit to order-specific room
    this.server.to(`order:${order.id}`).emit('orderUpdated', payload);

    this.logger.debug(
      `Emitted orderUpdated event for branch ${branchId}: Order #${order.orderNumber}`,
    );
  }

  /**
   * Emit order cancelled event
   */
  emitOrderCancelled(branchId: string, orderId: number, reason?: string) {
    const payload = {
      orderId,
      reason,
      timestamp: new Date().toISOString(),
    };

    // Emit to branch room
    this.server.to(`branch:${branchId}`).emit('orderCancelled', payload);

    // Emit to order-specific room
    this.server.to(`order:${orderId}`).emit('orderCancelled', payload);

    this.logger.debug(`Emitted orderCancelled event: Order #${orderId}`);
  }

  /**
   * Emit to specific user (for notifications)
   */
  emitToUser(userId: string, event: string, data: unknown) {
    // Find all sockets for this user
    for (const [clientId, clientInfo] of this.connectedClients) {
      if (clientInfo.userId === userId) {
        this.server.to(clientId).emit(event, data);
      }
    }
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(event: string, data: unknown) {
    this.server.emit(event, data);
  }

  /**
   * Get connected client count for a branch
   */
  getConnectedClientsForBranch(branchId: string): number {
    const room = this.server.sockets.adapter.rooms.get(`branch:${branchId}`);
    return room?.size || 0;
  }
}
