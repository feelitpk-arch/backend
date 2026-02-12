import { Injectable } from '@nestjs/common';
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as tls from 'tls';
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

    // Ensure TLS is explicit for Atlas (helps with Render/OpenSSL 3.x)
    const separator = connectionUrl.includes('?') ? '&' : '?';
    if (!connectionUrl.includes('tls=true') && !connectionUrl.includes('ssl=true')) {
      connectionUrl = `${connectionUrl}${separator}tls=true`;
    }

    // OpenSSL 3.x compatibility with MongoDB Atlas (fixes TLS alert 80 / internal error)
    // Driver requires a real tls.SecureContext, not a plain object
    const secureContext = tls.createSecureContext({
      secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    });

    return {
      type: 'mongodb',
      url: connectionUrl,
      entities: [Admin, Product, Category, Order, OrderItem],
      synchronize: this.configService.get<string>('NODE_ENV') !== 'production',
      logging: false,
      extra: {
        tls: true,
        secureContext,
      } as any,
    };
  }
}

