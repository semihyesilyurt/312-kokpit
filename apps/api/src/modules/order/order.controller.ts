/**
 * Order Controller
 * Comprehensive order management endpoints including:
 * - GET /orders - List all orders with filtering
 * - GET /orders/active - Get active orders
 * - GET /orders/stats - Get order statistics
 * - GET /orders/:id - Get single order
 * - POST /orders - Create new order
 * - PATCH /orders/:id/status - Update order status
 * - POST /orders/:id/assign - Assign courier to order
 * - POST /orders/:id/cancel - Cancel order
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { OrderService } from './order.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '@common/decorators/current-user.decorator';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  UpdateOrderStatusDto,
  CancelOrderDto,
  AssignCourierDto,
} from './dto/update-status.dto';
import {
  OrderQueryDto,
  ActiveOrdersQueryDto,
  OrderStatsQueryDto,
} from './dto/order-query.dto';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  /**
   * GET /orders
   * Get all orders with filtering and pagination
   */
  @Get()
  @ApiOperation({
    summary: 'Get all orders',
    description: 'Retrieve orders with filtering, pagination, and sorting options',
  })
  @ApiResponse({
    status: 200,
    description: 'Orders retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { type: 'object' },
        },
        meta: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            page: { type: 'number' },
            pageSize: { type: 'number' },
            totalPages: { type: 'number' },
            hasNext: { type: 'boolean' },
            hasPrev: { type: 'boolean' },
          },
        },
      },
    },
  })
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Query() queryDto: OrderQueryDto,
  ) {
    // If user has branch restriction, enforce it
    if (user.branchId && !queryDto.branchId) {
      queryDto.branchId = Number(user.branchId);
    }

    return this.orderService.findAll(queryDto);
  }

  /**
   * GET /orders/active
   * Get active orders (not delivered or cancelled)
   */
  @Get('active')
  @ApiOperation({
    summary: 'Get active orders',
    description: 'Retrieve orders currently being processed (pending through on_delivery)',
  })
  @ApiResponse({
    status: 200,
    description: 'Active orders retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        orders: { type: 'array', items: { type: 'object' } },
        grouped: {
          type: 'object',
          properties: {
            pending: { type: 'array' },
            confirmed: { type: 'array' },
            preparing: { type: 'array' },
            ready: { type: 'array' },
            onDelivery: { type: 'array' },
          },
        },
        total: { type: 'number' },
      },
    },
  })
  async getActiveOrders(
    @CurrentUser() user: CurrentUserData,
    @Query() queryDto: ActiveOrdersQueryDto,
  ) {
    // If user has branch restriction, enforce it
    if (user.branchId && !queryDto.branchId) {
      queryDto.branchId = Number(user.branchId);
    }

    return this.orderService.getActiveOrders(queryDto);
  }

  /**
   * GET /orders/stats
   * Get order statistics
   */
  @Get('stats')
  @ApiOperation({
    summary: 'Get order statistics',
    description: 'Retrieve order statistics including totals, revenue, and breakdowns',
  })
  @ApiResponse({
    status: 200,
    description: 'Order statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        period: {
          type: 'object',
          properties: {
            start: { type: 'string' },
            end: { type: 'string' },
          },
        },
        orders: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            completed: { type: 'number' },
            cancelled: { type: 'number' },
            pending: { type: 'number' },
            completionRate: { type: 'string' },
            cancellationRate: { type: 'string' },
          },
        },
        revenue: {
          type: 'object',
          properties: {
            gross: { type: 'number' },
            net: { type: 'number' },
            commission: { type: 'number' },
            discounts: { type: 'number' },
            averageOrderValue: { type: 'string' },
          },
        },
        delivery: {
          type: 'object',
          properties: {
            averageDeliveryTime: { type: 'number', nullable: true },
          },
        },
        byPlatform: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              platform: { type: 'string' },
              count: { type: 'number' },
              revenue: { type: 'number' },
            },
          },
        },
        byStatus: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              count: { type: 'number' },
            },
          },
        },
      },
    },
  })
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  async getStats(
    @CurrentUser() user: CurrentUserData,
    @Query() queryDto: OrderStatsQueryDto,
  ) {
    // If user has branch restriction, enforce it
    if (user.branchId && !queryDto.branchId) {
      queryDto.branchId = Number(user.branchId);
    }

    return this.orderService.getStats(queryDto);
  }

  /**
   * GET /orders/:id
   * Get single order by ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get order by ID',
    description: 'Retrieve a single order with full details including items, customer, and status history',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'Order ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Order retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.orderService.findOne(id);
  }

  /**
   * POST /orders
   * Create a new order
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new order',
    description: 'Create a new order with customer info, items, and payment details. Automatically deducts stock based on product recipes.',
  })
  @ApiResponse({
    status: 201,
    description: 'Order created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid order data',
  })
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER', 'CASHIER')
  async create(
    @CurrentUser() user: CurrentUserData,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    // If user has branch restriction, use their branch
    if (user.branchId && !createOrderDto.branchId) {
      createOrderDto.branchId = Number(user.branchId);
    }

    return this.orderService.create(createOrderDto, parseInt(user.id, 10));
  }

  /**
   * PATCH /orders/:id/status
   * Update order status
   */
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update order status',
    description: 'Update the status of an order. Validates status transitions according to the allowed flow.',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'Order ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Order status updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid status transition',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateStatusDto: UpdateOrderStatusDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.orderService.updateStatus(
      id,
      updateStatusDto,
      parseInt(user.id, 10),
    );
  }

  /**
   * POST /orders/:id/assign
   * Assign courier to order
   */
  @Post(':id/assign')
  @ApiOperation({
    summary: 'Assign courier to order',
    description: 'Assign an available courier to deliver the order',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'Order ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Courier assigned successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot assign courier to this order or courier not available',
  })
  @ApiResponse({
    status: 404,
    description: 'Order or courier not found',
  })
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  async assignCourier(
    @Param('id', ParseIntPipe) id: number,
    @Body() assignCourierDto: AssignCourierDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.orderService.assignCourier(
      id,
      assignCourierDto,
      parseInt(user.id, 10),
    );
  }

  /**
   * POST /orders/:id/cancel
   * Cancel order
   */
  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel order',
    description: 'Cancel an order and restore stock. Only allowed for orders not yet delivered.',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'Order ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Order cancelled successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot cancel order with current status',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER', 'CASHIER')
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() cancelDto: CancelOrderDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.orderService.cancel(id, cancelDto, parseInt(user.id, 10));
  }

  /**
   * GET /orders/number/:orderNumber
   * Get order by order number
   */
  @Get('number/:orderNumber')
  @ApiOperation({
    summary: 'Get order by order number',
    description: 'Retrieve an order using its order number (e.g., ORD-20260117-0001)',
  })
  @ApiParam({
    name: 'orderNumber',
    type: 'string',
    description: 'Order number',
    example: 'ORD-20260117-0001',
  })
  @ApiResponse({
    status: 200,
    description: 'Order retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async findByOrderNumber(@Param('orderNumber') orderNumber: string) {
    return this.orderService.findByOrderNumber(orderNumber);
  }
}
