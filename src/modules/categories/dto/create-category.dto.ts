import { IsString, IsNotEmpty } from 'class-validator';
import { ProductCategory } from '../../../entities/product.entity';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  key: ProductCategory;

  @IsString()
  @IsNotEmpty()
  label: string;
}

