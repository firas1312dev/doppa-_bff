import { Injectable, Inject, UnauthorizedException, BadRequestException, Scope } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { TenantUser } from '../tenant/entities/tenant-user.entity';

@Injectable({ scope: Scope.REQUEST })
export class AuthService {
  constructor(
    @InjectRepository(UserProfile)
    private readonly userRepo: Repository<UserProfile>,
    @InjectRepository(TenantUser)
    private readonly tenantUserRepo: Repository<TenantUser>,
    @Inject(REQUEST)
    private readonly request: any,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, pass: string) {
    const tenantId = this.request.tenantId;
    
    // 1. Find user by email in central DB
    const user = await this.userRepo.findOne({ where: { email, isActive: true } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    // 2. Verify password
    const isPasswordValid = await bcrypt.compare(pass, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    // 3. Verify user belongs to the current tenant
    const tenantMembership = await this.tenantUserRepo.findOne({
      where: {
        tenantId: tenantId,
        globalUserId: user.globalId,
      }
    });

    if (!tenantMembership) {
      throw new UnauthorizedException('User does not belong to this tenant.');
    }

    const payload = {
      sub: user.globalId, // On utilise globalId comme ID principal dans le JWT
      email: user.email,
      tenantId: tenantId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: user.globalId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
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

    const { password, ...result } = user;
    return result;
  }
}
