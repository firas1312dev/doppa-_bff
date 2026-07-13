import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { TenantUser } from '../tenant/entities/tenant-user.entity';
import { verifyPassword } from '../../common/utils/password.util';

export interface GymMemberDto {
  globalId: string;
  localId?: number;
  memberId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  isActive: boolean;
  status: string;
  source: 'tenant' | 'central';
}

export function buildTenantMemberGlobalId(tenantId: string, localId: number): string {
  return `tuser:${tenantId}:${localId}`;
}

export function parseTenantMemberGlobalId(globalId: string): { tenantId: string; localId: number } | null {
  const match = /^tuser:([^:]+):(\d+)$/.exec(globalId);
  if (!match) return null;
  return { tenantId: match[1], localId: parseInt(match[2], 10) };
}

@Injectable()
export class TenantMembersService {
  private readonly logger = new Logger(TenantMembersService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(UserProfile)
    private readonly userRepo: Repository<UserProfile>,
    @InjectRepository(TenantUser)
    private readonly tenantUserRepo: Repository<TenantUser>,
  ) {}

  async resolveTenantDatabase(tenantId: string): Promise<{
    dbName: string | null;
    ownerEmail: string | null;
    gymName: string | null;
  }> {
    const rows = await this.dataSource.query(
      `SELECT name, email, data FROM tenants WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [tenantId],
    );
    const row = rows?.[0];
    if (!row) return { dbName: null, ownerEmail: null, gymName: null };

    let data = row.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { data = null; }
    }

    const dbName = data?.tenancy_db_name ?? `tenant_${tenantId}`;
    return {
      dbName,
      ownerEmail: row.email?.trim().toLowerCase() ?? null,
      gymName: row.name ?? null,
    };
  }

  private async databaseExists(dbName: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ? LIMIT 1`,
      [dbName],
    );
    return rows.length > 0;
  }

  async hasTenantDatabase(tenantId: string): Promise<boolean> {
    const { dbName } = await this.resolveTenantDatabase(tenantId);
    if (!dbName) return false;
    return this.databaseExists(dbName);
  }

  async countMembers(tenantId: string): Promise<{ active: number; inactive: number; total: number }> {
    const { dbName, ownerEmail } = await this.resolveTenantDatabase(tenantId);
    if (!dbName || !(await this.databaseExists(dbName))) {
      return { active: 0, inactive: 0, total: 0 };
    }

    const [stats] = await this.dataSource.query(
      `SELECT
         SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN is_active = 0 OR is_active IS NULL THEN 1 ELSE 0 END) AS inactive,
         COUNT(*) AS total
       FROM \`${dbName}\`.users
       WHERE deleted_at IS NULL${ownerEmail ? ' AND LOWER(email) <> ?' : ''}`,
      ownerEmail ? [ownerEmail] : [],
    );

    return {
      active: parseInt(stats?.active ?? '0', 10),
      inactive: parseInt(stats?.inactive ?? '0', 10),
      total: parseInt(stats?.total ?? '0', 10),
    };
  }

  async listMembers(
    tenantId: string,
    page = 1,
    limit = 15,
    search?: string,
  ): Promise<{ data: GymMemberDto[]; total: number } | null> {
    const { dbName, ownerEmail } = await this.resolveTenantDatabase(tenantId);
    if (!dbName || !(await this.databaseExists(dbName))) {
      return null;
    }

    const offset = (page - 1) * limit;
    const conditions = ['deleted_at IS NULL'];
    const params: unknown[] = [];

    if (ownerEmail) {
      conditions.push('LOWER(email) <> ?');
      params.push(ownerEmail);
    }

    if (search?.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push('(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR member_id LIKE ?)');
      params.push(q, q, q, q);
    }

    const where = conditions.join(' AND ');

    const countRows = await this.dataSource.query(
      `SELECT COUNT(*) AS cnt FROM \`${dbName}\`.users WHERE ${where}`,
      params,
    );
    const total = parseInt(countRows?.[0]?.cnt ?? '0', 10);

    const rows = await this.dataSource.query(
      `SELECT id, member_id, first_name, last_name, email, phone_number, is_active, status, global_id
       FROM \`${dbName}\`.users
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const data = rows.map((row: any) => this.mapTenantRow(tenantId, row));
    return { data, total };
  }

  async getMember(tenantId: string, localId: number): Promise<GymMemberDto | null> {
    const { dbName } = await this.resolveTenantDatabase(tenantId);
    if (!dbName || !(await this.databaseExists(dbName))) return null;

    const rows = await this.dataSource.query(
      `SELECT id, member_id, first_name, last_name, email, phone_number, is_active, status, global_id
       FROM \`${dbName}\`.users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [localId],
    );
    if (!rows?.[0]) return null;
    return this.mapTenantRow(tenantId, rows[0]);
  }

  async updateMember(
    tenantId: string,
    localId: number,
    dto: { firstName?: string; lastName?: string; phoneNumber?: string; isActive?: boolean; status?: string; password?: string },
  ): Promise<GymMemberDto | null> {
    const { dbName } = await this.resolveTenantDatabase(tenantId);
    if (!dbName || !(await this.databaseExists(dbName))) return null;

    const sets: string[] = [];
    const params: unknown[] = [];

    if (dto.firstName !== undefined) { sets.push('first_name = ?'); params.push(dto.firstName); }
    if (dto.lastName !== undefined) { sets.push('last_name = ?'); params.push(dto.lastName); }
    if (dto.phoneNumber !== undefined) { sets.push('phone_number = ?'); params.push(dto.phoneNumber); }
    if (dto.isActive !== undefined) { sets.push('is_active = ?'); params.push(dto.isActive ? 1 : 0); }
    if (dto.status !== undefined) { sets.push('status = ?'); params.push(dto.status); }
    if (dto.password) {
      const bcrypt = await import('bcrypt');
      sets.push('password = ?');
      params.push(await bcrypt.hash(dto.password, 10));
    }

    if (sets.length === 0) return this.getMember(tenantId, localId);

    params.push(localId);
    await this.dataSource.query(
      `UPDATE \`${dbName}\`.users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`,
      params,
    );

    return this.getMember(tenantId, localId);
  }

