import { Injectable, Scope, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfile } from './entities/user-profile.entity';

@Injectable({ scope: Scope.REQUEST })
export class ProfileService {
  constructor(
    @InjectRepository(UserProfile)
    private readonly userRepo: Repository<UserProfile>,
  ) {}

  async getProfile(userId: string): Promise<UserProfile> {
    // userId ici correspond au `sub` du JWT, c'est à dire le globalId
    const profile = await this.userRepo.findOne({ where: { globalId: userId } });
    if (!profile) {
      throw new NotFoundException(`User profile with global ID ${userId} not found.`);
    }
    return profile;
  }

  async updateProfile(userId: string, data: Partial<UserProfile>): Promise<UserProfile> {
    const profile = await this.getProfile(userId);
    
    // Update allowed fields
    if (data.firstName) profile.firstName = data.firstName;
    if (data.lastName) profile.lastName = data.lastName;
    if (data.phoneNumber) profile.phoneNumber = data.phoneNumber;

    return this.userRepo.save(profile);
  }
}

