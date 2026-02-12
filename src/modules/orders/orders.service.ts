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
import { Order, OrderStatus } from '../../entities/order.entity';
import { OrderItem } from '../../entities/order-item.entity';
import { Product } from '../../entities/product.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { AdminWebSocketGateway } from '../websocket/websocket.gateway';
import { toObjectId, toStringId } from '../../common/utils/mongodb.util';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @Inject(forwardRef(() => AdminWebSocketGateway))
    private websocketGateway: AdminWebSocketGateway,
  ) {}

  async create(createOrderDto: CreateOrderDto): Promise<Order> {
    const orderNumber = await this.generateOrderNumber();

    let total = 0;
    const orderItems: OrderItem[] = [];

    for (const itemDto of createOrderDto.items) {
      let product: Product | null = null;
      const manager = this.productRepository.manager;
      const id = itemDto.productId;
      
      console.log(`🔍 Order create: Looking for product with ID: ${id}`);
      
      // Use the same comprehensive search strategy as ProductsService
      try {
        // Strategy 1: Get all products and find by ID string match (MOST RELIABLE)
        try {
          console.log(`🔍 Strategy 1: Searching all products for ID: "${id}" (type: ${typeof id})`);
          const allProducts = await this.productRepository.find();
          console.log(`📦 Found ${allProducts.length} total products`);
          
          // Normalize the search ID
          const searchIdNormalized = String(id).trim().toLowerCase();
          
          // Try to find the product with multiple comparison methods
          for (const p of allProducts) {
            if (!p.id) continue;
            
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
                console.log(`✅ Strategy 1: Found exact match! Product ID: "${productIdStr}"`);
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
        } catch (error) {
          console.error(`❌ Strategy 1 failed for ID ${id}:`, error);
        }
        
        // Strategy 2: Try with MongoDB manager using _id
        if (!product && ObjectId.isValid(id)) {
          try {
            const mongoRepository = manager.getMongoRepository(Product);
            const objectId = toObjectId(id);
            product = await mongoRepository.findOne({
              where: { _id: objectId } as any,
            });
            
            if (!product) {
              product = await mongoRepository.findOne({
                where: { id: objectId } as any,
              });
            }
          } catch (error) {
            console.warn(`❌ Strategy 2 failed for ID ${id}:`, error);
          }
        }
        
        // Strategy 3: Try with TypeORM repository using ObjectId
        if (!product && ObjectId.isValid(id)) {
          try {
            const objectId = toObjectId(id);
            product = await this.productRepository.findOne({ where: { id: objectId as any } });
          } catch (error) {
            console.warn(`❌ Strategy 3 failed for ID ${id}:`, error);
          }
        }
        
        // Strategy 4: Try as string ID with TypeORM repository
        if (!product) {
          try {
            product = await this.productRepository.findOne({ where: { id: id as any } });
          } catch (error) {
            console.warn(`❌ Strategy 4 failed for ID ${id}:`, error);
          }
        }
      } catch (error) {
        console.error(`❌ All strategies failed for ID ${id}:`, error);
      }

      if (!product) {
        // Last resort: Try one more time with findAll
        try {
          const allProducts = await this.productRepository.find();
          for (const p of allProducts) {
            if (!p.id) continue;
            
            const productIdStr = String(p.id).trim();
            const searchIdStr = String(id).trim();
            
            if (
              productIdStr === searchIdStr ||
              productIdStr.toLowerCase() === searchIdStr.toLowerCase() ||
              (ObjectId.isValid(productIdStr) && ObjectId.isValid(searchIdStr) &&
               new ObjectId(productIdStr).equals(new ObjectId(searchIdStr)))
            ) {
              console.log(`🆘 LAST RESORT: Found product! ID: ${productIdStr}`);
              product = p;
              break;
            }
          }
        } catch (error) {
          console.error(`❌ LAST RESORT ERROR:`, error);
        }
      }

      if (!product) {
        console.error(`❌ Product with ID ${id} not found`);
        throw new NotFoundException(
          `Product with ID ${id} not found. Please refresh the page and try again.`,
        );
      }
      
      console.log(`✅ Order create: Found product with ID: ${product.id?.toString()}`);

      const itemPrice = Number(product.price) * itemDto.quantity;
      total += itemPrice;

      const orderItem = this.orderItemRepository.create({
        product,
        size: itemDto.size,
        quantity: itemDto.quantity,
        price: itemPrice,
      });

      orderItems.push(orderItem);
    }

    const shipping = total >= 3999 ? 0 : 200;
    const finalTotal = total + shipping;

    const order = this.orderRepository.create({
      orderNumber,
      customerName: createOrderDto.customerName,
      email: createOrderDto.email,
      phone: createOrderDto.phone,
      address: createOrderDto.address,
      city: createOrderDto.city,
      postalCode: createOrderDto.postalCode,
      total: finalTotal,
      shipping,
      status: OrderStatus.PENDING,
      items: orderItems,
    });

    const savedOrder = await this.orderRepository.save(order);
    
    const orderWithRelations = await this.orderRepository.findOne({
      where: { id: savedOrder.id },
      relations: ['items', 'items.product'],
    });

    if (orderWithRelations) {
      const formattedOrder = this.formatOrder(orderWithRelations);
      this.websocketGateway.emitNewOrder(formattedOrder);
      return formattedOrder;
    }

    return this.formatOrder(savedOrder);
  }

  async findAll(status?: OrderStatus): Promise<Order[]> {
    const where = status ? { status } : {};
    const orders = await this.orderRepository.find({
      where,
      relations: ['items', 'items.product'],
      order: { createdAt: 'DESC' },
    });
    return orders.map(order => this.formatOrder(order));
  }

  async findOne(id: string): Promise<Order> {
    let order: Order | null = null;
    const manager = this.orderRepository.manager;
    
    console.log(`🔍 Order findOne: Looking for order with ID: ${id}`);
    
    // Use comprehensive search strategy
    try {
      // Strategy 1: Get all orders and find by ID string match (MOST RELIABLE)
      try {
        const allOrders = await this.orderRepository.find({
          relations: ['items', 'items.product'],
        });
        
        const searchIdNormalized = String(id).trim().toLowerCase();
        
        for (const o of allOrders) {
          if (!o.id) continue;
          
          const orderIdVariants = [
            String(o.id),
            String(o.id).trim(),
            String(o.id).toLowerCase(),
            o.id?.toString(),
            o.id?.toString()?.trim(),
            o.id?.toString()?.toLowerCase(),
          ].filter(Boolean);
          
          for (const orderIdStr of orderIdVariants) {
            const normalized = String(orderIdStr).trim().toLowerCase();
            if (normalized === searchIdNormalized) {
              console.log(`✅ Strategy 1: Found order! ID: "${orderIdStr}"`);
              order = o;
              break;
            }
          }
          
          if (order) break;
          
          // ObjectId comparison
          const orderIdStr = String(o.id);
          if (ObjectId.isValid(orderIdStr) && ObjectId.isValid(id)) {
            try {
              if (new ObjectId(orderIdStr).equals(new ObjectId(id))) {
                console.log(`✅ Strategy 1: Found ObjectId match! Order ID: "${orderIdStr}"`);
                order = o;
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
      if (!order && ObjectId.isValid(id)) {
        try {
          const mongoRepository = manager.getMongoRepository(Order);
          const objectId = toObjectId(id);
          order = await mongoRepository.findOne({
            where: { _id: objectId } as any,
            relations: ['items', 'items.product'],
          });
          
          if (!order) {
            order = await mongoRepository.findOne({
              where: { id: objectId } as any,
              relations: ['items', 'items.product'],
            });
          }
        } catch (error) {
          console.warn(`❌ Strategy 2 failed for ID ${id}:`, error);
        }
      }
      
      // Strategy 3: Try with TypeORM repository using ObjectId
      if (!order && ObjectId.isValid(id)) {
        try {
          const objectId = toObjectId(id);
          order = await this.orderRepository.findOne({
            where: { id: objectId as any },
            relations: ['items', 'items.product'],
          });
        } catch (error) {
          console.warn(`❌ Strategy 3 failed for ID ${id}:`, error);
        }
      }
      
      // Strategy 4: Try as string ID
      if (!order) {
        try {
          order = await this.orderRepository.findOne({
            where: { id: id as any },
            relations: ['items', 'items.product'],
          });
        } catch (error) {
          console.warn(`❌ Strategy 4 failed for ID ${id}:`, error);
        }
      }
    } catch (error) {
      console.error(`❌ All strategies failed for ID ${id}:`, error);
    }

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    console.log(`✅ Order findOne: Found order with ID: ${order.id?.toString()}`);
    return this.formatOrder(order);
  }

  async updateStatus(
    id: string,
    updateOrderStatusDto: UpdateOrderStatusDto,
  ): Promise<Order> {
    // Find raw order entity (not formatted)
    let order: Order | null = null;
    const manager = this.orderRepository.manager;
    
    console.log(`🔍 Order updateStatus: Looking for order with ID: ${id}`);
    
    // Use comprehensive search strategy to find raw entity
    try {
      // Strategy 1: Get all orders and find by ID string match
      try {
        const allOrders = await this.orderRepository.find({
          relations: ['items', 'items.product'],
        });
        
        const searchIdNormalized = String(id).trim().toLowerCase();
        
        for (const o of allOrders) {
          if (!o.id) continue;
          
          const orderIdVariants = [
            String(o.id),
            String(o.id).trim(),
            String(o.id).toLowerCase(),
            o.id?.toString(),
            o.id?.toString()?.trim(),
            o.id?.toString()?.toLowerCase(),
          ].filter(Boolean);
          
          for (const orderIdStr of orderIdVariants) {
            const normalized = String(orderIdStr).trim().toLowerCase();
            if (normalized === searchIdNormalized) {
              order = o;
              break;
            }
          }
          
          if (order) break;
          
          // ObjectId comparison
          const orderIdStr = String(o.id);
          if (ObjectId.isValid(orderIdStr) && ObjectId.isValid(id)) {
            try {
              if (new ObjectId(orderIdStr).equals(new ObjectId(id))) {
                order = o;
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
      
      // Strategy 2: Try with MongoDB manager
      if (!order && ObjectId.isValid(id)) {
        try {
          const mongoRepository = manager.getMongoRepository(Order);
          const objectId = toObjectId(id);
          order = await mongoRepository.findOne({
            where: { _id: objectId } as any,
            relations: ['items', 'items.product'],
          });
          
          if (!order) {
            order = await mongoRepository.findOne({
              where: { id: objectId } as any,
              relations: ['items', 'items.product'],
            });
          }
        } catch (error) {
          console.warn(`❌ Strategy 2 failed for ID ${id}:`, error);
        }
      }
      
      // Strategy 3: Try with TypeORM repository using ObjectId
      if (!order && ObjectId.isValid(id)) {
        try {
          const objectId = toObjectId(id);
          order = await this.orderRepository.findOne({
            where: { id: objectId as any },
            relations: ['items', 'items.product'],
          });
        } catch (error) {
          console.warn(`❌ Strategy 3 failed for ID ${id}:`, error);
        }
      }
      
      // Strategy 4: Try as string ID
      if (!order) {
        try {
          order = await this.orderRepository.findOne({
            where: { id: id as any },
            relations: ['items', 'items.product'],
          });
        } catch (error) {
          console.warn(`❌ Strategy 4 failed for ID ${id}:`, error);
        }
      }
    } catch (error) {
      console.error(`❌ All strategies failed for ID ${id}:`, error);
    }

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    console.log(`✅ Order updateStatus: Found order with ID: ${order.id?.toString()}`);
    order.status = updateOrderStatusDto.status;
    const updatedOrder = await this.orderRepository.save(order);
    
    const orderWithRelations = await this.orderRepository.findOne({
      where: { id: updatedOrder.id },
      relations: ['items', 'items.product'],
    });

    if (orderWithRelations) {
      const formattedOrder = this.formatOrder(orderWithRelations);
      this.websocketGateway.emitOrderStatusChange(
        id,
        updateOrderStatusDto.status,
        formattedOrder,
      );
      return formattedOrder;
    }

    return this.formatOrder(updatedOrder);
  }

  async remove(id: string): Promise<void> {
    const order = await this.findOne(id);
    await this.orderRepository.remove(order);
  }

  private formatOrder(order: Order): any {
    try {
      return {
        id: toStringId(order.id),
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        email: order.email,
        phone: order.phone,
        address: order.address,
        city: order.city,
        postalCode: order.postalCode,
        status: order.status,
        total: Number(order.total),
        shipping: Number(order.shipping),
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: order.items?.map(item => ({
          id: toStringId(item.id),
          product: {
            id: toStringId(item.product?.id),
            name: item.product?.name || '',
            image: item.product?.image || '',
          },
          size: item.size,
          quantity: item.quantity,
          price: Number(item.price),
        })) || [],
      };
    } catch (error) {
      // If formatting fails, return order with basic formatting
      return {
        ...order,
        id: toStringId(order.id),
        total: Number(order.total),
        shipping: Number(order.shipping),
        items: order.items?.map(item => ({
          ...item,
          id: toStringId(item.id),
          product: item.product ? {
            ...item.product,
            id: toStringId(item.product.id),
          } : null,
        })) || [],
      };
    }
  }

  private async generateOrderNumber(): Promise<string> {
    const lastOrder = await this.orderRepository.findOne({
      order: { createdAt: 'DESC' },
    });

    let nextNumber = 1001;
    if (lastOrder) {
      const lastNumber = parseInt(lastOrder.orderNumber.replace('#', ''));
      nextNumber = lastNumber + 1;
    }

    return `#${nextNumber}`;
  }
}

