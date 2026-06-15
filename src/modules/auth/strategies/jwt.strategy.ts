import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'super-secret-jwt-key-2026'),
      passReqToCallback: true, // Enables injecting the express Request object into validate()
    });
  }

  async validate(req: Request, payload: any) {
    const requestTenantId = (req as any).tenantId;

    // Cross-tenant verification: JWT tenant claim must match the current request tenant context
    if (!requestTenantId || payload.tenantId !== requestTenantId) {
      throw new UnauthorizedException('Security Breach: Authenticated token does not belong to the requested tenant.');
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
    };
  }
}
