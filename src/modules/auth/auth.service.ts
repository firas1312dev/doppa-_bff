import {
  Injectable,
  Inject,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Scope,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantUser } from '../tenant/entities/tenant-user.entity';
import { Admin } from './entities/admin.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { PasswordReset } from './entities/password-reset.entity';
import { verifyPassword } from '../../common/utils/password.util';
import { TenantMembersService } from '../admin/tenant-members.service';

@Injectable({ scope: Scope.REQUEST })
export class AuthService {
  constructor(
    @InjectRepository(UserProfile)
    private readonly userRepo: Repository<UserProfile>,
    @InjectRepository(TenantUser)
    private readonly tenantUserRepo: Repository<TenantUser>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(Admin)
    private readonly adminRepo: Repository<Admin>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(PasswordReset)
    private readonly passwordResetRepo: Repository<PasswordReset>,
    @Inject(REQUEST)
    private readonly request: any,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly tenantMembersService: TenantMembersService,
  ) {}

  private buildTokenPair(payload: Record<string, any>, role: string, tenantId: string, userId: string) {
    const accessToken = this.jwtService.sign(payload);
    const refreshTokenValue = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30-day refresh token

    const refreshTokenEntity = this.refreshTokenRepo.create({
      userId,
      tenantId,
      token: refreshTokenValue,
      role,
      expiresAt,
    });

    return { accessToken, refreshTokenEntity, refreshToken: refreshTokenValue };
  }

  async login(email: string, pass: string) {
    const tenantId = this.request.tenantId;
    const normalizedEmail = email.trim().toLowerCase();

    const user = await this.resolveMemberForLogin(tenantId, normalizedEmail, pass);
    if (!user) {
      throw new UnauthorizedException(
        'Identifiants incorrects. Vérifiez votre email, mot de passe et la salle sélectionnée.',
      );
    }

    const tenantMembership = await this.tenantUserRepo.findOne({
      where: { tenantId, globalUserId: user.globalId },
    });
    if (!tenantMembership) {
      throw new UnauthorizedException('Ce compte n\'est pas inscrit dans cette salle.');
    }

    const payload = {
      sub: user.globalId,
      email: user.email,
      tenantId,
      role: 'MEMBER',
    };

    const { accessToken, refreshTokenEntity, refreshToken } = this.buildTokenPair(
      payload,
      'MEMBER',
      tenantId,
      user.globalId,
    );
    await this.refreshTokenRepo.save(refreshTokenEntity);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.configService.get<string>('JWT_EXPIRATION', '24h'),
      user: {
        id: user.globalId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    };
  }

