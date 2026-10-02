import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { redact, redactUrl } from '../utils/redact';

/**
 * Uniform error envelope. Validation errors come back as a field map so the
 * form can show each message inline - and never clears the field (UX rule 1).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let body: Record<string, unknown> = { message: 'Something went wrong on our side.' };

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      body = typeof response === 'string' ? { message: response } : { ...(response as object) };
    } else {
      // Full stack goes to the server log, never to the client.
      this.logger.error(
        `Unhandled error on ${req.method} ${redactUrl(req.originalUrl || req.url)}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: redactUrl(req.originalUrl || req.url),
      ...redact(body),
    });
  }
}
