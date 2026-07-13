import {
  Injectable, Logger, NotFoundException, ConflictException, Inject, Scope,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { TenantUser } from '../tenant/entities/tenant-user.entity';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { TenantMembersService, parseTenantMemberGlobalId, GymMemberDto } from './tenant-members.service';

function toSafeDto(u: UserProfile): GymMemberDto {
  const { password, deletedAt, ...safe } = u as any;
  return {
    globalId: safe.globalId,
    firstName: safe.firstName ?? '',
    lastName: safe.lastName ?? '',
    email: safe.email ?? '',
    phoneNumber: safe.phoneNumber ?? '',
    isActive: !!safe.isActive,
    status: safe.status ?? 'Active',
    source: 'central',
  };
}

@Injectable({ scope: Scope.REQUEST })
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(UserProfile)
    private readonly userRepo: Repository<UserProfile>,
    @InjectRepository(TenantUser)
    private readonly tenantUserRepo: Repository<TenantUser>,
    @Inject(REQUEST)
    private readonly request: { tenantId?: string },
    private readonly tenantMembersService: TenantMembersService,
  ) {}

  private get tenantId(): string {
    if (!this.request.tenantId) {
      throw new NotFoundException('Contexte salle manquant.');
    }
    return this.request.tenantId;
  }

  // ─── List ────────────────────────────────────────────────────────────────────

  async getMembers(page = 1, limit = 15, search?: string) {
    const tenantId = this.tenantId;

    // Source principale : base dédiée de la salle (comme le dashboard web Laravel)
    const tenantResult = await this.tenantMembersService.listMembers(tenantId, page, limit, search);
    if (tenantResult !== null) {
      return {
        data: tenantResult.data,
        meta: {
          total: tenantResult.total,
          page,
          limit,
          lastPage: Math.ceil(tenantResult.total / limit) || 1,
        },
      };
    }

    // Repli : membres liés dans la base centrale (salles sans base dédiée)
    return this.getCentralMembers(page, limit, search);
  }

  private async getCentralMembers(page: number, limit: number, search?: string) {
    const skip = (page - 1) * limit;
    const tenantId = this.tenantId;
    const { ownerEmail } = await this.tenantMembersService.resolveTenantDatabase(tenantId);

    const qb = this.userRepo
      .createQueryBuilder('u')
      .innerJoin(TenantUser, 'tu', 'tu.global_user_id = u.global_id')
      .where('tu.tenant_id = :tenantId', { tenantId })
      .andWhere('u.deleted_at IS NULL');

    if (ownerEmail) {
      qb.andWhere('LOWER(u.email) <> :ownerEmail', { ownerEmail });
    }

    if (search?.trim()) {
      const q = `%${search.trim()}%`;
      qb.andWhere(
        '(u.first_name LIKE :q OR u.last_name LIKE :q OR u.email LIKE :q)',
        { q },
      );
    }

    const [rows, total] = await qb
      .orderBy('u.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows.map(toSafeDto),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit) || 1,
      },
    };
  }

  // ─── Show ────────────────────────────────────────────────────────────────────

  async getMember(globalId: string) {
    const tenantId = this.tenantId;
    const parsed = parseTenantMemberGlobalId(globalId);

    if (parsed && parsed.tenantId === tenantId) {
      const member = await this.tenantMembersService.getMember(tenantId, parsed.localId);
      if (member) return member;
    }

    const user = await this.userRepo
      .createQueryBuilder('u')
      .innerJoin(TenantUser, 'tu', 'tu.global_user_id = u.global_id')
      .where('u.global_id = :globalId', { globalId })
      .andWhere('tu.tenant_id = :tenantId', { tenantId })
      .andWhere('u.deleted_at IS NULL')
      .getOne();

    if (!user) throw new NotFoundException(`Member ${globalId} not found.`);
    return toSafeDto(user);
  }

  // ─── Create ──────────────────────────────────────────────────────────────────

  async createMember(dto: CreateMemberDto) {
    const tenantId = this.tenantId;
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });

    if (existing) {
      const link = await this.tenantUserRepo.findOne({
        where: { tenantId, globalUserId: existing.globalId },
      });
      if (link) {
        throw new ConflictException('A member with this email already exists in this gym.');
      }

      const membership = this.tenantUserRepo.create({
        tenantId,
        globalUserId: existing.globalId,
      });
      await this.tenantUserRepo.save(membership);
      this.logger.log(`Admin linked existing member ${existing.email} to tenant ${tenantId}`);
      return toSafeDto(existing);
    }

    const hashed = await bcrypt.hash(dto.password, 12);

    const member = new UserProfile();
    member.globalId = randomUUID();
    member.firstName = dto.firstName;
    member.lastName = dto.lastName;
    member.email = dto.email;
    member.password = hashed;
    member.phoneNumber = dto.phoneNumber ?? '';
    member.isActive = true;
    member.status = 'Active';

    const saved = await this.userRepo.save(member);

    const membership = this.tenantUserRepo.create({
      tenantId,
      globalUserId: saved.globalId,
    });
    await this.tenantUserRepo.save(membership);

    this.logger.log(`Admin created member: ${saved.email} (${saved.globalId}) for tenant ${tenantId}`);
    return toSafeDto(saved);
  }

  // ─── Update ──────────────────────────────────────────────────────────────────

  async updateMember(globalId: string, dto: UpdateMemberDto) {
    const tenantId = this.tenantId;
    const parsed = parseTenantMemberGlobalId(globalId);

    if (parsed && parsed.tenantId === tenantId) {
      const updated = await this.tenantMembersService.updateMember(tenantId, parsed.localId, dto);
      if (updated) return updated;
      throw new NotFoundException(`Member ${globalId} not found.`);
    }

    const user = await this.userRepo
      .createQueryBuilder('u')
      .innerJoin(TenantUser, 'tu', 'tu.global_user_id = u.global_id')
      .where('u.global_id = :globalId', { globalId })
      .andWhere('tu.tenant_id = :tenantId', { tenantId })
      .andWhere('u.deleted_at IS NULL')
      .getOne();

    if (!user) throw new NotFoundException(`Member ${globalId} not found.`);

    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.phoneNumber !== undefined) user.phoneNumber = dto.phoneNumber;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    if (dto.status !== undefined) user.status = dto.status;
    if (dto.password) user.password = await bcrypt.hash(dto.password, 12);

    const saved = await this.userRepo.save(user);
    return toSafeDto(saved);
  }

  // ─── Delete (soft) ───────────────────────────────────────────────────────────

  async deleteMember(globalId: string) {
    const tenantId = this.tenantId;
    const parsed = parseTenantMemberGlobalId(globalId);

    if (parsed && parsed.tenantId === tenantId) {
      const ok = await this.tenantMembersService.deleteMember(tenantId, parsed.localId);
      if (!ok) throw new NotFoundException(`Member ${globalId} not found.`);
      return { message: 'Member deleted successfully.' };
    }

    await this.getMember(globalId);
    await this.userRepo.softDelete({ globalId });
    return { message: 'Member deleted successfully.' };
  }
}