  /**
   * 1) Membre central (tenant_users) — inscription mobile ou déjà synchronisé
   * 2) Membre web — compte uniquement dans la base tenant de la salle
   */
  private async resolveMemberForLogin(
    tenantId: string,
    normalizedEmail: string,
    pass: string,
  ): Promise<UserProfile | null> {
    const central = await this.userRepo
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email: normalizedEmail })
      .andWhere('u.is_active = 1')
      .andWhere('u.deleted_at IS NULL')
      .getOne();

    if (central) {
      const centralPasswordOk = await verifyPassword(pass, central.password);
      if (centralPasswordOk) {
        const link = await this.tenantUserRepo.findOne({
          where: { tenantId, globalUserId: central.globalId },
        });
        if (link) return central;
      }
    }

    return this.tenantMembersService.authenticateAndSyncMember(
      tenantId,
      normalizedEmail,
      pass,
    );
  }

  /**
   * Connexion propriétaire / gérant de salle.
   * Le propriétaire est l'utilisateur dont l'email correspond à `tenants.email`
   * pour la salle sélectionnée (même modèle que le dashboard web gympify).
   * Les super-admins plateforme (`admins`) restent acceptés en secours.
   */
  async loginAdmin(email: string, pass: string) {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException('Veuillez sélectionner une salle avant de vous connecter.');
    }

    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId, status: 'Active' },
    });
    if (!tenant) {
      throw new UnauthorizedException('Salle introuvable ou inactive.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const ownerEmail = tenant.email?.trim().toLowerCase();

    // 1) Propriétaire de salle : email utilisateur = email de la salle
    const owner = await this.userRepo.findOne({
      where: { email: normalizedEmail, isActive: true },
    });

    if (owner && ownerEmail && normalizedEmail === ownerEmail) {
      const isPasswordValid = await verifyPassword(pass, owner.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Identifiants incorrects.');
      }

      const payload = {
        sub: owner.globalId,
        email: owner.email,
        tenantId,
        role: 'ADMIN',
        guard: 'owners',
        gymName: tenant.name,
      };

      const { accessToken, refreshTokenEntity, refreshToken } = this.buildTokenPair(
        payload,
        'ADMIN',
        tenantId,
        owner.globalId,
      );
      await this.refreshTokenRepo.save(refreshTokenEntity);

      return {
        accessToken,
        refreshToken,
        expiresIn: this.configService.get<string>('JWT_EXPIRATION', '24h'),
        user: {
          id: owner.globalId,
          email: owner.email,
          firstName: owner.firstName,
          lastName: owner.lastName,
          gymName: tenant.name,
          isOwner: true,
        },
      };
    }

    // 2) Super-admin plateforme (table `admins`) — accès transversal
    const admin = await this.adminRepo.findOne({ where: { email: normalizedEmail, isActive: true } });
    if (!admin) {
      throw new UnauthorizedException(
        'Identifiants incorrects. Utilisez l\'email du propriétaire de la salle sélectionnée.',
      );
    }

    const isPasswordValid = await verifyPassword(pass, admin.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Identifiants incorrects.');
    }

    const payload = {
      sub: String(admin.id),
      email: admin.email,
      tenantId,
      role: 'ADMIN',
      guard: 'admins',
      isSuperAdmin: !!admin.isSuperAdmin,
      gymName: tenant.name,
    };

    const { accessToken, refreshTokenEntity, refreshToken } = this.buildTokenPair(
      payload,
      'ADMIN',
      tenantId,
      String(admin.id),
    );
    await this.refreshTokenRepo.save(refreshTokenEntity);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.configService.get<string>('JWT_EXPIRATION', '24h'),
      user: {
        id: String(admin.id),
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        gymName: tenant.name,
        isSuperAdmin: !!admin.isSuperAdmin,
        isOwner: false,
      },
    };
  }

  async register(dto: {
    email: string;
    firstName: string;
    lastName: string;
    passwordHash: string;
    phoneNumber?: string;
  }) {
    const tenantId = this.request.tenantId;

    // Check if user already exists
    let user = await this.userRepo.findOne({ where: { email: dto.email } });
    
    if (user) {
      // S'il existe, vérifier s'il est déjà dans ce tenant
      const existingMembership = await this.tenantUserRepo.findOne({
        where: { tenantId, globalUserId: user.globalId }
      });
      if (existingMembership) {
        throw new BadRequestException('User with this email already exists in this tenant.');
      }
    } else {
      // Créer un nouvel utilisateur global
      const hashedPassword = await bcrypt.hash(dto.passwordHash, 10);
      user = this.userRepo.create({
        globalId: uuidv4(),
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        password: hashedPassword,
        phoneNumber: dto.phoneNumber,
        isActive: true,
        status: 'Active',
      });
      user = await this.userRepo.save(user);
    }

    // Associer l'utilisateur au tenant
    const tenantUser = this.tenantUserRepo.create({
      tenantId: tenantId,
      globalUserId: user.globalId,
    });
    await this.tenantUserRepo.save(tenantUser);

    this.eventEmitter.emit('member.created', {
      tenantId,
      userId: user.globalId,
      type: 'MEMBER',
    });

    const { password, ...result } = user;
    return result;
  }

  async refreshAccessToken(refreshTokenValue: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
  }> {
    const tokenEntity = await this.refreshTokenRepo.findOne({
      where: { token: refreshTokenValue, revokedAt: undefined as any },
    });

    if (!tokenEntity || tokenEntity.revokedAt) {
      throw new UnauthorizedException('Invalid or revoked refresh token.');
    }

    if (new Date() > tokenEntity.expiresAt) {
      throw new UnauthorizedException('Refresh token has expired. Please log in again.');
    }

    // Cross-tenant verification
    const requestTenantId = this.request.tenantId;
    if (requestTenantId && tokenEntity.tenantId !== requestTenantId) {
      throw new UnauthorizedException('Refresh token does not belong to the requested tenant.');
    }

    // Revoke old token (rotation)
    tokenEntity.revokedAt = new Date();
    await this.refreshTokenRepo.save(tokenEntity);

    // Build new token pair
    const payload = {
      sub: tokenEntity.userId,
      tenantId: tokenEntity.tenantId,
      role: tokenEntity.role,
    };

    if (tokenEntity.role === 'ADMIN') {
      const owner = await this.userRepo.findOne({ where: { globalId: tokenEntity.userId } });
      if (owner) {
        (payload as any).guard = 'owners';
        (payload as any).email = owner.email;
      } else {
        const admin = await this.adminRepo.findOne({ where: { id: parseInt(tokenEntity.userId, 10) as any } });
        if (admin) {
          (payload as any).guard = 'admins';
          (payload as any).isSuperAdmin = !!admin.isSuperAdmin;
          (payload as any).email = admin.email;
        }
      }
    } else {
      const user = await this.userRepo.findOne({ where: { globalId: tokenEntity.userId } });
      if (user) {
        (payload as any).email = user.email;
      }
    }

    const { accessToken, refreshTokenEntity, refreshToken } = this.buildTokenPair(
      payload,
      tokenEntity.role,
      tokenEntity.tenantId,
      tokenEntity.userId,
    );
    await this.refreshTokenRepo.save(refreshTokenEntity);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.configService.get<string>('JWT_EXPIRATION', '24h'),
    };
  }

  async revokeRefreshToken(refreshTokenValue: string): Promise<void> {
    const tokenEntity = await this.refreshTokenRepo.findOne({
      where: { token: refreshTokenValue },
    });
    if (tokenEntity && !tokenEntity.revokedAt) {
      tokenEntity.revokedAt = new Date();
      await this.refreshTokenRepo.save(tokenEntity);
    }
  }

  async revokeAllUserTokens(userId: string, tenantId: string): Promise<void> {
    await this.refreshTokenRepo
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('userId = :userId AND tenantId = :tenantId AND revokedAt IS NULL', { userId, tenantId })
      .execute();
  }

  async forgotPassword(email: string): Promise<{ message: string; resetToken?: string }> {
    const user = await this.userRepo.findOne({ where: { email, isActive: true } });

    // Always return success to avoid email enumeration
    if (!user) {
      return { message: 'If that email is registered, a reset link has been sent.' };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(rawToken, 10);

    // Upsert reset token
    const existing = await this.passwordResetRepo.findOne({ where: { email } });
    if (existing) {
      existing.token = hashedToken;
      (existing as any).createdAt = new Date();
      await this.passwordResetRepo.save(existing);
    } else {
      const resetRecord = this.passwordResetRepo.create({ email, token: hashedToken });
      await this.passwordResetRepo.save(resetRecord);
    }

    // In production, send email here. For now return token in dev mode.
    const isDev = this.configService.get<string>('NODE_ENV') !== 'production';
    return {
      message: 'If that email is registered, a reset link has been sent.',
      ...(isDev && { resetToken: rawToken }),
    };
  }

  async resetPassword(email: string, rawToken: string, newPassword: string): Promise<{ message: string }> {
    const resetRecord = await this.passwordResetRepo.findOne({ where: { email } });

    if (!resetRecord) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }

    // Token expires after 60 minutes
    const tokenAge = Date.now() - new Date(resetRecord.createdAt).getTime();
    if (tokenAge > 60 * 60 * 1000) {
      await this.passwordResetRepo.delete({ email });
      throw new BadRequestException('Password reset token has expired. Please request a new one.');
    }

    const isValid = await bcrypt.compare(rawToken, resetRecord.token);
    if (!isValid) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }

    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await this.userRepo.save(user);

    // Delete used reset token
    await this.passwordResetRepo.delete({ email });

    // Revoke all refresh tokens for security
    await this.revokeAllUserTokens(user.globalId, this.request.tenantId ?? '');

    return { message: 'Password reset successfully. Please log in with your new password.' };
  }
}

