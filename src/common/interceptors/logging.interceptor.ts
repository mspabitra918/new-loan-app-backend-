import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { redactUrl } from '../utils/redact';

/**
 * Logs method, path and duration only. Request and response bodies are never
 * logged - the application carries SSNs and bank credentials, and a log line
 * is the easiest way to leak one.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest();
    const started = Date.now();
    const route = redactUrl(req.originalUrl || req.url);

    return next.handle().pipe(
      tap({
        next: () => {
          const status = ctx.switchToHttp().getResponse().statusCode;
          this.logger.log(`${req.method} ${route} ${status} ${Date.now() - started}ms`);
        },
        error: (err) => {
          const status = err?.status ?? 500;
          this.logger.warn(`${req.method} ${route} ${status} ${Date.now() - started}ms`);
        },
      }),
    );
  }
}
