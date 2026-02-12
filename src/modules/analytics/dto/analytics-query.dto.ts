import { IsEnum, IsOptional } from 'class-validator';

export enum ReportPeriod {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export class AnalyticsQueryDto {
  @IsEnum(ReportPeriod)
  @IsOptional()
  period?: ReportPeriod;
}

