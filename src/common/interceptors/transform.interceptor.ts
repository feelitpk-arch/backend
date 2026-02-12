import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && 'sizes' in data && typeof data.sizes === 'string') {
          data.sizes = data.sizes.split(',').map(Number);
        }
        if (data && typeof data === 'object' && 'gallery' in data && typeof data.gallery === 'string') {
          data.gallery = data.gallery.split(',');
        }
        return data;
      }),
    );
  }
}

