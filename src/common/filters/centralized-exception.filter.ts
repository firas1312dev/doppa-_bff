import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class CentralizedExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(CentralizedExceptionFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const tenantId = (request as any).tenantId || 'UNKNOWN';

    // Logging details
    this.logger.error(
      `[Exception] Status: ${status} | Path: ${request.url} | Tenant: ${tenantId} | Error: ${
        exception.message || JSON.stringify(exception)
      }`,
      exception.stack,
    );

    // Format final response for mobile
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      tenantId,
      error: typeof message === 'object' ? (message as any).error : message,
      message: typeof message === 'object' ? (message as any).message : message,
    });
  }
}
