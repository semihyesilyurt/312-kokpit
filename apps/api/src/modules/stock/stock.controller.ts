/**
 * Stock Controller
 * Stock and inventory management endpoints
 */

import {
  Controller,
  Get,
  Post,
  Put,
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
import { StockService } from './stock.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '@common/decorators/current-user.decorator';
import {
  CreateStockMovementDto,
  StockMovementQueryDto,
} from './dto/stock-movement.dto';
import {
  CreateStockCountDto,
  WasteReportQueryDto,
} from './dto/stock-count.dto';

@ApiTags('Stock')
@Controller('stock')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  /**
   * GET /stock - Get all stock items with pagination
   */
  @Get()
  @ApiOperation({ summary: 'Get stock levels' })
  @ApiResponse({ status: 200, description: 'Stock levels retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'branchId', required: false, type: Number })
  @ApiQuery({ name: 'lowStockOnly', required: false, type: Boolean })
  findAll(
    @CurrentUser() user: CurrentUserData,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('branchId') branchId?: number,
    @Query('lowStockOnly') lowStockOnly?: boolean,
  ) {
    return this.stockService.findAll({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      branchId: branchId ? Number(branchId) : (user.branchId ? Number(user.branchId) : undefined),
      lowStockOnly: lowStockOnly === true || lowStockOnly === 'true' as unknown as boolean,
    });
  }

  /**
   * GET /stock/alerts - Get critical stock alerts
   */
  @Get('alerts')
  @ApiOperation({ summary: 'Get critical stock alerts' })
  @ApiResponse({ status: 200, description: 'Stock alerts retrieved successfully' })
  @ApiQuery({ name: 'branchId', required: false, type: Number })
  getAlerts(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId?: number,
  ) {
    const resolvedBranchId = branchId
      ? Number(branchId)
      : (user.branchId ? Number(user.branchId) : undefined);
    return this.stockService.getCriticalStockAlerts(resolvedBranchId);
  }

  /**
   * GET /stock/movements - Get stock movements with filters
   */
  @Get('movements')
  @ApiOperation({ summary: 'Get stock movements' })
  @ApiResponse({ status: 200, description: 'Stock movements retrieved successfully' })
  getMovements(
    @CurrentUser() user: CurrentUserData,
    @Query() query: StockMovementQueryDto,
  ) {
    // Use user's branch if not specified
    if (!query.branchId && user.branchId) {
      query.branchId = Number(user.branchId);
    }
    return this.stockService.getMovements(query);
  }

  /**
   * GET /stock/waste-report - Get waste report for a branch
   */
  @Get('waste-report')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  @ApiOperation({ summary: 'Get waste report' })
  @ApiResponse({ status: 200, description: 'Waste report retrieved successfully' })
  @ApiQuery({ name: 'branchId', required: true, type: Number })
  @ApiQuery({ name: 'startDate', required: true, type: String })
  @ApiQuery({ name: 'endDate', required: true, type: String })
  getWasteReport(
    @CurrentUser() user: CurrentUserData,
    @Query() query: WasteReportQueryDto,
  ) {
    const branchId = query.branchId || (user.branchId ? Number(user.branchId) : undefined);
    if (!branchId) {
      throw new Error('Branch ID is required');
    }
    return this.stockService.getWasteReport(branchId, query.startDate, query.endDate);
  }

  /**
   * GET /stock/low - Get low stock items
   */
  @Get('low')
  @ApiOperation({ summary: 'Get low stock items' })
  @ApiResponse({ status: 200, description: 'Low stock items retrieved' })
  @ApiQuery({ name: 'branchId', required: false, type: Number })
  getLowStock(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId?: number,
  ) {
    const resolvedBranchId = branchId
      ? Number(branchId)
      : (user.branchId ? Number(user.branchId) : undefined);
    return this.stockService.getLowStock(resolvedBranchId);
  }

  /**
   * GET /stock/:id - Get stock item by ID
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get stock item by ID' })
  @ApiResponse({ status: 200, description: 'Stock item retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Stock item not found' })
  @ApiParam({ name: 'id', type: Number })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.stockService.findOne(id);
  }

  /**
   * POST /stock/movement - Record a stock movement
   */
  @Post('movement')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER', 'CASHIER', 'KITCHEN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record stock movement' })
  @ApiResponse({ status: 201, description: 'Stock movement recorded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid movement data' })
  @ApiResponse({ status: 404, description: 'Ingredient not found' })
  recordMovement(
    @Body() dto: CreateStockMovementDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.stockService.recordMovement(dto, Number(user.id));
  }

  /**
   * POST /stock/count - Process stock count (inventory)
   */
  @Post('count')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Process stock count',
    description: 'Performs stock count (inventory) with auto-adjustment. Calculates fire rate: (Fiili Stok - Teorik Stok) / Teorik Stok x 100',
  })
  @ApiResponse({ status: 201, description: 'Stock count processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid count data' })
  @ApiResponse({ status: 404, description: 'Ingredient not found' })
  processStockCount(
    @Body() dto: CreateStockCountDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.stockService.processStockCount(dto, Number(user.id));
  }

  /**
   * PUT /stock/:id - Update stock item settings
   */
  @Put(':id')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  @ApiOperation({ summary: 'Update stock item settings' })
  @ApiResponse({ status: 200, description: 'Stock item updated successfully' })
  @ApiResponse({ status: 404, description: 'Stock item not found' })
  @ApiParam({ name: 'id', type: Number })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: { minStock?: number; maxStock?: number },
  ) {
    return this.stockService.update(id, updateDto);
  }
}
