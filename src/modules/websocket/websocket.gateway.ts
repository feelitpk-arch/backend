import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Admin } from '../../entities/admin.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

interface AuthenticatedSocket extends Socket {
  adminId?: string;
  admin?: Admin;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/admin',
})
export class AdminWebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private connectedAdmins = new Map<string, AuthenticatedSocket>();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        (client as any).disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET', 'your-secret-key'),
      });

      // Trust the token if it's valid (stateless JWT authentication)
      // Don't require admin lookup in database
      if (!payload || !payload.sub) {
        (client as any).disconnect();
        return;
      }

      client.adminId = payload.sub;
      this.connectedAdmins.set(payload.sub, client);

      (client as any).emit('connected', {
        message: 'Connected to admin real-time updates',
        adminId: payload.sub,
      });
    } catch (error) {
      (client as any).disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.adminId) {
      this.connectedAdmins.delete(client.adminId);
    }
  }

  private extractToken(client: Socket): string | null {
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return client.handshake.auth?.token || null;
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: AuthenticatedSocket) {
    return { event: 'pong', data: { timestamp: new Date().toISOString() } };
  }

  emitToAll(event: string, data: any) {
    this.server.emit(event, data);
  }

  emitToAdmin(adminId: string, event: string, data: any) {
    const client = this.connectedAdmins.get(adminId);
    if (client) {
      (client as any).emit(event, data);
    }
  }

  emitNewOrder(order: any) {
    this.emitToAll('new-order', order);
  }

  emitOrderStatusChange(orderId: string, status: string, order: any) {
    this.emitToAll('order-status-changed', {
      orderId,
      status,
      order,
      timestamp: new Date().toISOString(),
    });
  }

  emitProductCreated(product: any) {
    this.emitToAll('product-created', product);
  }

  emitProductUpdated(product: any) {
    this.emitToAll('product-updated', product);
  }

  emitProductDeleted(productId: string) {
    this.emitToAll('product-deleted', {
      productId,
      timestamp: new Date().toISOString(),
    });
  }

  emitCategoryCreated(category: any) {
    this.emitToAll('category-created', category);
  }

  emitCategoryUpdated(category: any) {
    this.emitToAll('category-updated', category);
  }

  emitCategoryDeleted(categoryId: string) {
    this.emitToAll('category-deleted', {
      categoryId,
      timestamp: new Date().toISOString(),
    });
  }

  emitAnalyticsUpdate(analytics: any) {
    this.emitToAll('analytics-update', analytics);
  }
}

