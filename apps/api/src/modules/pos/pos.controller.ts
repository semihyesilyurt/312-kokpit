/**
 * POS Controller
 * Point of Sale endpoints with:
 * - POST /pos/quick-sale - Quick sale for walk-in customers
 * - GET /pos/products - Get products for POS menu
 * - GET /pos/tables - Get all tables
 * - POST /pos/tables/:id/open - Open a table
 * - POST /pos/tables/:id/add - Add items to table
 * - POST /pos/tables/:id/close - Close table and complete order
 * - GET /pos/daily-summary - Get daily cash summary
 */

import {
  Controller,
  Get,
  Post,
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
import { PosService } from './pos.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '@common/decorators/current-user.decorator';
import { PaymentMethod } from '@prisma/client';

/**
 * DTO for quick sale item
 */
class QuickSaleItemDto {
  productId!: number;
  quantity!: number;
  unitPrice?: number;
  notes?: string;
}

/**
 * DTO for quick sale
 */
class QuickSaleDto {
  items!: QuickSaleItemDto[];
  paymentMethod!: PaymentMethod;
  customerPhone?: string;
  customerName?: string;
  notes?: string;
  discount?: number;
}

/**
 * DTO for opening a table
 */
class OpenTableDto {
  customerCount?: number;
}

/**
 * DTO for adding items to table
 */
class AddItemsDto {
  items!: QuickSaleItemDto[];
}

/**
 * DTO for closing a table
 */
class CloseTableDto {
  paymentMethod!: PaymentMethod;
  discount?: number;
  customerPhone?: string;
  customerName?: string;
}

@ApiTags('POS')
@Controller('pos')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class PosController {
  constructor(private readonly posService: PosService) {}

  /**
   * POST /pos/quick-sale
   * Quick sale for walk-in customers
   */
  @Post('quick-sale')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Quick sale',
    description: 'Create a quick sale order for walk-in customers. Order is auto-completed to DELIVERED status.',
  })
  @ApiResponse({
    status: 201,
    description: 'Quick sale completed successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        orderNumber: { type: 'string', example: 'POS-20260117-0001' },
        status: { type: 'string', example: 'DELIVERED' },
        totalAmount: { type: 'string' },
        paymentMethod: { type: 'string' },
        items: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid product or items',
  })
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER', 'CASHIER')
  quickSale(
    @CurrentUser() user: CurrentUserData,
    @Body() quickSaleDto: QuickSaleDto,
  ) {
    const branchId = user.branchId ? Number(user.branchId) : 1;
    return this.posService.quickSale(
      branchId,
      Number(user.id),
      quickSaleDto,
    );
  }

  /**
   * GET /pos/products
   * Get products for POS menu
   */
  @Get('products')
  @ApiOperation({
    summary: 'Get POS products',
    description: 'Retrieve products grouped by category for the POS menu',
  })
  @ApiResponse({
    status: 200,
    description: 'Products retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
          products: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  })
  getProducts(@CurrentUser() user: CurrentUserData) {
    const branchId = user.branchId ? Number(user.branchId) : undefined;
    return this.posService.getProducts(branchId);
  }

  /**
   * GET /pos/tables
   * Get all tables
   */
  @Get('tables')
  @ApiOperation({
    summary: 'Get all tables',
    description: 'Retrieve all tables with their current status',
  })
  @ApiResponse({
    status: 200,
    description: 'Tables retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
          capacity: { type: 'number' },
          status: { type: 'string', enum: ['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING'] },
          currentOrderId: { type: 'number' },
          openedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  getTables() {
    return this.posService.getTables();
  }

  /**
   * POST /pos/tables/:id/open
   * Open a table
   */
  @Post('tables/:id/open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Open a table',
    description: 'Mark a table as occupied and create a pending order for it',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'Table ID' })
  @ApiResponse({
    status: 200,
    description: 'Table opened successfully',
    schema: {
      type: 'object',
      properties: {
        table: { type: 'object' },
        order: { type: 'object' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Table is not available',
  })
  @ApiResponse({
    status: 404,
    description: 'Table not found',
  })
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER', 'CASHIER')
  openTable(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() openTableDto: OpenTableDto,
  ) {
    const branchId = user.branchId ? Number(user.branchId) : 1;
    return this.posService.openTable(
      id,
      branchId,
      Number(user.id),
      openTableDto.customerCount,
    );
  }

  /**
   * POST /pos/tables/:id/add
   * Add items to a table's order
   */
  @Post('tables/:id/add')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add items to table',
    description: 'Add items to the active order for a table',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'Table ID' })
  @ApiResponse({
    status: 200,
    description: 'Items added successfully',
    schema: {
      type: 'object',
      properties: {
        table: { type: 'object' },
        order: { type: 'object' },
        addedItems: { type: 'number' },
        addedTotal: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Table is not occupied or product not found',
  })
  @ApiResponse({
    status: 404,
    description: 'Table or order not found',
  })
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER', 'CASHIER')
  addItemsToTable(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() addItemsDto: AddItemsDto,
  ) {
    const branchId = user.branchId ? Number(user.branchId) : 1;
    return this.posService.addItemsToTable(
      id,
      branchId,
      Number(user.id),
      addItemsDto.items,
    );
  }

  /**
   * POST /pos/tables/:id/close
   * Close a table and complete the order
   */
  @Post('tables/:id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Close a table',
    description: 'Complete the order for a table and mark it as available',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'Table ID' })
  @ApiResponse({
    status: 200,
    description: 'Table closed successfully',
    schema: {
      type: 'object',
      properties: {
        table: { type: 'object' },
        order: { type: 'object' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Table is not occupied or has no items',
  })
  @ApiResponse({
    status: 404,
    description: 'Table or order not found',
  })
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER', 'CASHIER')
  closeTable(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() closeTableDto: CloseTableDto,
  ) {
    const branchId = user.branchId ? Number(user.branchId) : 1;
    return this.posService.closeTable(id, branchId, Number(user.id), closeTableDto);
  }

  /**
   * GET /pos/daily-summary
   * Get daily cash summary with payment method breakdown
   */
  @Get('daily-summary')
  @ApiOperation({
    summary: 'Get daily summary',
    description: 'Retrieve daily POS summary with payment method breakdown',
  })
  @ApiQuery({
    name: 'date',
    required: false,
    type: String,
    description: 'Date in YYYY-MM-DD format (defaults to today)',
  })
  @ApiResponse({
    status: 200,
    description: 'Daily summary retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        totalOrders: { type: 'number' },
        totalRevenue: { type: 'number' },
        totalCash: { type: 'number' },
        totalCard: { type: 'number' },
        totalOnline: { type: 'number' },
        totalMealCard: { type: 'number' },
        averageOrderValue: { type: 'number' },
        ordersByHour: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              hour: { type: 'number' },
              count: { type: 'number' },
              revenue: { type: 'number' },
            },
          },
        },
        topProducts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              productId: { type: 'number' },
              name: { type: 'string' },
              quantity: { type: 'number' },
              revenue: { type: 'number' },
            },
          },
        },
        paymentBreakdown: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              method: { type: 'string' },
              count: { type: 'number' },
              amount: { type: 'number' },
            },
          },
        },
      },
    },
  })
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER', 'CASHIER')
  getDailySummary(
    @CurrentUser() user: CurrentUserData,
    @Query('date') date?: string,
  ) {
    const branchId = user.branchId ? Number(user.branchId) : 1;
    return this.posService.getDailySummary(branchId, date);
  }

  // Session management endpoints (from original)

  /**
   * GET /pos/sessions
   * Get POS sessions
   */
  @Get('sessions')
  @ApiOperation({ summary: 'Get POS sessions' })
  getSessions(
    @CurrentUser() user: CurrentUserData,
    @Query('date') date?: string,
  ) {
    const branchId = user.branchId ? Number(user.branchId) : undefined;
    return this.posService.getSessions(branchId, date);
  }

  /**
   * GET /pos/sessions/current
   * Get current active session
   */
  @Get('sessions/current')
  @ApiOperation({ summary: 'Get current active session' })
  getCurrentSession(@CurrentUser() user: CurrentUserData) {
    const branchId = user.branchId ? Number(user.branchId) : undefined;
    return this.posService.getCurrentSession(branchId, Number(user.id));
  }

  /**
   * POST /pos/sessions/open
   * Open a new POS session
   */
  @Post('sessions/open')
  @ApiOperation({ summary: 'Open a new POS session' })
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER', 'CASHIER')
  openSession(
    @CurrentUser() user: CurrentUserData,
    @Body() openSessionDto: { initialCash: number },
  ) {
    const branchId = user.branchId ? Number(user.branchId) : 1;
    return this.posService.openSession(
      branchId,
      Number(user.id),
      openSessionDto.initialCash,
    );
  }

  /**
   * POST /pos/sessions/:id/close
   * Close a POS session
   */
  @Post('sessions/:id/close')
  @ApiOperation({ summary: 'Close a POS session' })
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER', 'CASHIER')
  closeSession(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Body() closeSessionDto: { finalCash: number; notes?: string },
  ) {
    return this.posService.closeSession(id, Number(user.id), closeSessionDto);
  }
}
