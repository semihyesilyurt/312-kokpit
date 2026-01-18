/**
 * Product Service
 * Business logic for product management
 */

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate slug from name
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  /**
   * Create a new product
   */
  async create(dto: CreateProductDto) {
    const slug = dto.slug || this.generateSlug(dto.name);

    // Check if slug already exists
    const existing = await this.prisma.product.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ConflictException(`Product with slug "${slug}" already exists`);
    }

    // Check if category exists
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${dto.categoryId} not found`);
    }

    return this.prisma.product.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        categoryId: dto.categoryId,
        basePrice: dto.basePrice,
        platformPrices: dto.platformPrices as Prisma.InputJsonValue,
        cost: dto.cost ?? 0,
        isActive: dto.isActive ?? true,
        isAvailable: dto.isAvailable ?? true,
        preparationTime: dto.preparationTime ?? 10,
        sortOrder: dto.sortOrder ?? 0,
        imageUrl: dto.imageUrl,
      },
      include: {
        category: true,
      },
    });
  }

  /**
   * Find all products with filtering and pagination
   */
  async findAll(query: ProductQueryDto) {
    const {
      page = 1,
      limit = 20,
      categoryId,
      isActive,
      isAvailable,
      search,
      sortBy = 'sortOrder',
      sortOrder = 'asc',
    } = query;

    const where: Prisma.ProductWhereInput = {};

    if (categoryId !== undefined) {
      where.categoryId = categoryId;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (isAvailable !== undefined) {
      where.isAvailable = isAvailable;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      products,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Find a single product by ID
   */
  async findOne(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        recipe: {
          include: {
            ingredient: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return product;
  }

  /**
   * Find a product by slug
   */
  async findBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with slug "${slug}" not found`);
    }

    return product;
  }

  /**
   * Update a product
   */
  async update(id: number, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    // If slug is being updated, check for conflicts
    if (dto.slug && dto.slug !== product.slug) {
      const existing = await this.prisma.product.findUnique({
        where: { slug: dto.slug },
      });

      if (existing) {
        throw new ConflictException(`Product with slug "${dto.slug}" already exists`);
      }
    }

    // If category is being updated, check if it exists
    if (dto.categoryId && dto.categoryId !== product.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });

      if (!category) {
        throw new NotFoundException(`Category with ID ${dto.categoryId} not found`);
      }
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        ...dto,
        platformPrices: dto.platformPrices as Prisma.InputJsonValue,
      },
      include: {
        category: true,
      },
    });
  }

  /**
   * Delete a product
   */
  async remove(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return this.prisma.product.delete({
      where: { id },
    });
  }

  /**
   * Toggle product availability
   */
  async toggleAvailability(id: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        isAvailable: !product.isAvailable,
      },
      include: {
        category: true,
      },
    });
  }

  /**
   * Get all categories
   */
  async getCategories() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });
  }
}
