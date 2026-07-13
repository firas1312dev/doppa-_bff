import { IsString, IsOptional, IsInt, Min, IsDateString, MaxLength, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateClassScheduleDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  instructor?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  location?: string;

  @IsDateString()
  @IsOptional()
  startTime?: string;

  @IsDateString()
  @IsOptional()
  endTime?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  maxCapacity?: number;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  color?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
