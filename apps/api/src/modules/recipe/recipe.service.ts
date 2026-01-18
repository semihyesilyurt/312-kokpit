/**
 * Recipe Service
 * Recipe management business logic
 *
 * Note: Recipes are managed through RecipeItem model which links Products to Ingredients.
 * Each Product can have multiple RecipeItems (ingredients with quantities).
 */

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

interface FindAllOptions {
  page?: number;
  limit?: number;
}

interface RecipeItemInput {
  ingredientId: number;
  quantity: number;
}

interface CreateRecipeInput {
  productId: number;
  items: RecipeItemInput[];
}

interface UpdateRecipeInput {
  items?: RecipeItemInput[];
}

@Injectable()
export class RecipeService {
  private readonly logger = new Logger(RecipeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all products with their recipe items (ingredients)
   */
  async findAll(options: FindAllOptions = {}) {
    const { page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;
    const take = limit;

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        skip,
        take,
        where: { isActive: true },
        include: {
          category: true,
          recipe: {
            include: { ingredient: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.product.count({ where: { isActive: true } }),
    ]);

    return {
      items: products.map((product) => ({
        productId: product.id,
        productName: product.name,
        category: product.category.name,
        ingredients: product.recipe.map((ri) => ({
          id: ri.id,
          ingredientId: ri.ingredientId,
          ingredientName: ri.ingredient.name,
          quantity: ri.quantity,
          unit: ri.ingredient.unit,
          unitCost: ri.ingredient.unitCost,
        })),
      })),
      meta: {
        total,
        page,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  /**
   * Get recipe (ingredients) for a specific product
   */
  async findOne(id: string) {
    const productId = parseInt(id, 10);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, isActive: true },
      include: {
        category: true,
        recipe: {
          include: { ingredient: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return {
      productId: product.id,
      productName: product.name,
      category: product.category.name,
      basePrice: product.basePrice,
      cost: product.cost,
      ingredients: product.recipe.map((ri) => ({
        id: ri.id,
        ingredientId: ri.ingredientId,
        ingredientName: ri.ingredient.name,
        quantity: ri.quantity,
        unit: ri.ingredient.unit,
        unitCost: ri.ingredient.unitCost,
      })),
    };
  }

  /**
   * Create or replace recipe items for a product
   */
  async create(data: unknown) {
    const recipeData = data as CreateRecipeInput;

    // Verify product exists
    const product = await this.prisma.product.findUnique({
      where: { id: recipeData.productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${recipeData.productId} not found`);
    }

    // Delete existing recipe items and create new ones
    await this.prisma.$transaction(async (tx) => {
      await tx.recipeItem.deleteMany({
        where: { productId: recipeData.productId },
      });

      await tx.recipeItem.createMany({
        data: recipeData.items.map((item) => ({
          productId: recipeData.productId,
          ingredientId: item.ingredientId,
          quantity: item.quantity,
        })),
      });
    });

    // Fetch and return the updated recipe
    const updatedProduct = await this.prisma.product.findUnique({
      where: { id: recipeData.productId },
      include: {
        recipe: {
          include: { ingredient: true },
        },
      },
    });

    this.logger.log(`Recipe created/updated for product: ${product.name}`);

    return {
      productId: updatedProduct!.id,
      productName: updatedProduct!.name,
      ingredients: updatedProduct!.recipe.map((ri) => ({
        id: ri.id,
        ingredientId: ri.ingredientId,
        ingredientName: ri.ingredient.name,
        quantity: ri.quantity,
        unit: ri.ingredient.unit,
      })),
    };
  }

  /**
   * Update recipe items for a product
   */
  async update(id: string, data: unknown) {
    const productId = parseInt(id, 10);
    const updateData = data as UpdateRecipeInput;

    // Verify product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    if (updateData.items) {
      await this.prisma.$transaction(async (tx) => {
        await tx.recipeItem.deleteMany({
          where: { productId },
        });

        await tx.recipeItem.createMany({
          data: updateData.items!.map((item) => ({
            productId,
            ingredientId: item.ingredientId,
            quantity: item.quantity,
          })),
        });
      });
    }

    const updatedProduct = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        recipe: {
          include: { ingredient: true },
        },
      },
    });

    this.logger.log(`Recipe updated for product: ${id}`);

    return {
      productId: updatedProduct!.id,
      productName: updatedProduct!.name,
      ingredients: updatedProduct!.recipe.map((ri) => ({
        id: ri.id,
        ingredientId: ri.ingredientId,
        ingredientName: ri.ingredient.name,
        quantity: ri.quantity,
        unit: ri.ingredient.unit,
      })),
    };
  }

  /**
   * Remove all recipe items for a product
   */
  async remove(id: string) {
    const productId = parseInt(id, 10);

    // Verify product exists
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    await this.prisma.recipeItem.deleteMany({
      where: { productId },
    });

    this.logger.log(`Recipe deleted for product: ${id}`);
    return { message: 'Recipe deleted successfully' };
  }

  /**
   * Calculate the cost of a recipe based on ingredient costs
   */
  async calculateCost(id: string) {
    const productId = parseInt(id, 10);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, isActive: true },
      include: {
        recipe: {
          include: { ingredient: true },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    let totalCost = 0;
    const ingredientCosts = [];

    for (const ri of product.recipe) {
      const quantity = Number(ri.quantity);
      const unitCost = Number(ri.ingredient.unitCost);
      const ingredientCost = quantity * unitCost;
      totalCost += ingredientCost;

      ingredientCosts.push({
        ingredient: ri.ingredient.name,
        quantity: ri.quantity,
        unit: ri.ingredient.unit,
        unitCost: ri.ingredient.unitCost,
        totalCost: ingredientCost,
      });
    }

    return {
      productId: product.id,
      productName: product.name,
      basePrice: product.basePrice,
      ingredientCosts,
      totalCost,
      margin: Number(product.basePrice) - totalCost,
      marginPercent: totalCost > 0
        ? ((Number(product.basePrice) - totalCost) / Number(product.basePrice) * 100).toFixed(2)
        : '100.00',
      currency: 'TRY',
    };
  }
}
