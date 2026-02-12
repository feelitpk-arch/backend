import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
import { Admin } from '../entities/admin.entity';
import { Product } from '../entities/product.entity';
import { Category } from '../entities/category.entity';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Admin, Product, Category, Order, OrderItem])],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}

