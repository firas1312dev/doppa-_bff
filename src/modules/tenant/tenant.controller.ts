import { Controller, Post, Get, Body, UsePipes, ValidationPipe } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { IsNotEmpty, IsString, Matches, IsEmail } from 'class-validator';

class RegisterTenantDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9_-]+$/, { message: 'ID must be lowercase alphanumeric, underscore or hyphen.' })
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;
}

@Controller({ path: 'tenant', version: '1' })
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post('register')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async register(@Body() dto: RegisterTenantDto) {
    return this.tenantService.registerTenant(dto);
  }

  @Get()
  async list() {
    return this.tenantService.getTenants();
  }
}

