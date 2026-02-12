import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'your-secret-key'),
    });
  }

  async validate(payload: any) {
    console.log('🔐 JWT Strategy validate called', { 
      sub: payload.sub, 
      username: payload.username,
      payloadKeys: Object.keys(payload)
    });
    
    try {
      const admin = await this.authService.validateUser(payload.sub);
      if (!admin) {
        console.error('❌ JWT Strategy: Admin not found for userId:', payload.sub);
        throw new UnauthorizedException('Admin not found');
      }
      console.log('✅ JWT Strategy: Admin validated successfully', { adminId: admin.id });
      return { userId: payload.sub, username: payload.username };
    } catch (error) {
      console.error('❌ JWT Strategy validation error:', error);
      throw new UnauthorizedException('Token validation failed');
    }
  }
}

