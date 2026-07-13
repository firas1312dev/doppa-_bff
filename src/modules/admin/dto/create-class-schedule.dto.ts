import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsDateString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateClassScheduleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

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
  startTime: string;

  @IsDateString()
  endTime: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxCapacity: number;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  color?: string;
}
