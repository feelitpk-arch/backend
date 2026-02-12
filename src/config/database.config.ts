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

    // Explicit TLS for Atlas; tlsAllowInvalidCertificates works around OpenSSL 3.x / Node 22 TLS alert 80 on Render
    const separator = connectionUrl.includes('?') ? '&' : '?';
    const params: string[] = [];
    if (!connectionUrl.includes('tls=true') && !connectionUrl.includes('ssl=true')) {
      params.push('tls=true');
    }
    if (!connectionUrl.includes('tlsAllowInvalidCertificates')) {
      params.push('tlsAllowInvalidCertificates=true');
    }
    if (params.length > 0) {
      connectionUrl = `${connectionUrl}${separator}${params.join('&')}`;
    }

    return {
      type: 'mongodb',
      url: connectionUrl,
      entities: [Admin, Product, Category, Order, OrderItem],
      synchronize: this.configService.get<string>('NODE_ENV') !== 'production',
      logging: false,
      extra: {
        // Force IPv4 – avoids "tlsv1 alert internal error" when Node 17+ resolves Atlas to IPv6
        family: 4,
        connectTimeoutMS: 15000,
        serverSelectionTimeoutMS: 15000,
        tls: true,
        tlsAllowInvalidCertificates: true,
      },
    };
  }
}

