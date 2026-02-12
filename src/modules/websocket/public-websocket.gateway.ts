import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/public',
})
export class PublicWebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log('Public client connected:', client.id);
    client.emit('connected', {
      message: 'Connected to public real-time updates',
    });
  }

  handleDisconnect(client: Socket) {
    console.log('Public client disconnected:', client.id);
  }

  emitToAll(event: string, data: any) {
    this.server.emit(event, data);
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
}

