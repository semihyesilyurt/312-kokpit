/**
 * Customer Controller
 * Customer management endpoints with:
 * - GET /customers - List all customers
 * - GET /customers/:id - Get customer by ID
 * - GET /customers/:id/orders - Get customer order history
 * - GET /customers/sleeping - Get sleeping customers (30+ days)
 * - POST /customers/:id/winback - Send win-back campaign
 * - GET /customers/stats - Get customer statistics
 * - POST /customers/:id/convert - Convert to direct customer
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
import { CustomerService, WinbackChannel } from './customer.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '@common/decorators/current-user.decorator';
import { CustomerStatus, Platform } from '@prisma/client';

/**
 * DTO for win-back campaign
 */
class WinbackDto {
  channel!: WinbackChannel;
  message?: string;
  templateId?: string;
}

/**
 * DTO for creating customer
 */
class CreateCustomerDto {
  name!: string;
  phone!: string;
  email?: string;
  defaultAddress?: string;
  defaultLatitude?: number;
  defaultLongitude?: number;
  firstOrderPlatform?: Platform;
}

/**
 * DTO for updating customer
 */
class UpdateCustomerDto {
  name?: string;
  email?: string;
  defaultAddress?: string;
  defaultLatitude?: number;
  defaultLongitude?: number;
  status?: CustomerStatus;
  notes?: string;
}

@ApiTags('Customers')
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  /**
   * GET /customers
   * Get all customers with filtering and pagination
   */
  @Get()
  @ApiOperation({
    summary: 'Get all customers',
    description: 'Retrieve customers with filtering, pagination, and sorting options',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: CustomerStatus })
  @ApiQuery({ name: 'isDirectCustomer', required: false, type: Boolean })
  @ApiQuery({ name: 'minOrders', required: false, type: Number })
  @ApiQuery({ name: 'maxOrders', required: false, type: Number })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['createdAt', 'lastOrderAt', 'totalOrders', 'totalSpent'],
  })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiResponse({
    status: 200,
    description: 'Customers retrieved successfully',
  })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: CustomerStatus,
    @Query('isDirectCustomer') isDirectCustomer?: string,
    @Query('minOrders') minOrders?: number,
    @Query('maxOrders') maxOrders?: number,
    @Query('sortBy') sortBy?: 'createdAt' | 'lastOrderAt' | 'totalOrders' | 'totalSpent',
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.customerService.findAll({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
      status,
      isDirectCustomer: isDirectCustomer === 'true' ? true : isDirectCustomer === 'false' ? false : undefined,
      minOrders: minOrders ? Number(minOrders) : undefined,
      maxOrders: maxOrders ? Number(maxOrders) : undefined,
      sortBy,
      sortOrder,
    });
  }

  /**
   * GET /customers/sleeping
   * Get sleeping customers (30+ days without order)
   */
  @Get('sleeping')
  @ApiOperation({
    summary: 'Get sleeping customers',
    description: 'Retrieve customers who have not ordered in 30+ days',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Sleeping customers retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'object' } },
        meta: { type: 'object' },
        threshold: { type: 'number', example: 30 },
      },
    },
  })
  getSleepingCustomers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.customerService.getSleepingCustomers({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * GET /customers/stats
   * Get customer statistics
   */
  @Get('stats')
  @ApiOperation({
    summary: 'Get customer statistics',
    description: 'Retrieve customer statistics including counts by status, revenue, and top customers',
  })
  @ApiResponse({
    status: 200,
    description: 'Customer statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        active: { type: 'number' },
        sleeping: { type: 'number' },
        lost: { type: 'number' },
        vip: { type: 'number' },
        directCustomers: { type: 'number' },
        platformCustomers: { type: 'number' },
        averageOrderValue: { type: 'number' },
        totalRevenue: { type: 'number' },
        conversionRate: { type: 'number' },
        topCustomers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
              phone: { type: 'string' },
              totalOrders: { type: 'number' },
              totalSpent: { type: 'number' },
            },
          },
        },
      },
    },
  })
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  getStats() {
    return this.customerService.getStats();
  }

  /**
   * GET /customers/:id
   * Get customer by ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get customer by ID',
    description: 'Retrieve a single customer with full details including recent orders',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'Customer ID' })
  @ApiResponse({
    status: 200,
    description: 'Customer retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Customer not found',
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.customerService.findOne(id);
  }

  /**
   * GET /customers/:id/orders
   * Get customer order history
   */
  @Get(':id/orders')
  @ApiOperation({
    summary: 'Get customer order history',
    description: 'Retrieve paginated order history for a customer',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'Customer ID' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'Order history retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Customer not found',
  })
  getOrderHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.customerService.getOrderHistory(id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * POST /customers/:id/winback
   * Send win-back campaign to sleeping customer
   */
  @Post(':id/winback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send win-back campaign',
    description: 'Send a win-back campaign to a sleeping customer via SMS or WhatsApp',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'Customer ID' })
  @ApiResponse({
    status: 200,
    description: 'Win-back campaign queued successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        customerId: { type: 'number' },
        channel: { type: 'string', enum: ['SMS', 'WHATSAPP'] },
        jobId: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Customer is not sleeping or has no phone number',
  })
  @ApiResponse({
    status: 404,
    description: 'Customer not found',
  })
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  sendWinback(
    @Param('id', ParseIntPipe) id: number,
    @Body() winbackDto: WinbackDto,
  ) {
    return this.customerService.sendWinback(id, winbackDto);
  }

  /**
   * POST /customers/:id/convert
   * Convert platform customer to direct customer
   */
  @Post(':id/convert')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Convert to direct customer',
    description: 'Mark a platform customer as a direct customer',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'Customer ID' })
  @ApiResponse({
    status: 200,
    description: 'Customer converted to direct successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Customer is already a direct customer',
  })
  @ApiResponse({
    status: 404,
    description: 'Customer not found',
  })
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  convertToDirectCustomer(@Param('id', ParseIntPipe) id: number) {
    return this.customerService.convertToDirectCustomer(id);
  }

  /**
   * POST /customers
   * Create a new customer
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new customer',
    description: 'Create a new customer record',
  })
  @ApiResponse({
    status: 201,
    description: 'Customer created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Customer with this phone already exists',
  })
  create(@Body() createCustomerDto: CreateCustomerDto) {
    return this.customerService.create(createCustomerDto);
  }

  /**
   * PUT /customers/:id
   * Update a customer
   */
  @Put(':id')
  @ApiOperation({
    summary: 'Update a customer',
    description: 'Update customer information',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'Customer ID' })
  @ApiResponse({
    status: 200,
    description: 'Customer updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Customer not found',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCustomerDto: UpdateCustomerDto,
  ) {
    return this.customerService.update(id, updateCustomerDto);
  }

  /**
   * DELETE /customers/:id
   * Delete a customer (soft delete)
   */
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a customer',
    description: 'Soft delete a customer by marking them as LOST',
  })
  @ApiParam({ name: 'id', type: 'number', description: 'Customer ID' })
  @ApiResponse({
    status: 200,
    description: 'Customer marked as lost',
  })
  @ApiResponse({
    status: 404,
    description: 'Customer not found',
  })
  @Roles('ADMIN', 'OPERATION_MANAGER')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.customerService.remove(id);
  }
}
