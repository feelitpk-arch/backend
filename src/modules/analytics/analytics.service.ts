import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Order, OrderStatus } from '../../entities/order.entity';
import { Product } from '../../entities/product.entity';
import { ReportPeriod } from './dto/analytics-query.dto';
import { toStringId } from '../../common/utils/mongodb.util';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
  ) {}

  async getDashboardStats() {
    const totalProducts = await this.productRepository.count();
    const totalOrders = await this.orderRepository.count();
    
    const orders = await this.orderRepository.find();
    const totalRevenue = orders.reduce((sum, order) => sum + Number(order.total), 0);
    
    const pendingOrders = await this.orderRepository.count({
      where: { status: OrderStatus.PENDING },
    });

    return {
      totalProducts,
      totalOrders,
      totalRevenue,
      pendingOrders,
    };
  }

  async getSalesReport(period: ReportPeriod = ReportPeriod.MONTHLY) {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date(now);
    let previousStartDate: Date;
    let previousEndDate: Date;

    switch (period) {
      case ReportPeriod.WEEKLY:
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        previousEndDate = new Date(startDate);
        previousEndDate.setDate(previousEndDate.getDate() - 1);
        previousStartDate = new Date(previousEndDate);
        previousStartDate.setDate(previousStartDate.getDate() - 7);
        break;
      case ReportPeriod.MONTHLY:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        previousStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousEndDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case ReportPeriod.YEARLY:
        startDate = new Date(now.getFullYear(), 0, 1);
        previousStartDate = new Date(now.getFullYear() - 1, 0, 1);
        previousEndDate = new Date(now.getFullYear() - 1, 11, 31);
        break;
    }

    const currentOrders = await this.orderRepository.find({
      where: {
        createdAt: Between(startDate, endDate),
      },
      relations: ['items', 'items.product'],
    });

    const previousOrders = await this.orderRepository.find({
      where: {
        createdAt: Between(previousStartDate, previousEndDate),
      },
      relations: ['items', 'items.product'],
    });

    const currentTotalSales = currentOrders.reduce(
      (sum, order) => sum + Number(order.total),
      0,
    );
    const currentTotalOrders = currentOrders.length;
    const currentAvgOrderValue =
      currentTotalOrders > 0 ? currentTotalSales / currentTotalOrders : 0;

    const previousTotalSales = previousOrders.reduce(
      (sum, order) => sum + Number(order.total),
      0,
    );
    const previousTotalOrders = previousOrders.length;
    const previousAvgOrderValue =
      previousTotalOrders > 0 ? previousTotalSales / previousTotalOrders : 0;

    const salesChange =
      previousTotalSales > 0
        ? ((currentTotalSales - previousTotalSales) / previousTotalSales) * 100
        : 0;
    const ordersChange =
      previousTotalOrders > 0
        ? ((currentTotalOrders - previousTotalOrders) / previousTotalOrders) * 100
        : 0;
    const avgOrderValueChange =
      previousAvgOrderValue > 0
        ? ((currentAvgOrderValue - previousAvgOrderValue) / previousAvgOrderValue) * 100
        : 0;

    const topProducts = await this.getTopProducts(currentOrders);

    const salesByDate = this.groupSalesByDate(currentOrders, startDate, endDate, period);
    const previousSalesByDate = this.groupSalesByDate(
      previousOrders,
      previousStartDate,
      previousEndDate,
      period,
    );

    return {
      period,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      totalSales: currentTotalSales,
      totalOrders: currentTotalOrders,
      averageOrderValue: currentAvgOrderValue,
      topProducts,
      salesByDate,
      comparison: {
        previousPeriod: {
          startDate: previousStartDate.toISOString().split('T')[0],
          endDate: previousEndDate.toISOString().split('T')[0],
          totalSales: previousTotalSales,
          totalOrders: previousTotalOrders,
          averageOrderValue: previousAvgOrderValue,
          salesByDate: previousSalesByDate,
        },
        salesChange,
        ordersChange,
        avgOrderValueChange,
      },
    };
  }

  private async getTopProducts(orders: Order[]) {
    const productSales = new Map<string, { sales: number; quantity: number; name: string }>();

    orders.forEach((order) => {
      order.items.forEach((item) => {
        const productId = toStringId(item.product.id);
        const existing = productSales.get(productId) || {
          sales: 0,
          quantity: 0,
          name: item.product.name,
        };
        existing.sales += Number(item.price);
        existing.quantity += item.quantity;
        productSales.set(productId, existing);
      });
    });

    return Array.from(productSales.values())
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);
  }

  private groupSalesByDate(
    orders: Order[],
    startDate: Date,
    endDate: Date,
    period: ReportPeriod,
  ) {
    const salesMap = new Map<string, { sales: number; orders: number }>();

    orders.forEach((order) => {
      const dateKey = this.getDateKey(order.createdAt, period);
      const existing = salesMap.get(dateKey) || { sales: 0, orders: 0 };
      existing.sales += Number(order.total);
      existing.orders += 1;
      salesMap.set(dateKey, existing);
    });

    const result = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateKey = this.getDateKey(current, period);
      const data = salesMap.get(dateKey) || { sales: 0, orders: 0 };
      result.push({
        date: current.toISOString().split('T')[0],
        sales: data.sales,
        orders: data.orders,
      });
      current.setDate(current.getDate() + 1);
    }

    return result;
  }

  private getDateKey(date: Date, period: ReportPeriod): string {
    if (period === ReportPeriod.YEARLY) {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${date.getFullYear()}-${month}`;
    }
    return date.toISOString().split('T')[0];
  }
}

