import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ObjectId } from 'mongodb';
import { Category } from '../../entities/category.entity';
import { Product } from '../../entities/product.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AdminWebSocketGateway } from '../websocket/websocket.gateway';
import { toObjectId } from '../../common/utils/mongodb.util';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @Inject(forwardRef(() => AdminWebSocketGateway))
    private websocketGateway: AdminWebSocketGateway,
  ) {}

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    const existingCategory = await this.categoryRepository.findOne({
      where: { key: createCategoryDto.key },
    });

    if (existingCategory) {
      throw new BadRequestException('Category with this key already exists');
    }

    const category = this.categoryRepository.create(createCategoryDto);
    const savedCategory = await this.categoryRepository.save(category);
    const categoryWithRelations = await this.categoryRepository.findOne({
      where: { id: savedCategory.id },
      relations: ['products'],
    });
    if (categoryWithRelations) {
      this.websocketGateway.emitCategoryCreated(categoryWithRelations);
    }
    return savedCategory;
  }

  async findAll(): Promise<Category[]> {
    return this.categoryRepository.find({
      relations: ['products'],
    });
  }

  async findOne(id: string): Promise<Category> {
    let category: Category | null = null;
    const manager = this.categoryRepository.manager;
    
    console.log(`🔍 Category findOne: Looking for category with ID: ${id}`);
    
    // Use comprehensive search strategy
    try {
      // Strategy 1: Get all categories and find by ID string match (MOST RELIABLE)
      try {
        const allCategories = await this.categoryRepository.find({
          relations: ['products'],
        });
        
        const searchIdNormalized = String(id).trim().toLowerCase();
        
        for (const c of allCategories) {
          if (!c.id) continue;
          
          const categoryIdVariants = [
            String(c.id),
            String(c.id).trim(),
            String(c.id).toLowerCase(),
            c.id?.toString(),
            c.id?.toString()?.trim(),
            c.id?.toString()?.toLowerCase(),
          ].filter(Boolean);
          
          for (const categoryIdStr of categoryIdVariants) {
            const normalized = String(categoryIdStr).trim().toLowerCase();
            if (normalized === searchIdNormalized) {
              console.log(`✅ Strategy 1: Found category! ID: "${categoryIdStr}"`);
              category = c;
              break;
            }
          }
          
          if (category) break;
          
          // ObjectId comparison
          const categoryIdStr = String(c.id);
          if (ObjectId.isValid(categoryIdStr) && ObjectId.isValid(id)) {
            try {
              if (new ObjectId(categoryIdStr).equals(new ObjectId(id))) {
                console.log(`✅ Strategy 1: Found ObjectId match! Category ID: "${categoryIdStr}"`);
                category = c;
                break;
              }
            } catch (e) {
              // Ignore
            }
          }
        }
      } catch (error) {
        console.error(`❌ Strategy 1 failed for ID ${id}:`, error);
      }
      
      // Strategy 2: Try with MongoDB manager using _id
      if (!category && ObjectId.isValid(id)) {
        try {
          const mongoRepository = manager.getMongoRepository(Category);
          const objectId = toObjectId(id);
          category = await mongoRepository.findOne({
            where: { _id: objectId } as any,
            relations: ['products'],
          });
          
          if (!category) {
            category = await mongoRepository.findOne({
              where: { id: objectId } as any,
              relations: ['products'],
            });
          }
        } catch (error) {
          console.warn(`❌ Strategy 2 failed for ID ${id}:`, error);
        }
      }
      
      // Strategy 3: Try with TypeORM repository using ObjectId
      if (!category && ObjectId.isValid(id)) {
        try {
          const objectId = toObjectId(id);
          category = await this.categoryRepository.findOne({
            where: { id: objectId as any },
            relations: ['products'],
          });
        } catch (error) {
          console.warn(`❌ Strategy 3 failed for ID ${id}:`, error);
        }
      }
      
      // Strategy 4: Try as string ID
      if (!category) {
        try {
          category = await this.categoryRepository.findOne({
            where: { id: id as any },
            relations: ['products'],
          });
        } catch (error) {
          console.warn(`❌ Strategy 4 failed for ID ${id}:`, error);
        }
      }
    } catch (error) {
      console.error(`❌ All strategies failed for ID ${id}:`, error);
    }

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    console.log(`✅ Category findOne: Found category with ID: ${category.id?.toString()}`);
    return category;
  }

  async findByKey(key: string): Promise<Category> {
    const category = await this.categoryRepository.findOne({
      where: { key: key as any },
      relations: ['products'],
    });

    if (!category) {
      throw new NotFoundException(`Category with key ${key} not found`);
    }

    return category;
  }

  async update(
    id: string,
    updateCategoryDto: UpdateCategoryDto,
  ): Promise<Category> {
    const category = await this.findOne(id);

    if (updateCategoryDto.key !== undefined && updateCategoryDto.key !== category.key) {
      const existingCategory = await this.categoryRepository.findOne({
        where: { key: updateCategoryDto.key },
      });

      if (existingCategory && existingCategory.id.toString() !== id) {
        throw new BadRequestException('Category with this key already exists');
      }

      category.key = updateCategoryDto.key;
    }

    if (updateCategoryDto.label !== undefined) {
      category.label = updateCategoryDto.label;
    }

    const savedCategory = await this.categoryRepository.save(category);
    const categoryWithRelations = await this.categoryRepository.findOne({
      where: { id: savedCategory.id },
      relations: ['products'],
    });
    if (categoryWithRelations) {
      this.websocketGateway.emitCategoryUpdated(categoryWithRelations);
    }
    return savedCategory;
  }

  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);

    const productsCount = await this.productRepository.count({
      where: { category: category.key as any },
    });

    if (productsCount > 0) {
      throw new BadRequestException(
        `Cannot delete category with ${productsCount} existing products`,
      );
    }

    await this.categoryRepository.remove(category);
    this.websocketGateway.emitCategoryDeleted(id);
  }

  async getStats(id: string) {
    const category = await this.findOne(id);
    const products = await this.productRepository.find({
      where: { category: category.key as any },
    });

    const totalValue = products.reduce((sum, product) => sum + Number(product.price), 0);

    return {
      category,
      total: products.length,
      totalValue,
    };
  }
}

