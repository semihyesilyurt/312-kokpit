/**
 * Recipe Controller
 * Recipe and menu management endpoints
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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { RecipeService } from './recipe.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';

@ApiTags('Recipes')
@Controller('recipes')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class RecipeController {
  constructor(private readonly recipeService: RecipeService) {}

  @Get()
  @ApiOperation({ summary: 'Get all recipes' })
  findAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.recipeService.findAll({ page, limit });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get recipe by ID' })
  findOne(@Param('id') id: string) {
    return this.recipeService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OPERATION_MANAGER)
  @ApiOperation({ summary: 'Create a new recipe' })
  create(@Body() createRecipeDto: unknown) {
    return this.recipeService.create(createRecipeDto);
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.OPERATION_MANAGER)
  @ApiOperation({ summary: 'Update a recipe' })
  update(@Param('id') id: string, @Body() updateRecipeDto: unknown) {
    return this.recipeService.update(id, updateRecipeDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a recipe' })
  remove(@Param('id') id: string) {
    return this.recipeService.remove(id);
  }

  @Get(':id/cost')
  @ApiOperation({ summary: 'Calculate recipe cost' })
  calculateCost(@Param('id') id: string) {
    return this.recipeService.calculateCost(id);
  }
}
