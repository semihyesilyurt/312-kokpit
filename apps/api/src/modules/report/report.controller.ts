/**
 * Report Controller
 * Comprehensive reporting and analytics endpoints
 *
 * Endpoints:
 * - GET /reports/dashboard - Dashboard summary with alerts
 * - GET /reports/kpis - Key Performance Indicators
 * - GET /reports/sales - Sales analysis report
 * - GET /reports/platform-comparison - Platform comparison metrics
 * - GET /reports/product-performance - Product performance analysis
 * - GET /reports/courier-performance - Courier performance metrics
 * - GET /reports/profitability - Profitability analysis
 * - POST /reports/generate-daily - Generate daily report
 * - GET /reports/export - Export report data
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ReportService } from './report.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '@common/decorators/current-user.decorator';
import {
  DashboardQueryDto,
  KpisQueryDto,
  SalesReportQueryDto,
  PlatformComparisonQueryDto,
  ProductPerformanceQueryDto,
  CourierPerformanceQueryDto,
  ProfitabilityQueryDto,
  GenerateDailyReportDto,
  ExportReportQueryDto,
  SummaryQueryDto,
} from './dto/report-query.dto';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  /**
   * GET /reports/summary
   * Get summary report with date range presets
   */
  @Get('summary')
  @ApiOperation({
    summary: 'Get summary report',
    description: 'Retrieve summary data with date range presets (today, yesterday, this_week, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'Summary data retrieved successfully',
  })
  async getSummary(
    @CurrentUser() user: CurrentUserData,
    @Query() queryDto: SummaryQueryDto,
  ) {
    if (user.branchId && !queryDto.branchId) {
      queryDto.branchId = user.branchId;
    }
    return this.reportService.getSummary(queryDto);
  }

  /**
   * GET /reports/dashboard
   * Get dashboard summary with real-time alerts
   */
  @Get('dashboard')
  @ApiOperation({
    summary: 'Get dashboard summary',
    description: 'Retrieve comprehensive dashboard data including orders, revenue, alerts, and comparisons with yesterday',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard data retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        todayOrders: { type: 'number' },
        todayRevenue: { type: 'number' },
        todayNetProfit: { type: 'number' },
        averageDeliveryTime: { type: 'number', nullable: true },
        ordersChangePercent: { type: 'number' },
        revenueChangePercent: { type: 'number' },
        activeOrders: { type: 'number' },
        availableCouriers: { type: 'number' },
        criticalStockCount: { type: 'number' },
        sleepingCustomers: { type: 'number' },
        ordersByPlatform: { type: 'array' },
        alerts: { type: 'array' },
      },
    },
  })
  async getDashboard(
    @CurrentUser() user: CurrentUserData,
    @Query() queryDto: DashboardQueryDto,
  ) {
    // Apply branch restriction if user has one
    if (user.branchId && !queryDto.branchId) {
      queryDto.branchId = user.branchId;
    }
    return this.reportService.getDashboard(queryDto);
  }

  /**
   * GET /reports/kpis
   * Get Key Performance Indicators
   */
  @Get('kpis')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  @ApiOperation({
    summary: 'Get KPI metrics',
    description: 'Retrieve key performance indicators including net profit, waste rate, late delivery rate, etc.',
  })
  @ApiResponse({
    status: 200,
    description: 'KPIs retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        netProfit: { type: 'number' },
        netProfitMargin: { type: 'number' },
        wasteRate: { type: 'number' },
        lateDeliveryRate: { type: 'number' },
        directCustomerRate: { type: 'number' },
        averageOrderValue: { type: 'number' },
        ordersPerHour: { type: 'number' },
        customerRetentionRate: { type: 'number' },
        platformCommissionTotal: { type: 'number' },
        rawMaterialCost: { type: 'number' },
        courierCost: { type: 'number' },
      },
    },
  })
  async getKpis(
    @CurrentUser() user: CurrentUserData,
    @Query() queryDto: KpisQueryDto,
  ) {
    if (user.branchId && !queryDto.branchId) {
      queryDto.branchId = user.branchId;
    }
    return this.reportService.getKpis(queryDto);
  }

  /**
   * GET /reports/sales
   * Get sales analysis report
   */
  @Get('sales')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER', 'ACCOUNTING')
  @ApiOperation({
    summary: 'Get sales report',
    description: 'Retrieve detailed sales analysis with grouping by time period',
  })
  @ApiResponse({
    status: 200,
    description: 'Sales report retrieved successfully',
  })
  async getSalesReport(
    @CurrentUser() user: CurrentUserData,
    @Query() queryDto: SalesReportQueryDto,
  ) {
    if (user.branchId && !queryDto.branchId) {
      queryDto.branchId = user.branchId;
    }
    return this.reportService.getSalesReport(queryDto);
  }

  /**
   * GET /reports/platform-comparison
   * Get platform comparison metrics
   */
  @Get('platform-comparison')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  @ApiOperation({
    summary: 'Get platform comparison',
    description: 'Compare performance metrics across different order platforms (Getir, Yemeksepeti, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'Platform comparison retrieved successfully',
  })
  async getPlatformComparison(
    @CurrentUser() user: CurrentUserData,
    @Query() queryDto: PlatformComparisonQueryDto,
  ) {
    if (user.branchId && !queryDto.branchId) {
      queryDto.branchId = user.branchId;
    }
    return this.reportService.getPlatformComparison(queryDto);
  }

  /**
   * GET /reports/product-performance
   * Get product performance analysis
   */
  @Get('product-performance')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  @ApiOperation({
    summary: 'Get product performance',
    description: 'Analyze product sales performance including revenue, quantity sold, and profit margins',
  })
  @ApiResponse({
    status: 200,
    description: 'Product performance retrieved successfully',
  })
  async getProductPerformance(
    @CurrentUser() user: CurrentUserData,
    @Query() queryDto: ProductPerformanceQueryDto,
  ) {
    if (user.branchId && !queryDto.branchId) {
      queryDto.branchId = user.branchId;
    }
    return this.reportService.getProductPerformance(queryDto);
  }

  /**
   * GET /reports/courier-performance
   * Get courier performance metrics
   */
  @Get('courier-performance')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER')
  @ApiOperation({
    summary: 'Get courier performance',
    description: 'Analyze courier delivery performance including on-time rate and average delivery time',
  })
  @ApiResponse({
    status: 200,
    description: 'Courier performance retrieved successfully',
  })
  async getCourierPerformance(
    @CurrentUser() user: CurrentUserData,
    @Query() queryDto: CourierPerformanceQueryDto,
  ) {
    if (user.branchId && !queryDto.branchId) {
      queryDto.branchId = user.branchId;
    }
    return this.reportService.getCourierPerformance(queryDto);
  }

  /**
   * GET /reports/profitability
   * Get profitability analysis report
   */
  @Get('profitability')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'ACCOUNTING')
  @ApiOperation({
    summary: 'Get profitability analysis',
    description: 'Detailed profitability analysis including raw material costs, commissions, and net profit',
  })
  @ApiResponse({
    status: 200,
    description: 'Profitability report retrieved successfully',
  })
  async getProfitability(
    @CurrentUser() user: CurrentUserData,
    @Query() queryDto: ProfitabilityQueryDto,
  ) {
    if (user.branchId && !queryDto.branchId) {
      queryDto.branchId = user.branchId;
    }
    return this.reportService.getProfitability(queryDto);
  }

  /**
   * POST /reports/generate-daily
   * Generate daily report for a specific date
   */
  @Post('generate-daily')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'OPERATION_MANAGER')
  @ApiOperation({
    summary: 'Generate daily report',
    description: 'Generate or regenerate the daily summary report for a specific date',
  })
  @ApiResponse({
    status: 200,
    description: 'Daily report generated successfully',
  })
  async generateDailyReport(@Body() dto: GenerateDailyReportDto) {
    return this.reportService.generateDailyReport(dto);
  }

  /**
   * GET /reports/export
   * Export report data in various formats
   */
  @Get('export')
  @Roles('ADMIN', 'OPERATION_MANAGER', 'BRANCH_MANAGER', 'ACCOUNTING')
  @ApiOperation({
    summary: 'Export report',
    description: 'Export report data in CSV, Excel, or PDF format',
  })
  @ApiQuery({
    name: 'reportType',
    required: false,
    enum: ['sales', 'products', 'couriers', 'platforms', 'profitability'],
    description: 'Type of report to export',
  })
  @ApiQuery({
    name: 'format',
    required: false,
    enum: ['csv', 'excel', 'pdf'],
    description: 'Export format',
  })
  @ApiResponse({
    status: 200,
    description: 'Report export initiated',
  })
  async exportReport(
    @CurrentUser() user: CurrentUserData,
    @Query() queryDto: ExportReportQueryDto,
  ) {
    if (user.branchId && !queryDto.branchId) {
      queryDto.branchId = user.branchId;
    }
    return this.reportService.exportReport(queryDto);
  }
}
