import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminWebSocketGateway } from './websocket.gateway';
import { PublicWebSocketGateway } from './public-websocket.gateway';
import { Admin } from '../../entities/admin.entity';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forFeature([Admin]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'your-secret-key'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [AdminWebSocketGateway, PublicWebSocketGateway],
  exports: [AdminWebSocketGateway, PublicWebSocketGateway],
})
export class WebSocketModule {}

