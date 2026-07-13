import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ActiveUser, ActiveUserData } from '../../common/decorators/active-user.decorator';

class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  pass: string;
}

class RegisterDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @IsString()
  @IsOptional()
  phoneNumber?: string;
}

class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

class ForgotPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

class ResetPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  newPassword: string;
}

class LogoutDto {
  @IsString()
  @IsOptional()
  refreshToken?: string;
}

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.pass);
  }

  /** Alias for mobile apps that send POST /auth/users/login (member guard) */
  @Post('users/login')
  @HttpCode(HttpStatus.OK)
  async loginUser(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.pass);
  }

  /** Connexion propriétaire / gérant de salle (email = email de la salle) */
  @Post('admins/login')
  @HttpCode(HttpStatus.OK)
  async loginAdmin(@Body() dto: LoginDto) {
    return this.authService.loginAdmin(dto.email, dto.pass);
  }

  /** Alias explicite pour le propriétaire de salle */
  @Post('owners/login')
  @HttpCode(HttpStatus.OK)
  async loginOwner(@Body() dto: LoginDto) {
    return this.authService.loginAdmin(dto.email, dto.pass);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    return this.authService.register({
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      passwordHash: dto.password,
      phoneNumber: dto.phoneNumber,
    });
  }

  /** Exchange a valid refresh token for a new access + refresh token pair. */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  /** Revoke the provided refresh token and all tokens for the current user. */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async logout(
    @ActiveUser() user: ActiveUserData,
    @Body() dto: LogoutDto,
  ) {
    if (dto.refreshToken) {
      await this.authService.revokeRefreshToken(dto.refreshToken);
    }
    await this.authService.revokeAllUserTokens(user.sub, user.tenantId);
    return { message: 'Logged out successfully.' };
  }

  /** Initiate password reset — sends reset token (returned in dev mode). */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  /** Complete password reset with token received by email. */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.email, dto.token, dto.newPassword);
  }
}

