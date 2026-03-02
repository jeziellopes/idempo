import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CORRELATION_ID_HEADER } from '../middleware/correlation-id.middleware.js';

export interface ErrorBody {
  error: string;
  detail: string;
  correlationId: string;
}

/**
 * Global exception filter — normalises all unhandled errors to the contract:
 *   { error: "MACHINE_READABLE_CODE", detail: "...", correlationId: "uuid" }
 *
 * See docs/API.md § Error Format.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const correlationId =
      (req.headers[CORRELATION_ID_HEADER] as string | undefined) ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'INTERNAL_SERVER_ERROR';
    let detail = 'An unexpected error occurred.';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        detail = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        // ValidationPipe returns { message: string[] } — flatten to a readable string
        if (Array.isArray(b['message'])) {
          detail = (b['message'] as string[]).join('; ');
        } else if (typeof b['message'] === 'string') {
          detail = b['message'];
        }
      }

      error = httpStatusToCode(status);
    } else if (exception instanceof Error) {
      this.logger.error({ err: exception, correlationId }, 'Unhandled exception');
    }

    const body: ErrorBody = { error, detail, correlationId };
    res.status(status).json(body);
  }
}

function httpStatusToCode(status: number): string {
  const map: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    402: 'PAYMENT_REQUIRED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_SERVER_ERROR',
    501: 'NOT_IMPLEMENTED',
    503: 'SERVICE_UNAVAILABLE',
  };
  return map[status] ?? `HTTP_${status}`;
}