  async deleteMember(tenantId: string, localId: number): Promise<boolean> {
    const { dbName } = await this.resolveTenantDatabase(tenantId);
    if (!dbName || !(await this.databaseExists(dbName))) return false;

    await this.dataSource.query(
      `UPDATE \`${dbName}\`.users SET deleted_at = NOW() WHERE id = ?`,
      [localId],
    );
    return true;
  }

  /**
   * Authentifie un membre créé via le web (table users de la base tenant)
   * et le synchronise dans la base centrale + tenant_users pour le JWT mobile.
   */
  async authenticateAndSyncMember(
    tenantId: string,
    email: string,
    pass: string,
  ): Promise<UserProfile | null> {
    const normalizedEmail = email.trim().toLowerCase();
    const { dbName } = await this.resolveTenantDatabase(tenantId);
    if (!dbName || !(await this.databaseExists(dbName))) {
      return null;
    }

    const rows = await this.dataSource.query(
      `SELECT id, first_name, last_name, email, phone_number, password, is_active, status, global_id
       FROM \`${dbName}\`.users
       WHERE LOWER(email) = ? AND deleted_at IS NULL AND is_active = 1
       LIMIT 1`,
      [normalizedEmail],
    );
    const row = rows?.[0];
    if (!row) return null;

    const valid = await verifyPassword(pass, row.password);
    if (!valid) return null;

    return this.syncTenantMemberToCentral(tenantId, dbName, row);
  }

  private async syncTenantMemberToCentral(
    tenantId: string,
    dbName: string,
    row: Record<string, unknown>,
  ): Promise<UserProfile> {
    const email = String(row.email ?? '').trim();
    const normalizedEmail = email.toLowerCase();
    let globalId = String(row.global_id ?? '').trim();

    let user = globalId
      ? await this.userRepo.findOne({ where: { globalId } })
      : null;

    if (!user) {
      user = await this.userRepo
        .createQueryBuilder('u')
        .where('LOWER(u.email) = :email', { email: normalizedEmail })
        .andWhere('u.deleted_at IS NULL')
        .getOne();
    }

    if (!user) {
      globalId = globalId || uuidv4();
      user = this.userRepo.create({
        globalId,
        email,
        firstName: String(row.first_name ?? ''),
        lastName: String(row.last_name ?? ''),
        password: String(row.password ?? ''),
        phoneNumber: String(row.phone_number ?? ''),
        isActive: !!row.is_active,
        status: String(row.status ?? 'Active'),
      });
      await this.userRepo.save(user);
      this.logger.log(`Synced tenant member ${email} → central ${globalId}`);
    } else {
      globalId = user.globalId;
      if (!user.isActive) {
        user.isActive = true;
        await this.userRepo.save(user);
      }
    }

    const existingLink = await this.tenantUserRepo.findOne({
      where: { tenantId, globalUserId: globalId },
    });
    if (!existingLink) {
      await this.tenantUserRepo.save(
        this.tenantUserRepo.create({ tenantId, globalUserId: globalId }),
      );
    }

    if (!String(row.global_id ?? '').trim()) {
      await this.dataSource.query(
        `UPDATE \`${dbName}\`.users SET global_id = ?, updated_at = NOW() WHERE id = ?`,
        [globalId, row.id],
      );
    }

    return user;
  }

  private mapTenantRow(tenantId: string, row: any): GymMemberDto {
    const localId = Number(row.id);
    const globalId = row.global_id?.trim()
      ? row.global_id
      : buildTenantMemberGlobalId(tenantId, localId);

    return {
      globalId,
      localId,
      memberId: row.member_id ? String(row.member_id) : undefined,
      firstName: row.first_name ?? '',
      lastName: row.last_name ?? '',
      email: row.email ?? '',
      phoneNumber: row.phone_number ?? '',
      isActive: !!row.is_active,
      status: row.status ?? (row.is_active ? 'Active' : 'Inactive'),
      source: 'tenant',
    };
  }
}
