import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;
    
    console.log('🛡️ JWT Guard: Checking authentication', {
      endpoint: request.url,
      hasAuthHeader: !!authHeader,
      authHeaderPreview: authHeader ? authHeader.substring(0, 30) + '...' : 'none',
    });

    // Call parent canActivate which returns a Promise/Observable
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      const request = context.switchToHttp().getRequest();
      console.error('❌ JWT Guard: Authentication failed', {
        endpoint: request.url,
        error: err?.message,
        info: info?.message || info,
        hasUser: !!user,
      });
      throw err || new UnauthorizedException('Authentication failed');
    }
    console.log('✅ JWT Guard: Authentication successful', {
      endpoint: context.switchToHttp().getRequest().url,
      userId: user?.userId,
      username: user?.username,
    });
    return user;
  }
}

