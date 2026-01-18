/**
 * Rule Engine Controller
 * Business rules management endpoints
 *
 * Endpoints:
 * - GET /rules - Get all rules
 * - GET /rules/:id - Get single rule
 * - POST /rules - Create a new rule
 * - PATCH /rules/:id - Update a rule
 * - DELETE /rules/:id - Delete a rule
 * - POST /rules/:id/toggle - Toggle rule active status
 * - GET /rules/:id/executions - Get rule execution history
 * - POST /rules/:id/test - Test rule without executing
 * - POST /rules/:id/rollback - Rollback a rule execution
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
} from '@nestjs/swagger';
import { RuleEngineService } from './rule-engine.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser, CurrentUserData } from '@common/decorators/current-user.decorator';
import {
  CreateRuleDto,
  UpdateRuleDto,
  RuleQueryDto,
  TestRuleDto,
  ExecutionQueryDto,
} from './dto/rule.dto';

@ApiTags('Rules')
@Controller('rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class RuleEngineController {
  constructor(private readonly ruleEngineService: RuleEngineService) {}

  /**
   * GET /rules
   * Get all rules with filtering
   */
  @Get()
  @Roles('ADMIN', 'OPERATION_MANAGER')
  @ApiOperation({
    summary: 'Get all rules',
    description: 'Retrieve all business rules with optional filtering by status and action type',
  })
  @ApiResponse({
    status: 200,
    description: 'Rules retrieved successfully',
  })
  async findAll(@Query() queryDto: RuleQueryDto) {
    return this.ruleEngineService.findAll(queryDto);
  }

  /**
   * GET /rules/:id
   * Get single rule by ID
   */
  @Get(':id')
  @Roles('ADMIN', 'OPERATION_MANAGER')
  @ApiOperation({
    summary: 'Get rule by ID',
    description: 'Retrieve a single rule with its recent execution history',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'Rule ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Rule retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Rule not found',
  })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ruleEngineService.findOne(id);
  }

  /**
   * POST /rules
   * Create a new rule
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Create a new rule',
    description: 'Create a new business rule with conditions and actions',
  })
  @ApiResponse({
    status: 201,
    description: 'Rule created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid rule data',
  })
  async create(
    @Body() createRuleDto: CreateRuleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.ruleEngineService.create(createRuleDto, parseInt(user.id, 10));
  }

  /**
   * PATCH /rules/:id
   * Update an existing rule
   */
  @Patch(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Update a rule',
    description: 'Update an existing business rule',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'Rule ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Rule updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Rule not found',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateRuleDto: UpdateRuleDto,
  ) {
    return this.ruleEngineService.update(id, updateRuleDto);
  }

  /**
   * DELETE /rules/:id
   * Delete a rule (soft delete)
   */
  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Delete a rule',
    description: 'Soft delete a rule by setting its status to INACTIVE',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'Rule ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Rule deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Rule not found',
  })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.ruleEngineService.remove(id);
  }

  /**
   * POST /rules/:id/toggle
   * Toggle rule active status
   */
  @Post(':id/toggle')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'OPERATION_MANAGER')
  @ApiOperation({
    summary: 'Toggle rule status',
    description: 'Toggle a rule between ACTIVE and INACTIVE status',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'Rule ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Rule status toggled successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Rule not found',
  })
  async toggle(@Param('id', ParseIntPipe) id: number) {
    return this.ruleEngineService.toggle(id);
  }

  /**
   * GET /rules/:id/executions
   * Get rule execution history
   */
  @Get(':id/executions')
  @Roles('ADMIN', 'OPERATION_MANAGER')
  @ApiOperation({
    summary: 'Get rule executions',
    description: 'Retrieve the execution history for a specific rule',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'Rule ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Executions retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Rule not found',
  })
  async getExecutions(
    @Param('id', ParseIntPipe) id: number,
    @Query() queryDto: ExecutionQueryDto,
  ) {
    return this.ruleEngineService.getExecutions(id, queryDto);
  }

  /**
   * POST /rules/:id/test
   * Test a rule without executing actions
   */
  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'OPERATION_MANAGER')
  @ApiOperation({
    summary: 'Test a rule',
    description: 'Test rule conditions without actually executing actions. Useful for validation.',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'Rule ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Test result returned',
    schema: {
      type: 'object',
      properties: {
        rule: { type: 'object' },
        testResult: {
          type: 'object',
          properties: {
            conditionMet: { type: 'boolean' },
            metricValue: { type: 'number' },
            expectedValue: { type: 'number' },
            operator: { type: 'string' },
            allMetrics: { type: 'object' },
          },
        },
        wouldExecute: { type: 'boolean' },
        note: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Rule not found',
  })
  async testRule(
    @Param('id', ParseIntPipe) id: number,
    @Body() testDto: TestRuleDto,
  ) {
    return this.ruleEngineService.testRule(id, testDto);
  }

  /**
   * POST /rules/:id/rollback
   * Rollback a rule execution
   */
  @Post(':id/rollback')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Rollback rule execution',
    description: 'Rollback a specific rule execution to restore previous state. Only works for reversible actions.',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'Rule ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Rollback executed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Execution cannot be rolled back',
  })
  @ApiResponse({
    status: 404,
    description: 'Rule or execution not found',
  })
  async rollback(
    @Param('id', ParseIntPipe) id: number,
    @Body('executionId', ParseIntPipe) executionId: number,
  ) {
    return this.ruleEngineService.rollback(id, executionId);
  }
}
