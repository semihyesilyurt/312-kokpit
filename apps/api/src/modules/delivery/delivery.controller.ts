/**
 * Delivery Controller
 * Comprehensive delivery and courier management endpoints
 * Includes courier management, auto-assignment, cash balance, and performance tracking
 */

import {
  Controller,
  Get,
  Post,
  Patch,
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
import { DeliveryService } from './delivery.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '@common/decorators/current-user.decorator';
import {
  UpdateCourierStatusDto,
  UpdateLocationDto,
  CashTransactionDto,
  AutoAssignDto,
  CreateCourierDto,
  UpdateCourierDto,
} from './dto';

@ApiTags('Delivery')
@Controller('delivery')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  // ============================================================================
  // COURIER MANAGEMENT ENDPOINTS
  // ============================================================================

  @Get('couriers')
  @ApiOperation({ summary: 'Get all couriers with pagination and filtering' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({ status: 200, description: 'List of couriers' })
  getCouriers(
    @CurrentUser() user: CurrentUserData,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    return this.deliveryService.getCouriers({
      page,
      limit,
      status,
      branchId: user.branchId?.toString(),
    });
  }

  @Get('couriers/:id')
  @ApiOperation({ summary: 'Get courier by ID with full details' })
  @ApiParam({ name: 'id', description: 'Courier ID' })
  @ApiResponse({ status: 200, description: 'Courier details' })
  @ApiResponse({ status: 404, description: 'Courier not found' })
  getCourierById(@Param('id', ParseIntPipe) id: number) {
    return this.deliveryService.getCourierById(id);
  }

  @Post('couriers')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  @ApiOperation({ summary: 'Create a new courier' })
  @ApiResponse({ status: 201, description: 'Courier created successfully' })
  @ApiResponse({ status: 400, description: 'Email already exists or invalid data' })
  createCourier(@Body() dto: CreateCourierDto) {
    return this.deliveryService.createCourier(dto);
  }

  @Patch('couriers/:id')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  @ApiOperation({ summary: 'Update courier information' })
  @ApiParam({ name: 'id', description: 'Courier ID' })
  @ApiResponse({ status: 200, description: 'Courier updated successfully' })
  @ApiResponse({ status: 404, description: 'Courier not found' })
  updateCourier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCourierDto,
  ) {
    return this.deliveryService.updateCourier(id, dto);
  }

  @Delete('couriers/:id')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  @ApiOperation({ summary: 'Delete (deactivate) a courier' })
  @ApiParam({ name: 'id', description: 'Courier ID' })
  @ApiResponse({ status: 200, description: 'Courier deleted successfully' })
  @ApiResponse({ status: 400, description: 'Courier has active orders' })
  @ApiResponse({ status: 404, description: 'Courier not found' })
  deleteCourier(@Param('id', ParseIntPipe) id: number) {
    return this.deliveryService.deleteCourier(id);
  }

  @Patch('couriers/:id/status')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER', 'COURIER')
  @ApiOperation({ summary: 'Update courier status' })
  @ApiParam({ name: 'id', description: 'Courier ID' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 404, description: 'Courier not found' })
  updateCourierStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCourierStatusDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.deliveryService.updateCourierStatus(id, dto, user.id);
  }

  @Post('couriers/:id/location')
  @Roles('COURIER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update courier location (for courier mobile app)' })
  @ApiParam({ name: 'id', description: 'Courier ID' })
  @ApiResponse({ status: 200, description: 'Location updated' })
  @ApiResponse({ status: 404, description: 'Courier not found' })
  updateCourierLocation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.deliveryService.updateCourierLocation(id, dto);
  }

  @Get('couriers/:id/orders')
  @ApiOperation({ summary: 'Get orders assigned to a courier' })
  @ApiParam({ name: 'id', description: 'Courier ID' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of courier orders' })
  @ApiResponse({ status: 404, description: 'Courier not found' })
  getCourierOrders(
    @Param('id', ParseIntPipe) id: number,
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.deliveryService.getCourierOrders(id, { status, page, limit });
  }

  @Get('couriers/:id/performance')
  @ApiOperation({ summary: 'Get courier performance metrics' })
  @ApiParam({ name: 'id', description: 'Courier ID' })
  @ApiQuery({
    name: 'period',
    required: false,
    type: String,
    description: 'Period: 7d, 30d, 90d (default: 30d)',
  })
  @ApiResponse({ status: 200, description: 'Performance metrics' })
  @ApiResponse({ status: 404, description: 'Courier not found' })
  getCourierPerformance(
    @Param('id', ParseIntPipe) id: number,
    @Query('period') period?: string,
  ) {
    return this.deliveryService.getCourierPerformance(id, period);
  }

  // ============================================================================
  // CASH BALANCE ENDPOINTS
  // ============================================================================

  @Post('couriers/:id/cash')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER', 'CASHIER')
  @ApiOperation({ summary: 'Record a cash transaction for courier' })
  @ApiParam({ name: 'id', description: 'Courier ID' })
  @ApiResponse({ status: 201, description: 'Transaction recorded' })
  @ApiResponse({ status: 400, description: 'Invalid transaction' })
  @ApiResponse({ status: 404, description: 'Courier not found' })
  recordCashTransaction(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CashTransactionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.deliveryService.recordCashTransaction(id, dto, user.id);
  }

  @Get('couriers/:id/balance')
  @ApiOperation({ summary: 'Get courier cash balance and recent transactions' })
  @ApiParam({ name: 'id', description: 'Courier ID' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of recent transactions (default: 10)',
  })
  @ApiResponse({ status: 200, description: 'Balance and transactions' })
  @ApiResponse({ status: 404, description: 'Courier not found' })
  getCourierBalance(
    @Param('id', ParseIntPipe) id: number,
    @Query('limit') limit?: number,
  ) {
    return this.deliveryService.getCourierBalance(id, limit);
  }

  // ============================================================================
  // AUTO-ASSIGNMENT ENDPOINTS
  // ============================================================================

  @Post('auto-assign')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  @ApiOperation({
    summary: 'Auto-assign a courier to an order using scoring algorithm',
    description: `
      Automatically assigns the best available courier to an order based on:
      - Distance (35%): Proximity to delivery location
      - Load (25%): Current number of active orders
      - Performance (20%): Historical delivery performance score
      - Returning (20%): Bonus for couriers returning from deliveries

      Minimum score for assignment: 30
    `,
  })
  @ApiResponse({
    status: 201,
    description: 'Courier assigned or no suitable courier found',
  })
  @ApiResponse({ status: 400, description: 'Order already has courier' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  autoAssignCourier(@Body() dto: AutoAssignDto) {
    return this.deliveryService.autoAssignCourier(
      dto.orderId,
      dto.branchId,
      dto.minScore,
    );
  }

  // ============================================================================
  // DELIVERY COMPLETION ENDPOINT
  // ============================================================================

  @Post('complete/:orderId')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER', 'COURIER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete a delivery',
    description: `
      Marks an order as delivered and updates:
      - Order status to DELIVERED
      - Delivery duration calculation
      - Cash balance (for CASH payment orders)
      - Courier performance metrics
      - Courier status (to RETURNING if no more orders)
    `,
  })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Delivery completed' })
  @ApiResponse({ status: 400, description: 'Invalid completion request' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  completeDelivery(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body('courierId', ParseIntPipe) courierId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.deliveryService.completeDelivery(orderId, courierId, user.id);
  }

  // ============================================================================
  // EXISTING DELIVERY ENDPOINTS (PRESERVED FOR BACKWARD COMPATIBILITY)
  // ============================================================================

  @Get()
  @ApiOperation({ summary: 'Get all deliveries' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  findAll(
    @CurrentUser() user: CurrentUserData,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    return this.deliveryService.findAll({
      page,
      limit,
      status,
      branchId: user.branchId?.toString(),
    });
  }

  @Get('active')
  @ApiOperation({ summary: 'Get active deliveries' })
  @ApiResponse({ status: 200, description: 'List of active deliveries' })
  getActive(@CurrentUser() user: CurrentUserData) {
    return this.deliveryService.getActiveDeliveries(user.branchId?.toString());
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get delivery by ID' })
  @ApiParam({ name: 'id', description: 'Delivery ID' })
  @ApiResponse({ status: 200, description: 'Delivery details' })
  @ApiResponse({ status: 404, description: 'Delivery not found' })
  findOne(@Param('id') id: string) {
    return this.deliveryService.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER', 'CASHIER')
  @ApiOperation({ summary: 'Create a delivery' })
  @ApiResponse({ status: 201, description: 'Delivery created' })
  create(
    @Body() createDeliveryDto: unknown,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.deliveryService.create(createDeliveryDto, user.id);
  }

  @Patch(':id/assign')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  @ApiOperation({ summary: 'Manually assign delivery to driver' })
  @ApiParam({ name: 'id', description: 'Delivery ID' })
  @ApiResponse({ status: 200, description: 'Driver assigned' })
  assign(@Param('id') id: string, @Body('driverId') driverId: string) {
    return this.deliveryService.assignDriver(id, driverId);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update delivery status' })
  @ApiParam({ name: 'id', description: 'Delivery ID' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.deliveryService.updateStatus(id, status, user.id);
  }

  @Patch(':id/location')
  @ApiOperation({ summary: 'Update driver location for a delivery' })
  @ApiParam({ name: 'id', description: 'Delivery ID' })
  @ApiResponse({ status: 200, description: 'Location updated' })
  updateLocation(
    @Param('id') id: string,
    @Body() locationDto: { latitude: number; longitude: number },
  ) {
    return this.deliveryService.updateLocation(id, locationDto);
  }
}
