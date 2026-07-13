import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateMemberDto {
  @IsString() @IsOptional()
  firstName?: string;

  @IsString() @IsOptional()
  lastName?: string;

  @IsString() @IsOptional()
  phoneNumber?: string;

  @IsString() @IsOptional() @MinLength(8)
  password?: string;

  @IsBoolean() @IsOptional()
  isActive?: boolean;

  @IsString() @IsOptional()
  status?: string;
}
