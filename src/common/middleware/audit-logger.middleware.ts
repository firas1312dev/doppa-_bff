import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class AuditLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('AuditLogger');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('user-agent') || '';
    const startTime = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;
      const tenantId = (req as any).tenantId || 'NO_TENANT';
      const user = (req as any).user ? (req as any).user.sub : 'ANONYMOUS';

      this.logger.log(
        `[AUDIT] Tenant: ${tenantId} | User: ${user} | IP: ${ip} | ${method} ${originalUrl} -> HTTP ${statusCode} in ${duration}ms | Agent: ${userAgent}`,
      );
    });

    next();
  }
}
