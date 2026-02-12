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
import { Product } from '../../entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdminWebSocketGateway } from '../websocket/websocket.gateway';
import { PublicWebSocketGateway } from '../websocket/public-websocket.gateway';
import { toObjectId } from '../../common/utils/mongodb.util';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @Inject(forwardRef(() => AdminWebSocketGateway))
    private adminWebsocketGateway: AdminWebSocketGateway,
    @Inject(forwardRef(() => PublicWebSocketGateway))
    private publicWebsocketGateway: PublicWebSocketGateway,
  ) {}

  async create(createProductDto: CreateProductDto): Promise<Product> {
    const slug = this.generateSlug(createProductDto.name);

    const existingProduct = await this.productRepository.findOne({
      where: { slug },
    });

    if (existingProduct) {
      throw new BadRequestException('Product with this name already exists');
    }

    const product = this.productRepository.create({
      ...createProductDto,
      slug,
      sizes: createProductDto.sizes.join(','),
      gallery: createProductDto.gallery?.join(',') || createProductDto.image,
    });

    const savedProduct = await this.productRepository.save(product);
    const formattedProduct = this.formatProduct(savedProduct);
    this.adminWebsocketGateway.emitProductCreated(formattedProduct);
    this.publicWebsocketGateway.emitProductCreated(formattedProduct);
    return formattedProduct;
  }

  async findAll(search?: string): Promise<Product[]> {
    try {
      let products: Product[];
      
      if (search) {
        // Get all products and filter in memory (simpler approach for MongoDB)
        // TypeORM MongoDB doesn't support complex queries well
        const allProducts = await this.productRepository.find();
        const searchLower = search.toLowerCase();
        products = allProducts.filter(
          (p) =>
            p.name?.toLowerCase().includes(searchLower) ||
            p.description?.toLowerCase().includes(searchLower),
        );
      } else {
        products = await this.productRepository.find();
      }

      return products.map(this.formatProduct);
    } catch (error) {
      // If database query fails, return empty array
      return [];
    }
  }

  async findOne(id: string): Promise<Product> {
    let product: Product | null = null;
    const manager = this.productRepository.manager;
    
    console.log(`🔍 findOne: Looking for product with ID: ${id}`);
    
    // Try multiple strategies to find the product
    // Strategy 1 FIRST since we know the product exists and can be retrieved via findAll
    try {
      // Strategy 1: Get all products and find by ID string match (MOST RELIABLE - product exists!)
      try {
        console.log(`🔍 Strategy 1: Searching all products for ID: "${id}" (type: ${typeof id})`);
        const allProducts = await this.productRepository.find();
        console.log(`📦 Found ${allProducts.length} total products`);
        
        if (allProducts.length > 0) {
          console.log(`📋 First 3 product IDs:`, allProducts.slice(0, 3).map(p => ({
            rawId: p.id,
            idType: typeof p.id,
            idString: String(p.id),
            idToString: p.id?.toString(),
            idConstructor: p.id?.constructor?.name
          })));
        }
        
        // Normalize the search ID
        const searchIdNormalized = String(id).trim().toLowerCase();
        
        // Try to find the product with multiple comparison methods
        for (const p of allProducts) {
          if (!p.id) {
            console.log(`⚠️ Product has no ID:`, p);
            continue;
          }
          
          // Try multiple ID formats
          const productIdVariants = [
            String(p.id),
            String(p.id).trim(),
            String(p.id).toLowerCase(),
            p.id?.toString(),
            p.id?.toString()?.trim(),
            p.id?.toString()?.toLowerCase(),
          ].filter(Boolean);
          
          for (const productIdStr of productIdVariants) {
            const normalized = String(productIdStr).trim().toLowerCase();
            
            // Exact match (case-insensitive)
            if (normalized === searchIdNormalized) {
              console.log(`✅ Strategy 1: Found exact match! Product ID: "${productIdStr}" (normalized: "${normalized}")`);
              product = p;
              break;
            }
          }
          
          if (product) break;
          
          // ObjectId comparison (if both are valid ObjectIds)
          const productIdStr = String(p.id);
          if (ObjectId.isValid(productIdStr) && ObjectId.isValid(id)) {
            try {
              const productObjId = new ObjectId(productIdStr);
              const searchObjId = new ObjectId(id);
              if (productObjId.equals(searchObjId)) {
                console.log(`✅ Strategy 1: Found ObjectId match! Product ID: "${productIdStr}"`);
                product = p;
                break;
              }
            } catch (e) {
              // Ignore ObjectId conversion errors
            }
          }
        }
        
        if (!product) {
          console.log(`❌ Strategy 1: No match found. Looking for: "${id}" (normalized: "${searchIdNormalized}")`);
          console.log(`📋 All product IDs in DB:`, allProducts.map((p, i) => 
            `[${i}] "${String(p.id)}" (type: ${typeof p.id})`
          ).join(', '));
        }
      } catch (error) {
        console.error(`❌ Strategy 1 failed for ID ${id}:`, error);
      }
      
      // Strategy 2: Try with MongoDB manager using _id
      if (!product && ObjectId.isValid(id)) {
        try {
          const mongoRepository = manager.getMongoRepository(Product);
          const objectId = toObjectId(id);
          console.log(`🔍 Strategy 2: Trying with MongoDB manager _id: ${objectId.toString()}`);
          
          // Try different query formats
          product = await mongoRepository.findOne({
            where: { _id: objectId } as any,
          });
          
          if (!product) {
            // Try with id field instead of _id
            product = await mongoRepository.findOne({
              where: { id: objectId } as any,
            });
          }
          
          if (product) {
            console.log(`✅ Strategy 2: Found product with ID: ${product.id?.toString()}`);
          } else {
            console.log(`❌ Strategy 2: Product not found with _id or id`);
          }
        } catch (error) {
          console.warn(`❌ Strategy 2 failed for ID ${id}:`, error);
        }
      }
      
      // Strategy 3: Try with TypeORM repository using ObjectId
      if (!product && ObjectId.isValid(id)) {
        try {
          const objectId = toObjectId(id);
          console.log(`🔍 Strategy 3: Trying with TypeORM repository ObjectId: ${objectId.toString()}`);
          product = await this.productRepository.findOne({ where: { id: objectId as any } });
          if (product) {
            console.log(`✅ Strategy 3: Found product with ID: ${product.id?.toString()}`);
          }
        } catch (error) {
          console.warn(`❌ Strategy 3 failed for ID ${id}:`, error);
        }
      }
      
      // Strategy 4: Try as string ID with TypeORM repository
      if (!product) {
        try {
          console.log(`🔍 Strategy 4: Trying with string ID: ${id}`);
          product = await this.productRepository.findOne({ where: { id: id as any } });
          if (product) {
            console.log(`✅ Strategy 4: Found product with ID: ${product.id?.toString()}`);
          }
        } catch (error) {
          console.warn(`❌ Strategy 4 failed for ID ${id}:`, error);
        }
      }
    } catch (error) {
      console.error(`❌ All strategies failed for ID ${id}:`, error);
    }

    if (!product) {
      // Last resort: Try one more time with findAll and very loose matching
      try {
        console.log(`🆘 LAST RESORT: Trying findAll one more time with ID: ${id}`);
        const allProducts = await this.productRepository.find();
        console.log(`🆘 LAST RESORT: Found ${allProducts.length} products`);
        
        // Try every possible ID format
        for (const p of allProducts) {
          if (!p.id) continue;
          
          const productIdStr = String(p.id).trim();
          const searchIdStr = String(id).trim();
          
          // Try every comparison method
          if (
            productIdStr === searchIdStr ||
            productIdStr.toLowerCase() === searchIdStr.toLowerCase() ||
            productIdStr.replace(/\s/g, '') === searchIdStr.replace(/\s/g, '')
          ) {
            console.log(`🆘 LAST RESORT: Found product! ID: ${productIdStr}`);
            product = p;
            break;
          }
          
          // Try ObjectId comparison
          if (ObjectId.isValid(productIdStr) && ObjectId.isValid(searchIdStr)) {
            try {
              if (new ObjectId(productIdStr).equals(new ObjectId(searchIdStr))) {
                console.log(`🆘 LAST RESORT: Found product via ObjectId! ID: ${productIdStr}`);
                product = p;
                break;
              }
            } catch (e) {
              // Ignore
            }
          }
        }
        
        if (!product) {
          console.error(`❌ LAST RESORT FAILED: Product with ID ${id} not found`);
          console.error(`📋 Available product IDs:`, allProducts.map(p => ({
            id: p.id,
            idString: String(p.id),
            idType: typeof p.id
          })));
          throw new NotFoundException(`Product with ID ${id} not found`);
        }
      } catch (error: any) {
        if (error instanceof NotFoundException) {
          throw error;
        }
        console.error(`❌ LAST RESORT ERROR:`, error);
        throw new NotFoundException(`Product with ID ${id} not found`);
      }
    }

    console.log(`✅ findOne: Found product with ID: ${product.id?.toString()}`);
    return this.formatProduct(product);
  }

  async findBySlug(slug: string): Promise<Product> {
    const product = await this.productRepository.findOne({ where: { slug } });

    if (!product) {
      throw new NotFoundException(`Product with slug ${slug} not found`);
    }

    return this.formatProduct(product);
  }

  async findByCategory(category: string): Promise<Product[]> {
    const products = await this.productRepository.find({
      where: { category: category as any },
    });
    return products.map(this.formatProduct);
  }

  async update(id: string, updateProductDto: UpdateProductDto): Promise<Product> {
    let rawProduct: Product | null = null;
    const manager = this.productRepository.manager;
    
    console.log(`🔍 update: Looking for product with ID: ${id}`);
    
    // Try multiple strategies to find the product
    // Strategy 4 FIRST since we know the product exists and can be retrieved via findAll
    try {
      // Strategy 1: Get all products and find by ID string match (MOST RELIABLE - product exists!)
      try {
        console.log(`🔍 Strategy 1: Searching all products for ID: "${id}" (type: ${typeof id})`);
        const allProducts = await this.productRepository.find();
        console.log(`📦 Found ${allProducts.length} total products`);
        
        if (allProducts.length > 0) {
          console.log(`📋 First 3 product IDs:`, allProducts.slice(0, 3).map(p => ({
            rawId: p.id,
            idType: typeof p.id,
            idString: String(p.id),
            idToString: p.id?.toString(),
            idConstructor: p.id?.constructor?.name
          })));
        }
        
        // Normalize the search ID
        const searchIdNormalized = String(id).trim().toLowerCase();
        
        // Try to find the product with multiple comparison methods
        for (const p of allProducts) {
          if (!p.id) {
            console.log(`⚠️ Product has no ID:`, p);
            continue;
          }
          
          // Try multiple ID formats
          const productIdVariants = [
            String(p.id),
            String(p.id).trim(),
            String(p.id).toLowerCase(),
            p.id?.toString(),
            p.id?.toString()?.trim(),
            p.id?.toString()?.toLowerCase(),
          ].filter(Boolean);
          
          for (const productIdStr of productIdVariants) {
            const normalized = String(productIdStr).trim().toLowerCase();
            
            // Exact match (case-insensitive)
            if (normalized === searchIdNormalized) {
              console.log(`✅ Strategy 1: Found exact match! Product ID: "${productIdStr}" (normalized: "${normalized}")`);
              rawProduct = p;
              break;
            }
          }
          
          if (rawProduct) break;
          
          // ObjectId comparison (if both are valid ObjectIds)
          const productIdStr = String(p.id);
          if (ObjectId.isValid(productIdStr) && ObjectId.isValid(id)) {
            try {
              const productObjId = new ObjectId(productIdStr);
              const searchObjId = new ObjectId(id);
              if (productObjId.equals(searchObjId)) {
                console.log(`✅ Strategy 1: Found ObjectId match! Product ID: "${productIdStr}"`);
                rawProduct = p;
                break;
              }
            } catch (e) {
              // Ignore ObjectId conversion errors
            }
          }
        }
        
        if (!rawProduct) {
          console.log(`❌ Strategy 1: No match found. Looking for: "${id}" (normalized: "${searchIdNormalized}")`);
          console.log(`📋 All product IDs in DB:`, allProducts.map((p, i) => 
            `[${i}] "${String(p.id)}" (type: ${typeof p.id})`
          ).join(', '));
        }
      } catch (error) {
        console.error(`❌ Strategy 1 failed for ID ${id}:`, error);
      }
      
      // Strategy 2: Try with MongoDB manager using _id
      if (!rawProduct && ObjectId.isValid(id)) {
        try {
          const mongoRepository = manager.getMongoRepository(Product);
          const objectId = toObjectId(id);
          console.log(`🔍 Strategy 2: Trying with MongoDB manager _id: ${objectId.toString()}`);
          
          // Try different query formats
          rawProduct = await mongoRepository.findOne({
            where: { _id: objectId } as any,
          });
          
          if (!rawProduct) {
            // Try with id field instead of _id
            rawProduct = await mongoRepository.findOne({
              where: { id: objectId } as any,
            });
          }
          
          if (rawProduct) {
            console.log(`✅ Strategy 2: Found product with ID: ${rawProduct.id?.toString()}`);
          } else {
            console.log(`❌ Strategy 2: Product not found with _id or id`);
          }
        } catch (error) {
          console.warn(`❌ Strategy 2 failed for ID ${id}:`, error);
        }
      }
      
      // Strategy 3: Try with TypeORM repository using ObjectId
      if (!rawProduct && ObjectId.isValid(id)) {
        try {
          const objectId = toObjectId(id);
          console.log(`🔍 Strategy 3: Trying with TypeORM repository ObjectId: ${objectId.toString()}`);
          rawProduct = await this.productRepository.findOne({ where: { id: objectId as any } });
          if (rawProduct) {
            console.log(`✅ Strategy 3: Found product with ID: ${rawProduct.id?.toString()}`);
          }
        } catch (error) {
          console.warn(`❌ Strategy 3 failed for ID ${id}:`, error);
        }
      }
      
      // Strategy 4: Try as string ID with TypeORM repository
      if (!rawProduct) {
        try {
          console.log(`🔍 Strategy 4: Trying with string ID: ${id}`);
          rawProduct = await this.productRepository.findOne({ where: { id: id as any } });
          if (rawProduct) {
            console.log(`✅ Strategy 4: Found product with ID: ${rawProduct.id?.toString()}`);
          }
        } catch (error) {
          console.warn(`❌ Strategy 4 failed for ID ${id}:`, error);
        }
      }
      
      // Strategy 5: Use MongoDB native driver directly (ultimate fallback)
      if (!rawProduct && ObjectId.isValid(id)) {
        try {
          console.log(`🔍 Strategy 5: Using MongoDB native driver for ID: ${id}`);
          const objectId = toObjectId(id);
          const mongoConnection = manager.connection;
          
          // Try different ways to access MongoDB database
          let db: any = null;
          if ((mongoConnection as any).driver?.database) {
            db = (mongoConnection as any).driver.database;
          } else if ((mongoConnection as any).queryRunner?.databaseConnection) {
            db = (mongoConnection as any).queryRunner.databaseConnection.db();
          } else if ((mongoConnection as any).mongoManager) {
            // Try to get db from mongoManager
            const mongoManager = (mongoConnection as any).mongoManager;
            if (mongoManager.db) {
              db = mongoManager.db;
            } else if (mongoManager.connection?.db) {
              db = mongoManager.connection.db;
            }
          }
          
          if (db) {
            const productsCollection = db.collection('products');
            const mongoDoc = await productsCollection.findOne({ _id: objectId });
            
            if (mongoDoc) {
              console.log(`✅ Strategy 5: Found document in MongoDB:`, mongoDoc._id.toString());
              
              // Try to find using TypeORM with the ObjectId we know exists
              rawProduct = await this.productRepository.findOne({ 
                where: { id: objectId as any } 
              });
              
              // If still not found, manually create the entity from MongoDB doc
              if (!rawProduct) {
                console.log(`⚠️ Strategy 5: Document found but TypeORM can't load it, creating entity manually`);
                const created = this.productRepository.create({
                  id: objectId,
                  slug: mongoDoc.slug,
                  name: mongoDoc.name,
                  description: mongoDoc.description,
                  notes: mongoDoc.notes || null,
                  price: mongoDoc.price,
                  sizes: mongoDoc.sizes || '',
                  defaultSize: mongoDoc.defaultSize,
                  category: mongoDoc.category,
                  isBestSeller: mongoDoc.isBestSeller || false,
                  isNewArrival: mongoDoc.isNewArrival || false,
                  image: mongoDoc.image,
                  gallery: mongoDoc.gallery || null,
                  createdAt: mongoDoc.createdAt,
                  updatedAt: mongoDoc.updatedAt,
                } as any);
                // create() returns an array, get first element
                rawProduct = Array.isArray(created) ? created[0] : created;
              }
            } else {
              console.log(`❌ Strategy 5: Document not found in MongoDB collection`);
            }
          } else {
            console.warn(`❌ Strategy 5: Could not access MongoDB database`);
          }
        } catch (error) {
          console.warn(`❌ Strategy 5 failed for ID ${id}:`, error);
        }
      }
    } catch (error) {
      console.error(`❌ All strategies failed for ID ${id}:`, error);
    }
    
    if (!rawProduct) {
      // Last resort: Try one more time with findAll and very loose matching
      try {
        console.log(`🆘 LAST RESORT: Trying findAll one more time with ID: ${id}`);
        const allProducts = await this.productRepository.find();
        console.log(`🆘 LAST RESORT: Found ${allProducts.length} products`);
        
        // Try every possible ID format
        for (const p of allProducts) {
          if (!p.id) continue;
          
          const productIdStr = String(p.id).trim();
          const searchIdStr = String(id).trim();
          
          // Try every comparison method
          if (
            productIdStr === searchIdStr ||
            productIdStr.toLowerCase() === searchIdStr.toLowerCase() ||
            productIdStr.replace(/\s/g, '') === searchIdStr.replace(/\s/g, '')
          ) {
            console.log(`🆘 LAST RESORT: Found product! ID: ${productIdStr}`);
            rawProduct = p;
            break;
          }
          
          // Try ObjectId comparison
          if (ObjectId.isValid(productIdStr) && ObjectId.isValid(searchIdStr)) {
            try {
              if (new ObjectId(productIdStr).equals(new ObjectId(searchIdStr))) {
                console.log(`🆘 LAST RESORT: Found product via ObjectId! ID: ${productIdStr}`);
                rawProduct = p;
                break;
              }
            } catch (e) {
              // Ignore
            }
          }
        }
        
        if (!rawProduct) {
          console.error(`❌ LAST RESORT FAILED: Product with ID ${id} not found`);
          console.error(`📋 Available product IDs:`, allProducts.map(p => ({
            id: p.id,
            idString: String(p.id),
            idType: typeof p.id
          })));
          throw new NotFoundException(`Product with ID ${id} not found`);
        }
      } catch (error: any) {
        if (error instanceof NotFoundException) {
          throw error;
        }
        console.error(`❌ LAST RESORT ERROR:`, error);
      throw new NotFoundException(`Product with ID ${id} not found`);
      }
    }
    
    console.log(`✅ update: Found product with ID: ${rawProduct.id?.toString()}, proceeding with update`);

    if (updateProductDto.name && updateProductDto.name !== rawProduct.name) {
      const newSlug = this.generateSlug(updateProductDto.name);
      const existingProduct = await this.productRepository.findOne({
        where: { slug: newSlug },
      });

      if (existingProduct && existingProduct.id.toString() !== id) {
        throw new BadRequestException('Product with this name already exists');
      }

      rawProduct.slug = newSlug;
      rawProduct.name = updateProductDto.name;
    }

    if (updateProductDto.description !== undefined) {
      rawProduct.description = updateProductDto.description;
    }

    if (updateProductDto.notes !== undefined) {
      rawProduct.notes = updateProductDto.notes;
    }

    if (updateProductDto.price !== undefined) {
      rawProduct.price = updateProductDto.price;
    }

    if (updateProductDto.sizes !== undefined) {
      rawProduct.sizes = updateProductDto.sizes.join(',');
    }

    if (updateProductDto.defaultSize !== undefined) {
      rawProduct.defaultSize = updateProductDto.defaultSize;
    }

    if (updateProductDto.category !== undefined) {
      rawProduct.category = updateProductDto.category;
    }

    if (updateProductDto.isBestSeller !== undefined) {
      rawProduct.isBestSeller = updateProductDto.isBestSeller;
    }

    if (updateProductDto.isNewArrival !== undefined) {
      rawProduct.isNewArrival = updateProductDto.isNewArrival;
    }

    if (updateProductDto.image !== undefined) {
      rawProduct.image = updateProductDto.image;
    }

    if (updateProductDto.gallery !== undefined) {
      rawProduct.gallery = updateProductDto.gallery.join(',');
    }

    const savedProduct = await this.productRepository.save(rawProduct);
    const formattedProduct = this.formatProduct(savedProduct);
    this.adminWebsocketGateway.emitProductUpdated(formattedProduct);
    this.publicWebsocketGateway.emitProductUpdated(formattedProduct);
    return formattedProduct;
  }

  async remove(id: string): Promise<void> {
    let product: Product | null = null;
    const manager = this.productRepository.manager;
    
    console.log(`🔍 remove: Looking for product with ID: ${id}`);
    
    // Try multiple strategies to find the product
    // Strategy 1 FIRST since we know the product exists and can be retrieved via findAll
    try {
      // Strategy 1: Get all products and find by ID string match (MOST RELIABLE - product exists!)
      try {
        console.log(`🔍 Strategy 1: Searching all products for ID: "${id}" (type: ${typeof id})`);
        const allProducts = await this.productRepository.find();
        console.log(`📦 Found ${allProducts.length} total products`);
        
        if (allProducts.length > 0) {
          console.log(`📋 First 3 product IDs:`, allProducts.slice(0, 3).map(p => ({
            rawId: p.id,
            idType: typeof p.id,
            idString: String(p.id),
            idToString: p.id?.toString(),
            idConstructor: p.id?.constructor?.name
          })));
        }
        
        // Normalize the search ID
        const searchIdNormalized = String(id).trim().toLowerCase();
        
        // Try to find the product with multiple comparison methods
        for (const p of allProducts) {
          if (!p.id) {
            console.log(`⚠️ Product has no ID:`, p);
            continue;
          }
          
          // Try multiple ID formats
          const productIdVariants = [
            String(p.id),
            String(p.id).trim(),
            String(p.id).toLowerCase(),
            p.id?.toString(),
            p.id?.toString()?.trim(),
            p.id?.toString()?.toLowerCase(),
          ].filter(Boolean);
          
          for (const productIdStr of productIdVariants) {
            const normalized = String(productIdStr).trim().toLowerCase();
            
            // Exact match (case-insensitive)
            if (normalized === searchIdNormalized) {
              console.log(`✅ Strategy 1: Found exact match! Product ID: "${productIdStr}" (normalized: "${normalized}")`);
              product = p;
              break;
            }
          }
          
          if (product) break;
          
          // ObjectId comparison (if both are valid ObjectIds)
          const productIdStr = String(p.id);
          if (ObjectId.isValid(productIdStr) && ObjectId.isValid(id)) {
            try {
              const productObjId = new ObjectId(productIdStr);
              const searchObjId = new ObjectId(id);
              if (productObjId.equals(searchObjId)) {
                console.log(`✅ Strategy 1: Found ObjectId match! Product ID: "${productIdStr}"`);
                product = p;
                break;
              }
            } catch (e) {
              // Ignore ObjectId conversion errors
            }
          }
        }
        
        if (!product) {
          console.log(`❌ Strategy 1: No match found. Looking for: "${id}" (normalized: "${searchIdNormalized}")`);
          console.log(`📋 All product IDs in DB:`, allProducts.map((p, i) => 
            `[${i}] "${String(p.id)}" (type: ${typeof p.id})`
          ).join(', '));
        }
      } catch (error) {
        console.error(`❌ Strategy 1 failed for ID ${id}:`, error);
      }
      
      // Strategy 2: Try with MongoDB manager using _id
      if (!product && ObjectId.isValid(id)) {
        try {
          const mongoRepository = manager.getMongoRepository(Product);
          const objectId = toObjectId(id);
          console.log(`🔍 Strategy 2: Trying with MongoDB manager _id: ${objectId.toString()}`);
          
          // Try different query formats
          product = await mongoRepository.findOne({
            where: { _id: objectId } as any,
          });
          
          if (!product) {
            // Try with id field instead of _id
            product = await mongoRepository.findOne({
              where: { id: objectId } as any,
            });
          }
          
          if (product) {
            console.log(`✅ Strategy 2: Found product with ID: ${product.id?.toString()}`);
          } else {
            console.log(`❌ Strategy 2: Product not found with _id or id`);
          }
        } catch (error) {
          console.warn(`❌ Strategy 2 failed for ID ${id}:`, error);
        }
      }
      
      // Strategy 3: Try with TypeORM repository using ObjectId
      if (!product && ObjectId.isValid(id)) {
        try {
          const objectId = toObjectId(id);
          console.log(`🔍 Strategy 3: Trying with TypeORM repository ObjectId: ${objectId.toString()}`);
          product = await this.productRepository.findOne({ where: { id: objectId as any } });
          if (product) {
            console.log(`✅ Strategy 3: Found product with ID: ${product.id?.toString()}`);
          }
        } catch (error) {
          console.warn(`❌ Strategy 3 failed for ID ${id}:`, error);
        }
      }
      
      // Strategy 4: Try as string ID with TypeORM repository
      if (!product) {
        try {
          console.log(`🔍 Strategy 4: Trying with string ID: ${id}`);
          product = await this.productRepository.findOne({ where: { id: id as any } });
          if (product) {
            console.log(`✅ Strategy 4: Found product with ID: ${product.id?.toString()}`);
          }
        } catch (error) {
          console.warn(`❌ Strategy 4 failed for ID ${id}:`, error);
        }
      }
      
      // Strategy 5: Use MongoDB native driver directly (ultimate fallback)
      if (!product && ObjectId.isValid(id)) {
        try {
          console.log(`🔍 Strategy 5: Using MongoDB native driver for ID: ${id}`);
          const objectId = toObjectId(id);
          const mongoConnection = manager.connection;
          
          // Try different ways to access MongoDB database
          let db: any = null;
          if ((mongoConnection as any).driver?.database) {
            db = (mongoConnection as any).driver.database;
          } else if ((mongoConnection as any).queryRunner?.databaseConnection) {
            db = (mongoConnection as any).queryRunner.databaseConnection.db();
          } else if ((mongoConnection as any).mongoManager) {
            // Try to get db from mongoManager
            const mongoManager = (mongoConnection as any).mongoManager;
            if (mongoManager.db) {
              db = mongoManager.db;
            } else if (mongoManager.connection?.db) {
              db = mongoManager.connection.db;
            }
          }
          
          if (db) {
            const productsCollection = db.collection('products');
            const mongoDoc = await productsCollection.findOne({ _id: objectId });
            
            if (mongoDoc) {
              console.log(`✅ Strategy 5: Found document in MongoDB:`, mongoDoc._id.toString());
              
              // Try to find using TypeORM with the ObjectId we know exists
              product = await this.productRepository.findOne({ 
                where: { id: objectId as any } 
              });
              
              // If still not found, manually create the entity from MongoDB doc
              if (!product) {
                console.log(`⚠️ Strategy 5: Document found but TypeORM can't load it, creating entity manually`);
                const created = this.productRepository.create({
                  id: objectId,
                  slug: mongoDoc.slug,
                  name: mongoDoc.name,
                  description: mongoDoc.description,
                  notes: mongoDoc.notes || null,
                  price: mongoDoc.price,
                  sizes: mongoDoc.sizes || '',
                  defaultSize: mongoDoc.defaultSize,
                  category: mongoDoc.category,
                  isBestSeller: mongoDoc.isBestSeller || false,
                  isNewArrival: mongoDoc.isNewArrival || false,
                  image: mongoDoc.image,
                  gallery: mongoDoc.gallery || null,
                  createdAt: mongoDoc.createdAt,
                  updatedAt: mongoDoc.updatedAt,
                } as any);
                // create() returns an array, get first element
                product = Array.isArray(created) ? created[0] : created;
              }
            } else {
              console.log(`❌ Strategy 5: Document not found in MongoDB collection`);
            }
          } else {
            console.warn(`❌ Strategy 5: Could not access MongoDB database`);
          }
        } catch (error) {
          console.warn(`❌ Strategy 5 failed for ID ${id}:`, error);
        }
      }
    } catch (error) {
      console.error(`❌ All strategies failed for ID ${id}:`, error);
    }
    
    if (!product) {
      // Last resort: Try one more time with findAll and very loose matching
      try {
        console.log(`🆘 LAST RESORT: Trying findAll one more time with ID: ${id}`);
        const allProducts = await this.productRepository.find();
        console.log(`🆘 LAST RESORT: Found ${allProducts.length} products`);
        
        // Try every possible ID format
        for (const p of allProducts) {
          if (!p.id) continue;
          
          const productIdStr = String(p.id).trim();
          const searchIdStr = String(id).trim();
          
          // Try every comparison method
          if (
            productIdStr === searchIdStr ||
            productIdStr.toLowerCase() === searchIdStr.toLowerCase() ||
            productIdStr.replace(/\s/g, '') === searchIdStr.replace(/\s/g, '')
          ) {
            console.log(`🆘 LAST RESORT: Found product! ID: ${productIdStr}`);
            product = p;
            break;
          }
          
          // Try ObjectId comparison
          if (ObjectId.isValid(productIdStr) && ObjectId.isValid(searchIdStr)) {
            try {
              if (new ObjectId(productIdStr).equals(new ObjectId(searchIdStr))) {
                console.log(`🆘 LAST RESORT: Found product via ObjectId! ID: ${productIdStr}`);
                product = p;
                break;
              }
            } catch (e) {
              // Ignore
            }
          }
        }
        
        if (!product) {
          console.error(`❌ LAST RESORT FAILED: Product with ID ${id} not found`);
          console.error(`📋 Available product IDs:`, allProducts.map(p => ({
            id: p.id,
            idString: String(p.id),
            idType: typeof p.id
          })));
          throw new NotFoundException(`Product with ID ${id} not found`);
        }
      } catch (error: any) {
        if (error instanceof NotFoundException) {
          throw error;
        }
        console.error(`❌ LAST RESORT ERROR:`, error);
        throw new NotFoundException(`Product with ID ${id} not found`);
      }
    }
    
    console.log(`✅ remove: Found product with ID: ${product.id?.toString()}, proceeding with deletion`);
    await this.productRepository.remove(product);
    this.adminWebsocketGateway.emitProductDeleted(id);
    this.publicWebsocketGateway.emitProductDeleted(id);
  }

  private formatProduct(product: Product): any {
    try {
      return {
        id: product.id?.toString() || product.id,
        ...product,
        sizes: typeof product.sizes === 'string' 
          ? product.sizes.split(',').map(Number).filter(n => !isNaN(n))
          : Array.isArray(product.sizes) 
            ? product.sizes 
            : [],
        gallery: typeof product.gallery === 'string'
          ? product.gallery.split(',').filter(Boolean)
          : Array.isArray(product.gallery)
            ? product.gallery
            : product.image ? [product.image] : [],
      };
    } catch (error) {
      // If formatting fails, return product as-is
      return {
        ...product,
        id: product.id?.toString() || product.id,
        sizes: [],
        gallery: product.image ? [product.image] : [],
      };
    }
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}

