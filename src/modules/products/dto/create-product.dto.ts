import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsArray,
  IsBoolean,
  IsOptional,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { ProductCategory } from '../../../entities/product.entity';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({}, { each: true })
  sizes: number[];

  @IsNumber()
  @Min(0)
  defaultSize: number;

  @IsString()
  @IsNotEmpty()
  category: ProductCategory;

  @IsBoolean()
  @IsOptional()
  isBestSeller?: boolean;

  @IsBoolean()
  @IsOptional()
  isNewArrival?: boolean;

  @IsString()
  @IsNotEmpty()
  image: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  gallery?: string[];
}

