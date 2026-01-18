/**
 * User Service
 * User management business logic
 */

import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

interface FindAllOptions {
  page?: number;
  limit?: number;
}

interface CreateUserDto {
  email: string;
  password: string;
  name: string;
  phone?: string;
  role?: UserRole;
  branchId?: number;
}

interface UpdateUserDto {
  name?: string;
  phone?: string;
  role?: UserRole;
  status?: UserStatus;
  branchId?: number;
  password?: string;
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(options: FindAllOptions = {}) {
    const { page = 1, limit = 20 } = options;
    const { skip, take } = this.prisma.paginate(page, limit);

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take,
        where: { status: UserStatus.ACTIVE },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          status: true,
          branchId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
    ]);

    return {
      items: users,
      meta: this.prisma.buildPaginationMeta(total, page, take),
    };
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, status: { not: UserStatus.SUSPENDED } },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        branchId: true,
        createdAt: true,
        updatedAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async create(data: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        phone: data.phone,
        role: data.role || UserRole.CASHIER,
        branchId: data.branchId,
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        branchId: true,
        createdAt: true,
      },
    });

    this.logger.log(`User created: ${user.email}`);
    return user;
  }

  async update(id: number, data: UpdateUserDto) {
    await this.findOne(id);

    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.branchId !== undefined) updateData.branchId = data.branchId;

    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        status: true,
        branchId: true,
        updatedAt: true,
      },
    });

    this.logger.log(`User updated: ${user.email}`);
    return user;
  }

  async remove(id: number) {
    await this.findOne(id);

    await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.INACTIVE },
    });

    this.logger.log(`User deleted: ${id}`);
    return { message: 'User deleted successfully' };
  }
}
