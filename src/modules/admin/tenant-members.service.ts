import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { TenantUser } from '../tenant/entities/tenant-user.entity';
import { verifyPassword } from '../../common/utils/password.util';
import { normalizePhone, phoneSqlExpr } from '../../common/utils/phone.util';

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
  createdAt?: string | null;
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

  private buildMemberFilter(
    ownerEmail: string | null,
    search?: string,
    status?: 'all' | 'active' | 'inactive',
  ): { where: string; params: unknown[] } {
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

    if (status === 'active') {
      conditions.push('is_active = 1');
    } else if (status === 'inactive') {
      conditions.push('(is_active = 0 OR is_active IS NULL)');
    }

    return { where: conditions.join(' AND '), params };
  }

  async listMembers(
    tenantId: string,
    page = 1,
    limit = 15,
    search?: string,
    status: 'all' | 'active' | 'inactive' = 'all',
  ): Promise<{ data: GymMemberDto[]; total: number } | null> {
    const { dbName, ownerEmail } = await this.resolveTenantDatabase(tenantId);
    if (!dbName || !(await this.databaseExists(dbName))) {
      return null;
    }

    const offset = (page - 1) * limit;
    const { where, params } = this.buildMemberFilter(ownerEmail, search, status);

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

  /** Tous les membres correspondant au filtre (sans pagination) — pour l'export CSV. */
  async exportMembers(
    tenantId: string,
    search?: string,
    status: 'all' | 'active' | 'inactive' = 'all',
  ): Promise<GymMemberDto[] | null> {
    const { dbName, ownerEmail } = await this.resolveTenantDatabase(tenantId);
    if (!dbName || !(await this.databaseExists(dbName))) {
      return null;
    }

    const { where, params } = this.buildMemberFilter(ownerEmail, search, status);

    const rows = await this.dataSource.query(
      `SELECT id, member_id, first_name, last_name, email, phone_number, is_active, status, global_id, created_at
       FROM \`${dbName}\`.users
       WHERE ${where}
       ORDER BY created_at DESC`,
      params,
    );

    return rows.map((row: any) => ({
      ...this.mapTenantRow(tenantId, row),
      createdAt: row.created_at ?? null,
    }));
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
   * Crée un membre (inscrit via mobile) dans la base de la salle (tenant_xxx.users)
   * afin qu'il soit visible côté web. Si l'email existe déjà, on rattache juste le global_id.
   * Retourne null si la salle n'a pas de base tenant.
   */
  async createTenantMember(
    tenantId: string,
    dto: {
      firstName: string;
      lastName: string;
      email: string;
      phoneNumber?: string;
      passwordHash: string;
      globalId: string;
    },
  ): Promise<{ localId: number; memberId: string } | null> {
    const { dbName } = await this.resolveTenantDatabase(tenantId);
    if (!dbName || !(await this.databaseExists(dbName))) {
      return null;
    }

    const normalizedEmail = dto.email.trim().toLowerCase();

    const existing = await this.dataSource.query(
      `SELECT id, member_id, global_id FROM \`${dbName}\`.users
       WHERE LOWER(email) = ? AND deleted_at IS NULL LIMIT 1`,
      [normalizedEmail],
    );
    if (existing?.[0]) {
      const row = existing[0];
      if (!String(row.global_id ?? '').trim()) {
        await this.dataSource.query(
          `UPDATE \`${dbName}\`.users SET global_id = ?, updated_at = NOW() WHERE id = ?`,
          [dto.globalId, row.id],
        );
      }
      return { localId: Number(row.id), memberId: String(row.member_id ?? '') };
    }

    const memberId = this.generateMemberId();
    const fullName = `${dto.firstName} ${dto.lastName}`.trim();

    const result = await this.dataSource.query(
      `INSERT INTO \`${dbName}\`.users
        (first_name, last_name, name, email, phone_number, password, is_active, status,
         workout_profile, diet_profile, member_id, global_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'Active', 0, 0, ?, ?, NOW(), NOW())`,
      [
        dto.firstName,
        dto.lastName,
        fullName,
        dto.email,
        dto.phoneNumber ?? null,
        dto.passwordHash,
        memberId,
        dto.globalId,
      ],
    );

    const localId = Number(result?.insertId ?? 0);
    this.logger.log(`Created tenant member ${dto.email} in ${dbName} (id=${localId})`);
    return { localId, memberId };
  }

  /**
   * Récupère les infos de localisation de la salle (adresse, téléphone, horaires)
   * depuis app_settings de la base tenant. Renvoie null si indisponible.
   */
  async getGymInfo(tenantId: string): Promise<{
    name: string | null;
    phone: string | null;
    email: string | null;
    address: Record<string, unknown> | null;
    formattedAddress: string | null;
    openingTimes: unknown[] | null;
  } | null> {
    const { dbName, gymName } = await this.resolveTenantDatabase(tenantId);
    if (!dbName || !(await this.databaseExists(dbName))) {
      return null;
    }

    const parseOptions = (raw: unknown): any => {
      if (raw == null) return null;
      if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch { return null; }
      }
      return raw;
    };

    let address: Record<string, unknown> | null = null;
    let phone: string | null = null;
    let email: string | null = null;
    let name: string | null = gymName;
    let openingTimes: unknown[] | null = null;

    try {
      const rows = await this.dataSource.query(
        `SELECT \`key\`, options FROM \`${dbName}\`.app_settings
         WHERE \`key\` IN ('address', 'config', 'opening-times') AND deleted_at IS NULL`,
      );
      for (const row of rows) {
        const opts = parseOptions(row.options);
        if (row.key === 'address' && opts) address = opts;
        if (row.key === 'config' && opts) {
          phone = opts.phone ?? phone;
          email = opts.email ?? email;
          name = opts.name ?? name;
        }
        if (row.key === 'opening-times' && Array.isArray(opts)) openingTimes = opts;
      }
    } catch {
      // app_settings absent → fallback shop_locations
    }

    if (!address) {
      try {
        const shop = await this.dataSource.query(
          `SELECT name, line1, line2, city, state, postal_code, country
           FROM \`${dbName}\`.shop_locations
           WHERE active = 1 AND deleted_at IS NULL LIMIT 1`,
        );
        if (shop?.[0]) {
          address = shop[0];
          name = name ?? shop[0].name ?? null;
        }
      } catch {
        // ignore
      }
    }

    const formattedAddress = address ? this.formatAddress(address) : null;

    return { name, phone, email, address, formattedAddress, openingTimes };
  }

  private formatAddress(a: Record<string, unknown>): string {
    const parts = [
      a.line1,
      a.line2,
      a.city,
      a.state,
      a.postal_code,
      a.country,
    ]
      .map((p) => (p == null ? '' : String(p).trim()))
      .filter((p) => p.length > 0);
    return parts.join(', ');
  }

  /** Génère un member_id au format DDMMYY (comme le web). */
  private generateMemberId(): string {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}${mm}${yy}`;
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

  /**
   * Cherche un membre par téléphone dans les bases tenant (en parallèle par lots).
   * Un seul parcours suffit pour auth OK / mauvais MDP / inconnu.
   */
  async lookupMemberByPhoneAcrossTenants(
    phone: string,
    pass: string,
  ): Promise<
    | { status: 'authenticated'; user: UserProfile; tenantId: string; gymName: string | null }
    | { status: 'wrong_password' }
    | { status: 'not_found' }
  > {
    const normalized = normalizePhone(phone);
    if (!normalized || normalized.length < 6) return { status: 'not_found' };

    const tenants = await this.dataSource.query(
      `SELECT id, name, data FROM tenants
       WHERE deleted_at IS NULL AND status = 'Active'`,
    );

    // Match rapide : le numéro normalisé est contenu dans phone_number nettoyé
    const digitsOnly = `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone_number,''), ' ', ''), '-', ''), '+', ''), '.', ''), '/', '')`;
    const batchSize = 12;
    let sawPhone = false;

    for (let i = 0; i < tenants.length; i += batchSize) {
      const batch = tenants.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (tenant: { id: string; name: string; data: unknown }) => {
          let data = tenant.data as any;
          if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch { data = null; }
          }
          const dbName = data?.tenancy_db_name ?? `tenant_${tenant.id}`;

          try {
            const rows = await this.dataSource.query(
              `SELECT id, first_name, last_name, email, phone_number, password, is_active, status, global_id
               FROM \`${dbName}\`.users
               WHERE deleted_at IS NULL AND is_active = 1
                 AND phone_number IS NOT NULL AND phone_number <> ''
                 AND (${digitsOnly} = ? OR ${digitsOnly} LIKE ? OR ${digitsOnly} LIKE ?)
               LIMIT 3`,
              [normalized, `%${normalized}`, `216${normalized}`],
            );

            if (!rows?.length) return { kind: 'none' as const };

            for (const row of rows) {
              const valid = await verifyPassword(pass, row.password);
              if (valid) {
                const user = await this.syncTenantMemberToCentral(tenant.id, dbName, row);
                return {
                  kind: 'ok' as const,
                  user,
                  tenantId: tenant.id,
                  gymName: tenant.name ?? null,
                };
              }
            }
            return { kind: 'wrong' as const };
          } catch {
            return { kind: 'none' as const };
          }
        }),
      );

      for (const r of results) {
        if (r.kind === 'ok') {
          return {
            status: 'authenticated',
            user: r.user,
            tenantId: r.tenantId,
            gymName: r.gymName,
          };
        }
        if (r.kind === 'wrong') sawPhone = true;
      }
    }

    return sawPhone ? { status: 'wrong_password' } : { status: 'not_found' };
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
