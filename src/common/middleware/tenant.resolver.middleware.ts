import { Injectable, NestMiddleware, UnauthorizedException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../../modules/tenant/entities/tenant.entity';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class TenantResolverMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantResolverMiddleware.name);

  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    let tenantId: string | undefined;

    // 1. Resolve from X-Tenant-ID Header
    const headerTenant = req.headers['x-tenant-id'];
    if (headerTenant && typeof headerTenant === 'string') {
      tenantId = headerTenant.trim().toLowerCase();
    }

    // 2. Resolve from Subdomain if not found in header
    if (!tenantId) {
      const hostname = req.hostname.toLowerCase().trim();
      const centralDomains = (process.env.CENTRAL_DOMAINS || 'vps-cf0e7d7b.vps.ovh.net,localhost,127.0.0.1')
        .split(',')
        .map(d => d.trim().toLowerCase());

      if (!centralDomains.includes(hostname)) {
        for (const centralDomain of centralDomains) {
          if (hostname.endsWith(`.${centralDomain}`)) {
            const subdomain = hostname.substring(0, hostname.length - centralDomain.length - 1);
            const reserved = ['admin', 'www', 'api', 'mail', 'portal', 'central', 'localhost', '127'];
            if (!reserved.includes(subdomain)) {
              tenantId = subdomain;
              break;
            }
          }
        }
      }

      if (!tenantId && !hostname.includes('.') && hostname !== 'localhost') {
        tenantId = hostname;
      }
    }

    // 3. Resolve from JWT Token
    if (!tenantId && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const decoded = jwt.decode(token) as any;
          if (decoded && decoded.tenantId) {
            tenantId = decoded.tenantId.trim().toLowerCase();
          }
        } catch (err) {
          this.logger.warn('Failed to decode JWT to extract tenant ID during resolution');
        }
      }
    }

    if (!tenantId) {
      const path = req.path;
      if (
        path === '/health' ||
        path === '/api/v1/health' ||
        path.startsWith('/api/v1/tenant') ||
        path.startsWith('/api/v1/analytics/central') ||
        // Téléchargement CSV public (autorisation via ?token= signé)
        path.startsWith('/api/v1/admin/members/export/download') ||
        // Login téléphone / admin sans salle pré-sélectionnée
        path === '/api/v1/auth/login' ||
        path === '/api/v1/auth/users/login' ||
        path === '/api/v1/auth/login-phone' ||
        path === '/api/v1/auth/admins/login' ||
        path === '/api/v1/auth/owners/login' ||
        path === '/api/v1/auth/forgot-password' ||
        path === '/api/v1/auth/reset-password'
      ) {
        return next();
      }
      throw new UnauthorizedException('Tenant context could not be resolved. Provide X-Tenant-ID header, a tenant subdomain, or a valid tenant JWT.');
    }

    // Verify tenant exists and is active
    const tenant = await this.tenantRepo.findOne({ 
      where: [
        { id: tenantId, status: 'Active' },
        { identifier: tenantId, status: 'Active' }
      ]
    });
    if (!tenant) {
      throw new UnauthorizedException(`Tenant '${tenantId}' is inactive or does not exist.`);
    }

    // Attach resolved tenant details to request object
    (req as any).tenantId = tenant.id;

    next();
  }
}
