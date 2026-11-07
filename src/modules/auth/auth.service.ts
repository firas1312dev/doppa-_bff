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
import { Repository } from 'typeorm';
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
import { normalizePhone, phoneSqlExpr } from '../../common/utils/phone.util';
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
    expiresAt.setDate(expiresAt.getDate() + 30);

    const refreshTokenEntity = this.refreshTokenRepo.create({
      userId,
      tenantId,
      token: refreshTokenValue,
      role,
      expiresAt,
    });

    return { accessToken, refreshTokenEntity, refreshToken: refreshTokenValue };
  }

  /** Legacy email login (nécessite X-Tenant-ID). */
  async login(email: string, pass: string) {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new UnauthorizedException(
        'Utilisez le login par téléphone, ou fournissez une salle.',
      );
    }
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

    return this.issueMemberTokens(user, tenantId);
  }

  /**
   * Login mobile principal : téléphone + mot de passe.
   * - Membre trouvé → connexion auto à la salle
   * - Numéro inconnu → session VISITOR
   * - Numéro connu mais mauvais MDP → erreur
   */
  async loginByPhone(phone: string, pass: string) {
    const normalized = normalizePhone(phone);
    if (!normalized || normalized.length < 6) {
      throw new BadRequestException('Numéro de téléphone invalide.');
    }
    if (!pass?.trim()) {
      throw new BadRequestException('Mot de passe requis.');
    }

    const phoneExpr = phoneSqlExpr('phone_number');
    const centralRows = await this.userRepo.manager.query(
      `SELECT * FROM users
       WHERE deleted_at IS NULL AND is_active = 1
         AND phone_number IS NOT NULL AND phone_number <> ''
         AND ${phoneExpr} = ?
       LIMIT 1`,
      [normalized],
    );
    const centralRow = centralRows?.[0];

    if (centralRow) {
      const passwordOk = await verifyPassword(pass, centralRow.password);
      if (!passwordOk) {
        throw new UnauthorizedException('Identifiants incorrects.');
      }

      const central = await this.userRepo.findOne({
        where: { globalId: centralRow.global_id },
      });
      if (!central) {
        return this.issueVisitorSession(normalized);
      }

      const memberships = await this.tenantUserRepo.find({
        where: { globalUserId: central.globalId },
      });
      const membership = memberships[memberships.length - 1];

      if (membership) {
        const tenant = await this.tenantRepo.findOne({
          where: { id: membership.tenantId, status: 'Active' },
        });
        if (tenant) {
          return this.issueMemberTokens(central, tenant.id, tenant.name);
        }
      }

      return this.issueVisitorSession(normalized, central.firstName, central.lastName);
    }

    const tenantLookup = await this.tenantMembersService.lookupMemberByPhoneAcrossTenants(
      phone,
      pass,
    );

    if (tenantLookup.status === 'authenticated') {
      return this.issueMemberTokens(
        tenantLookup.user,
        tenantLookup.tenantId,
        tenantLookup.gymName,
      );
    }

    if (tenantLookup.status === 'wrong_password') {
      throw new UnauthorizedException('Identifiants incorrects.');
    }

    // Numéro inconnu dans toutes les salles → visiteur
    return this.issueVisitorSession(normalized);
  }

  private async issueMemberTokens(
    user: UserProfile,
    tenantId: string,
    gymName?: string | null,
  ) {
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

    let resolvedGymName = gymName ?? null;
    if (!resolvedGymName) {
      const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
      resolvedGymName = tenant?.name ?? null;
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: this.configService.get<string>('JWT_EXPIRATION', '24h'),
      role: 'MEMBER' as const,
      tenantId,
      gymName: resolvedGymName,
      user: {
        id: user.globalId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        gymName: resolvedGymName,
      },
    };
  }

  private issueVisitorSession(
    phoneNormalized: string,
    firstName?: string,
    lastName?: string,
  ) {
    return {
      accessToken: null,
      refreshToken: null,
      expiresIn: null,
      role: 'VISITOR' as const,
      tenantId: null,
      gymName: null,
      user: {
        id: `visitor:${phoneNormalized}`,
        email: null,
        firstName: firstName || 'Visiteur',
        lastName: lastName || '',
        phoneNumber: phoneNormalized,
        isVisitor: true,
      },
    };
  }

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
   * Connexion propriétaire : résout la salle via tenants.email si pas de X-Tenant-ID.
   */
  async loginAdmin(email: string, pass: string) {
    const normalizedEmail = email.trim().toLowerCase();
    let tenantId = this.request.tenantId as string | undefined;

    if (!tenantId) {
      const tenantByEmail = await this.tenantRepo
        .createQueryBuilder('t')
        .where('LOWER(t.email) = :email', { email: normalizedEmail })
        .andWhere('t.status = :status', { status: 'Active' })
        .getOne();
      tenantId = tenantByEmail?.id;
    }

    if (!tenantId) {
      return this.loginPlatformAdmin(normalizedEmail, pass);
    }

    const tenant = await this.tenantRepo.findOne({
      where: { id: tenantId, status: 'Active' },
    });
    if (!tenant) {
      throw new UnauthorizedException('Salle introuvable ou inactive.');
    }

    const ownerEmail = tenant.email?.trim().toLowerCase();
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
        role: 'ADMIN' as const,
        tenantId,
        gymName: tenant.name,
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

    return this.loginPlatformAdmin(normalizedEmail, pass, tenantId, tenant.name);
  }

  private async loginPlatformAdmin(
    normalizedEmail: string,
    pass: string,
    tenantId?: string,
    gymName?: string,
  ) {
    const admin = await this.adminRepo.findOne({
      where: { email: normalizedEmail, isActive: true },
    });
    if (!admin) {
      throw new UnauthorizedException('Identifiants incorrects.');
    }

    const isPasswordValid = await verifyPassword(pass, admin.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Identifiants incorrects.');
    }

    const resolvedTenantId = tenantId ?? this.request.tenantId;
    if (!resolvedTenantId) {
      throw new UnauthorizedException(
        'Super-admin : connectez-vous avec l\'email propriétaire de la salle.',
      );
    }

    const payload = {
      sub: String(admin.id),
      email: admin.email,
      tenantId: resolvedTenantId,
      role: 'ADMIN',
      guard: 'admins',
      isSuperAdmin: !!admin.isSuperAdmin,
      gymName,
    };

    const { accessToken, refreshTokenEntity, refreshToken } = this.buildTokenPair(
      payload,
      'ADMIN',
      resolvedTenantId,
      String(admin.id),
    );
    await this.refreshTokenRepo.save(refreshTokenEntity);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.configService.get<string>('JWT_EXPIRATION', '24h'),
      role: 'ADMIN' as const,
      tenantId: resolvedTenantId,
      gymName: gymName ?? null,
      user: {
        id: String(admin.id),
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
        gymName: gymName ?? null,
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

    let user = await this.userRepo.findOne({ where: { email: dto.email } });
    let hashedPassword: string;

    if (user) {
      const existingMembership = await this.tenantUserRepo.findOne({
        where: { tenantId, globalUserId: user.globalId },
      });
      if (existingMembership) {
        throw new BadRequestException('User with this email already exists in this tenant.');
      }
      hashedPassword = user.password;
    } else {
      hashedPassword = await bcrypt.hash(dto.passwordHash, 10);
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

    const tenantUser = this.tenantUserRepo.create({
      tenantId: tenantId,
      globalUserId: user.globalId,
    });
    await this.tenantUserRepo.save(tenantUser);

    // Synchronise le membre dans la base de la salle (tenant_xxx.users) → visible côté web
    try {
      await this.tenantMembersService.createTenantMember(tenantId, {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phoneNumber: dto.phoneNumber,
        passwordHash: hashedPassword,
        globalId: user.globalId,
      });
    } catch (err) {
      // Ne bloque pas l'inscription centrale si la synchro tenant échoue
      // (le membre reste connectable côté mobile).
    }

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

    const requestTenantId = this.request.tenantId;
    if (requestTenantId && tokenEntity.tenantId !== requestTenantId) {
      throw new UnauthorizedException('Refresh token does not belong to the requested tenant.');
    }

    tokenEntity.revokedAt = new Date();
    await this.refreshTokenRepo.save(tokenEntity);

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
        const admin = await this.adminRepo.findOne({
          where: { id: parseInt(tokenEntity.userId, 10) as any },
        });
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
      .where('userId = :userId AND tenantId = :tenantId AND revokedAt IS NULL', {
        userId,
        tenantId,
      })
      .execute();
  }

  async forgotPassword(email: string): Promise<{ message: string; resetToken?: string }> {
    const user = await this.userRepo.findOne({ where: { email, isActive: true } });

    if (!user) {
      return { message: 'If that email is registered, a reset link has been sent.' };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(rawToken, 10);

    const existing = await this.passwordResetRepo.findOne({ where: { email } });
    if (existing) {
      existing.token = hashedToken;
      (existing as any).createdAt = new Date();
      await this.passwordResetRepo.save(existing);
    } else {
      const resetRecord = this.passwordResetRepo.create({ email, token: hashedToken });
      await this.passwordResetRepo.save(resetRecord);
    }

    const isDev = this.configService.get<string>('NODE_ENV') !== 'production';
    return {
      message: 'If that email is registered, a reset link has been sent.',
      ...(isDev && { resetToken: rawToken }),
    };
  }

  async resetPassword(
    email: string,
    rawToken: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const resetRecord = await this.passwordResetRepo.findOne({ where: { email } });

    if (!resetRecord) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }

    const tokenAge = Date.now() - new Date(resetRecord.createdAt).getTime();
    if (tokenAge > 60 * 60 * 1000) {
      await this.passwordResetRepo.delete({ email });
      throw new BadRequestException(
        'Password reset token has expired. Please request a new one.',
      );
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

    await this.passwordResetRepo.delete({ email });
    await this.revokeAllUserTokens(user.globalId, this.request.tenantId ?? '');

    return { message: 'Password reset successfully. Please log in with your new password.' };
  }
}
