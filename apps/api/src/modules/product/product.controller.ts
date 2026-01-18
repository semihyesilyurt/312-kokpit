/**
 * Product Controller
 * REST API endpoints for product management
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'Product with slug already exists' })
  async create(@Body() dto: CreateProductDto) {
    const product = await this.productService.create(dto);
    return {
      success: true,
      data: product,
      message: 'Product created successfully',
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all products with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  async findAll(@Query() query: ProductQueryDto) {
    const result = await this.productService.findAll(query);
    return {
      success: true,
      data: result.products,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get all product categories' })
  @ApiResponse({ status: 200, description: 'Categories retrieved successfully' })
  async getCategories() {
    const categories = await this.productService.getCategories();
    return {
      success: true,
      data: categories,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const product = await this.productService.findOne(id);
    return {
      success: true,
      data: product,
    };
  }

  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get a product by slug' })
  @ApiParam({ name: 'slug', description: 'Product slug' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async findBySlug(@Param('slug') slug: string) {
    const product = await this.productService.findBySlug(slug);
    return {
      success: true,
      data: product,
    };
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Update a product' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ) {
    const product = await this.productService.update(id, dto);
    return {
      success: true,
      data: product,
      message: 'Product updated successfully',
    };
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Partially update a product' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async partialUpdate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
  ) {
    const product = await this.productService.update(id, dto);
    return {
      success: true,
      data: product,
      message: 'Product updated successfully',
    };
  }

  @Patch(':id/toggle-availability')
  @Roles(UserRole.ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  @ApiOperation({ summary: 'Toggle product availability' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product availability toggled' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async toggleAvailability(@Param('id', ParseIntPipe) id: number) {
    const product = await this.productService.toggleAvailability(id);
    return {
      success: true,
      data: product,
      message: `Product is now ${product.isAvailable ? 'available' : 'unavailable'}`,
    };
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a product' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.productService.remove(id);
    return {
      success: true,
      message: 'Product deleted successfully',
    };
  }
}
