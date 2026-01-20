/**
 * Delivery Gateway
 * WebSocket gateway for real-time delivery tracking and courier status updates
 * Events: courierLocation, deliveryCompleted, courierStatusChanged
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

interface CourierLocationPayload {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  orderId?: string;
}

interface DeliveryCompletedPayload {
  courierId: number;
  courierName?: string;
  deliveryDuration: number;
  customerName?: string;
  totalAmount: number;
  paymentMethod: string;
}

@WebSocketGateway({
  namespace: '/delivery',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class DeliveryGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(DeliveryGateway.name);

  // Track connected couriers for status monitoring
  private courierSockets: Map<number, Set<string>> = new Map();
  private branchSockets: Map<string, Set<string>> = new Map();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Remove client from courier tracking
    this.courierSockets.forEach((sockets, courierId) => {
      if (sockets.has(client.id)) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.courierSockets.delete(courierId);
          this.logger.log(`Courier ${courierId} fully disconnected`);
        }
      }
    });

    // Remove client from branch tracking
    this.branchSockets.forEach((sockets, branchId) => {
      if (sockets.has(client.id)) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.branchSockets.delete(branchId);
        }
      }
    });
  }

  // ============================================================================
  // SUBSCRIPTION HANDLERS
  // ============================================================================

  @SubscribeMessage('join-branch')
  handleJoinBranch(
    @ConnectedSocket() client: Socket,
    @MessageBody() branchId: string,
  ) {
    client.join(`branch:${branchId}`);

    // Track branch subscribers
    if (!this.branchSockets.has(branchId)) {
      this.branchSockets.set(branchId, new Set());
    }
    this.branchSockets.get(branchId)?.add(client.id);

    this.logger.log(`Client ${client.id} joined branch: ${branchId}`);
    return { event: 'joined-branch', data: branchId };
  }

  @SubscribeMessage('leave-branch')
  handleLeaveBranch(
    @ConnectedSocket() client: Socket,
    @MessageBody() branchId: string,
  ) {
    client.leave(`branch:${branchId}`);
    this.branchSockets.get(branchId)?.delete(client.id);

    this.logger.log(`Client ${client.id} left branch: ${branchId}`);
    return { event: 'left-branch', data: branchId };
  }

  @SubscribeMessage('track-delivery')
  handleTrackDelivery(
    @ConnectedSocket() client: Socket,
    @MessageBody() deliveryId: string,
  ) {
    client.join(`delivery:${deliveryId}`);
    this.logger.log(`Client ${client.id} tracking delivery: ${deliveryId}`);
    return { event: 'tracking', data: deliveryId };
  }

  @SubscribeMessage('stop-tracking')
  handleStopTracking(
    @ConnectedSocket() client: Socket,
    @MessageBody() deliveryId: string,
  ) {
    client.leave(`delivery:${deliveryId}`);
    this.logger.log(`Client ${client.id} stopped tracking delivery: ${deliveryId}`);
    return { event: 'stopped-tracking', data: deliveryId };
  }

  @SubscribeMessage('track-courier')
  handleTrackCourier(
    @ConnectedSocket() client: Socket,
    @MessageBody() courierId: number,
  ) {
    client.join(`courier:${courierId}`);
    this.logger.log(`Client ${client.id} tracking courier: ${courierId}`);
    return { event: 'tracking-courier', data: courierId };
  }

  @SubscribeMessage('stop-tracking-courier')
  handleStopTrackingCourier(
    @ConnectedSocket() client: Socket,
    @MessageBody() courierId: number,
  ) {
    client.leave(`courier:${courierId}`);
    this.logger.log(`Client ${client.id} stopped tracking courier: ${courierId}`);
    return { event: 'stopped-tracking-courier', data: courierId };
  }

  @SubscribeMessage('courier-connect')
  handleCourierConnect(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { courierId: number; branchId: string },
  ) {
    const { courierId, branchId } = data;

    // Join courier-specific room
    client.join(`courier:${courierId}`);
    client.join(`branch:${branchId}`);

    // Track courier socket
    if (!this.courierSockets.has(courierId)) {
      this.courierSockets.set(courierId, new Set());
    }
    this.courierSockets.get(courierId)?.add(client.id);

    this.logger.log(
      `Courier ${courierId} connected from client ${client.id}, branch: ${branchId}`,
    );

    return {
      event: 'courier-connected',
      data: { courierId, branchId, socketId: client.id },
    };
  }

  @SubscribeMessage('courier-disconnect')
  handleCourierDisconnect(
    @ConnectedSocket() client: Socket,
    @MessageBody() courierId: number,
  ) {
    client.leave(`courier:${courierId}`);
    this.courierSockets.get(courierId)?.delete(client.id);

    if (this.courierSockets.get(courierId)?.size === 0) {
      this.courierSockets.delete(courierId);
    }

    this.logger.log(`Courier ${courierId} disconnected from client ${client.id}`);
    return { event: 'courier-disconnected', data: courierId };
  }

  // ============================================================================
  // EMIT METHODS - Called from DeliveryService
  // ============================================================================

  /**
   * Emit courier location update
   * Event: courierLocation
   */
  emitCourierLocation(
    branchId: string,
    courierId: number,
    location: CourierLocationPayload,
  ) {
    const payload = {
      courierId,
      ...location,
      timestamp: new Date().toISOString(),
    };

    // Emit to branch room (for dashboard)
    this.server.to(`branch:${branchId}`).emit('courierLocation', payload);

    // Emit to courier-specific room (for order tracking)
    this.server.to(`courier:${courierId}`).emit('courierLocation', payload);

    // If tracking specific order, emit to that room too
    if (location.orderId) {
      this.server.to(`delivery:${location.orderId}`).emit('courierLocation', payload);
    }

    this.logger.debug(
      `Location update for courier ${courierId}: ${location.latitude}, ${location.longitude}`,
    );
  }

  /**
   * Emit delivery completed event
   * Event: deliveryCompleted
   */
  emitDeliveryCompleted(
    branchId: string,
    orderId: number,
    details: DeliveryCompletedPayload,
  ) {
    const payload = {
      orderId,
      ...details,
      completedAt: new Date().toISOString(),
    };

    // Emit to branch room
    this.server.to(`branch:${branchId}`).emit('deliveryCompleted', payload);

    // Emit to delivery tracking room
    this.server.to(`delivery:${orderId}`).emit('deliveryCompleted', payload);

    // Emit to courier room
    this.server.to(`courier:${details.courierId}`).emit('deliveryCompleted', payload);

    this.logger.log(
      `Delivery completed event emitted: Order ${orderId} by courier ${details.courierId}`,
    );
  }

  /**
   * Emit courier status change event
   * Event: courierStatusChanged
   */
  emitCourierStatusChanged(
    branchId: string,
    courierId: number,
    newStatus: string,
    previousStatus?: string,
  ) {
    const payload = {
      courierId,
      newStatus,
      previousStatus,
      timestamp: new Date().toISOString(),
    };

    // Emit to branch room
    this.server.to(`branch:${branchId}`).emit('courierStatusChanged', payload);

    // Emit to courier-specific room
    this.server.to(`courier:${courierId}`).emit('courierStatusChanged', payload);

    this.logger.log(
      `Courier status changed: ${courierId} ${previousStatus || 'unknown'} -> ${newStatus}`,
    );
  }

  /**
   * Emit delivery assigned event (existing, preserved)
   */
  emitDeliveryAssigned(branchId: string, delivery: unknown) {
    this.server.to(`branch:${branchId}`).emit('delivery:assigned', delivery);
    this.logger.log(`Delivery assigned event emitted to branch ${branchId}`);
  }

  /**
   * Emit delivery status changed event (existing, preserved)
   */
  emitDeliveryStatusChanged(branchId: string, deliveryId: string, status: string) {
    const payload = {
      deliveryId,
      status,
      timestamp: new Date().toISOString(),
    };

    this.server.to(`branch:${branchId}`).emit('delivery:status-changed', payload);
    this.server.to(`delivery:${deliveryId}`).emit('delivery:status-changed', payload);

    this.logger.log(
      `Delivery status changed event: ${deliveryId} -> ${status}`,
    );
  }

  /**
   * Emit location update (existing, preserved for backward compatibility)
   */
  emitLocationUpdate(
    branchId: string,
    deliveryId: string,
    location: { latitude: number; longitude: number },
  ) {
    const payload = {
      deliveryId,
      ...location,
      timestamp: new Date().toISOString(),
    };

    this.server.to(`branch:${branchId}`).emit('delivery:location', payload);
    this.server.to(`delivery:${deliveryId}`).emit('delivery:location', payload);
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Check if a courier is currently connected
   */
  isCourierOnline(courierId: number): boolean {
    return (
      this.courierSockets.has(courierId) &&
      this.courierSockets.get(courierId)!.size > 0
    );
  }

  /**
   * Get list of online couriers
   */
  getOnlineCouriers(): number[] {
    return Array.from(this.courierSockets.keys()).filter((id) =>
      this.isCourierOnline(id),
    );
  }

  /**
   * Get number of clients tracking a branch
   */
  getBranchSubscriberCount(branchId: string): number {
    return this.branchSockets.get(branchId)?.size || 0;
  }

  /**
   * Broadcast to all connected clients
   */
  broadcastToAll(event: string, payload: unknown) {
    this.server.emit(event, payload);
  }

  /**
   * Send direct message to specific courier
   */
  sendToCourier(courierId: number, event: string, payload: unknown) {
    this.server.to(`courier:${courierId}`).emit(event, payload);
  }

  /**
   * Send message to all couriers in a branch
   */
  sendToBranchCouriers(branchId: string, event: string, payload: unknown) {
    this.server.to(`branch:${branchId}`).emit(event, payload);
  }
}
