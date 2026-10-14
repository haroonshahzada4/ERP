import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

type ErrorBody = {
  statusCode: number;
  code: string;
  message: string | string[];
  requestId: string;
  details?: unknown;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const requestId =
      (typeof request.id === 'string' && request.id) ||
      (request.headers['x-request-id'] as string) ||
      randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const obj = body as Record<string, unknown>;
        message = (obj.message as string | string[]) ?? exception.message;
        if (obj.error && typeof obj.error === 'string') {
          code = obj.error.toUpperCase().replace(/\s+/g, '_');
        }
        if (Array.isArray(obj.message)) {
          code = 'VALIDATION_ERROR';
          details = obj.message;
        }
      }
      if (code === 'INTERNAL_ERROR') {
        code = HttpStatus[status] ?? 'HTTP_ERROR';
      }
    }

    const payload: ErrorBody = {
      statusCode: status,
      code: String(code),
      message,
      requestId,
    };
    if (details !== undefined) payload.details = details;

    response.status(status).json(payload);
  }
}
