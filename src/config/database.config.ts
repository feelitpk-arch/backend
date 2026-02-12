import { Injectable } from '@nestjs/common';
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Admin } from '../entities/admin.entity';
import { Product } from '../entities/product.entity';
import { Category } from '../entities/category.entity';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';

@Injectable()
export class DatabaseConfig implements TypeOrmOptionsFactory {
  constructor(private configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    const mongoUrl = this.configService.get<string>('MONGODB_URI');

    if (!mongoUrl) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    // Add database name if not present in connection string
    let connectionUrl = mongoUrl;
    if (!connectionUrl.match(/mongodb\+srv:\/\/[^/]+\/[^?]/)) {
      const dbName = 'bavari';
      if (connectionUrl.includes('?')) {
        connectionUrl = connectionUrl.replace('/?', '?');
        connectionUrl = connectionUrl.replace('?', `/${dbName}?`);
      } else {
        connectionUrl = connectionUrl + `/${dbName}`;
      }
    }

    // Explicit TLS for Atlas (add to URL if missing)
    const separator = connectionUrl.includes('?') ? '&' : '?';
    if (!connectionUrl.includes('tls=true') && !connectionUrl.includes('ssl=true')) {
      connectionUrl = `${connectionUrl}${separator}tls=true`;
    }

    return {
      type: 'mongodb',
      url: connectionUrl,
      entities: [Admin, Product, Category, Order, OrderItem],
      synchronize: this.configService.get<string>('NODE_ENV') !== 'production',
      logging: false,
      extra: {
        tls: true,
      },
    };
  }
}

