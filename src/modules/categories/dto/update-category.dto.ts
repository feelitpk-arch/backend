import { IsString, IsOptional } from 'class-validator';
import { ProductCategory } from '../../../entities/product.entity';

export class UpdateCategoryDto {
  @IsString()
  @IsOptional()
  key?: ProductCategory;

  @IsString()
  @IsOptional()
  label?: string;
}

