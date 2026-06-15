import { Controller, Get, Body, Put, UseGuards } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ActiveUser, ActiveUserData } from '../../common/decorators/active-user.decorator';

@Controller({ path: 'profile', version: '1' })
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  async getMyProfile(@ActiveUser() user: ActiveUserData) {
    return this.profileService.getProfile(user.sub);
  }

  @Put('me')
  async updateMyProfile(
    @ActiveUser() user: ActiveUserData,
    @Body() body: { firstName?: string; lastName?: string; phoneNumber?: string },
  ) {
    return this.profileService.updateProfile(user.sub, body);
  }
}
