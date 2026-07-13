import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateMemberDto {
  @IsString() @IsNotEmpty()
  firstName: string;

  @IsString() @IsNotEmpty()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString() @MinLength(8)
  password: string;

  @IsString() @IsOptional()
  phoneNumber?: string;
}
