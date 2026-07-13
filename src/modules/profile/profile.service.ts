import { Injectable, Scope, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfile } from './entities/user-profile.entity';

/**
 * Public profile shape returned to the mobile app.
 * `id` is deliberately the `globalId` (not the numeric DB PK) so it stays
 * consistent with the login response (`user.id`) and the dashboard payload —
 * the mobile `User.id` is always the global identifier.
 */
export interface PublicProfileDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  status: string;
}

function toPublicDto(profile: UserProfile): PublicProfileDto {
  return {
    id: profile.globalId,
    email: profile.email,
    firstName: profile.firstName,
    lastName: profile.lastName,
    phoneNumber: profile.phoneNumber ?? null,
    status: profile.status,
  };
}

@Injectable({ scope: Scope.REQUEST })
export class ProfileService {
  constructor(
    @InjectRepository(UserProfile)
    private readonly userRepo: Repository<UserProfile>,
  ) {}

  /** Returns the raw entity — for internal service-to-service use only (e.g. auth). */
  async getProfile(userId: string): Promise<UserProfile> {
    const profile = await this.userRepo.findOne({ where: { globalId: userId } });
    if (!profile) {
      throw new NotFoundException(`User profile with global ID ${userId} not found.`);
    }
    return profile;
  }

  /** Returns a safe, mobile-aligned DTO (no password / internal fields) — use for HTTP responses. */
  async getProfileDto(userId: string): Promise<PublicProfileDto> {
    return toPublicDto(await this.getProfile(userId));
  }

  async updateProfile(
    userId: string,
    data: { firstName?: string; lastName?: string; phoneNumber?: string | null },
  ): Promise<PublicProfileDto> {
    const profile = await this.getProfile(userId);

    if (data.firstName !== undefined) profile.firstName = data.firstName;
    if (data.lastName !== undefined) profile.lastName = data.lastName;
    // `!== undefined` (not truthiness) so the member can clear their phone number.
    if (data.phoneNumber !== undefined) profile.phoneNumber = data.phoneNumber as string;

    return toPublicDto(await this.userRepo.save(profile));
  }
}

