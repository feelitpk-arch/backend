import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Admin } from '../entities/admin.entity';
import { Product, ProductCategory } from '../entities/product.entity';
import { Category } from '../entities/category.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';

@Injectable()
export class SeedService {
  constructor(
    @InjectRepository(Admin)
    private adminRepository: Repository<Admin>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
  ) {}

  async seed() {
    console.log('🌱 Starting database seeding...\n');
    
    console.log('👤 Seeding admins...');
    await this.seedAdmin();
    console.log('✅ Admins seeded\n');
    
    console.log('📁 Seeding categories...');
    await this.seedCategories();
    console.log('✅ Categories seeded\n');
    
    console.log('🛍️  Seeding products...');
    await this.seedProducts();
    console.log('✅ Products seeded\n');
    
    console.log('📦 Seeding orders...');
    await this.seedOrders();
    
    console.log('\n🎉 Database seeding completed!');
  }

  private async seedAdmin() {
    // Create default admin
    const existingAdmin = await this.adminRepository.findOne({
      where: { username: 'admin' },
    });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const admin = this.adminRepository.create({
        username: 'admin',
        password: hashedPassword,
        email: 'admin@feelit.com',
        isActive: true,
      });
      await this.adminRepository.save(admin);
    }

    // Create/Update feelit.zain admin
    const existingZain = await this.adminRepository.findOne({
      where: { username: 'feelit.zain@feelit.com' },
    });

    const hashedPasswordZain = await bcrypt.hash('Zain@1122', 10);
    if (existingZain) {
      // Update existing user
      existingZain.password = hashedPasswordZain;
      existingZain.email = 'feelit.zain@feelit.com';
      existingZain.isActive = true;
      await this.adminRepository.save(existingZain);
    } else {
      // Create new user
      const zain = this.adminRepository.create({
        username: 'feelit.zain@feelit.com',
        password: hashedPasswordZain,
        email: 'feelit.zain@feelit.com',
        isActive: true,
      });
      await this.adminRepository.save(zain);
    }
    
    // Also keep feetitzain for backward compatibility
    const existingFeetitzain = await this.adminRepository.findOne({
      where: { username: 'feetitzain' },
    });

    const hashedPasswordFeetitzain = await bcrypt.hash('Zain@1122', 10);
    if (existingFeetitzain) {
      // Update existing user
      existingFeetitzain.password = hashedPasswordFeetitzain;
      existingFeetitzain.email = 'feetitzain@feelit.com';
      existingFeetitzain.isActive = true;
      await this.adminRepository.save(existingFeetitzain);
    } else {
      // Create new user
      const feetitzain = this.adminRepository.create({
        username: 'feetitzain',
        password: hashedPasswordFeetitzain,
        email: 'feetitzain@feelit.com',
        isActive: true,
      });
      await this.adminRepository.save(feetitzain);
    }
  }

  private async seedCategories() {
    const categories = [
      { key: ProductCategory.BEST_SELLERS, label: 'Best Sellers' },
      { key: ProductCategory.WEEKLY_DEALS, label: 'Weekly Deals' },
      { key: ProductCategory.TESTERS, label: 'Testers' },
      { key: ProductCategory.EXPLORER_KITS, label: 'Explorers Kits' },
      { key: ProductCategory.MEN, label: 'Men' },
      { key: ProductCategory.WOMEN, label: 'Women' },
      { key: ProductCategory.NEW_ARRIVALS, label: 'New Arrivals' },
      { key: ProductCategory.COLOGNES, label: 'Colognes' },
      { key: ProductCategory.ROLL_ONS, label: 'Roll-Ons' },
    ];

    for (const cat of categories) {
      const existing = await this.categoryRepository.findOne({
        where: { key: cat.key },
      });
      if (!existing) {
        const category = this.categoryRepository.create(cat);
        await this.categoryRepository.save(category);
      }
    }
  }

  private async seedProducts() {
    const products = [
      {
        slug: 'noir-amber-eau-de-parfum',
        name: 'Noir Amber Eau De Parfum',
        description: 'A deep amber blend with soft vanilla and smoky woods.',
        notes: 'Amber, vanilla, incense, sandalwood',
        price: 3899,
        sizes: '50,100',
        defaultSize: 100,
        category: ProductCategory.MEN,
        isBestSeller: true,
        isNewArrival: true,
        image: '/images/products/noir-amber-1.jpg',
        gallery: '/images/products/noir-amber-1.jpg,/images/products/noir-amber-2.jpg',
      },
      {
        slug: 'celestial-musk',
        name: 'Celestial Musk',
        description: 'Airy white musk wrapped in clean florals and soft woods.',
        notes: 'White musk, jasmine, pear blossom, cashmere wood',
        price: 3499,
        sizes: '50,100',
        defaultSize: 50,
        category: ProductCategory.WOMEN,
        isBestSeller: true,
        image: '/images/products/celestial-musk-1.jpg',
        gallery: '/images/products/celestial-musk-1.jpg,/images/products/celestial-musk-2.jpg',
      },
      {
        slug: 'desert-oud-essence',
        name: 'Desert Oud Essence',
        description: 'Smoky oud with saffron and dried fruits for a rich trail.',
        notes: 'Oud, saffron, dried plum, patchouli',
        price: 5299,
        sizes: '50,100',
        defaultSize: 50,
        category: ProductCategory.COLOGNES,
        isBestSeller: true,
        image: '/images/products/desert-oud-1.jpg',
        gallery: '/images/products/desert-oud-1.jpg,/images/products/desert-oud-2.jpg',
      },
    ];

    for (const productData of products) {
      const existing = await this.productRepository.findOne({
        where: { slug: productData.slug },
      });
      if (!existing) {
        const product = this.productRepository.create(productData);
        await this.productRepository.save(product);
      }
    }
  }

  private async seedOrders() {
    // Get products to use in orders
    const products = await this.productRepository.find();
    if (products.length === 0) {
      console.log('⚠️ No products found. Skipping order seeding.');
      return; // No products available to create orders
    }

    console.log(`📦 Found ${products.length} products. Creating orders...`);

    // Sample orders data
    const ordersData = [
      {
        customerName: 'Ahmed Ali',
        email: 'ahmed.ali@example.com',
        phone: '+923001234567',
        address: '123 Main Street, Block A',
        city: 'Karachi',
        postalCode: '75500',
        status: OrderStatus.PENDING,
        items: [
          { productIndex: 0, quantity: 2, size: 100 },
        ],
      },
      {
        customerName: 'Fatima Khan',
        email: 'fatima.khan@example.com',
        phone: '+923001234568',
        address: '456 Park Avenue, Block B',
        city: 'Lahore',
        postalCode: '54000',
        status: OrderStatus.PROCESSING,
        items: [
          { productIndex: 1, quantity: 1, size: 50 },
          { productIndex: 2, quantity: 1, size: 50 },
        ],
      },
      {
        customerName: 'Hassan Malik',
        email: 'hassan.malik@example.com',
        phone: '+923001234569',
        address: '789 Garden Road, Block C',
        city: 'Islamabad',
        postalCode: '44000',
        status: OrderStatus.SHIPPED,
        items: [
          { productIndex: 0, quantity: 1, size: 100 },
        ],
      },
      {
        customerName: 'Sara Ahmed',
        email: 'sara.ahmed@example.com',
        phone: '+923001234570',
        address: '321 Market Street, Block D',
        city: 'Karachi',
        postalCode: '75500',
        status: OrderStatus.DELIVERED,
        items: [
          { productIndex: 1, quantity: 2, size: 50 },
        ],
      },
      {
        customerName: 'Omar Sheikh',
        email: 'omar.sheikh@example.com',
        phone: '+923001234571',
        address: '654 Business Plaza, Block E',
        city: 'Lahore',
        postalCode: '54000',
        status: OrderStatus.DELIVERED,
        items: [
          { productIndex: 2, quantity: 1, size: 100 },
        ],
      },
    ];

    let createdCount = 0;
    let skippedCount = 0;

    // Create orders
    for (const orderData of ordersData) {
      try {
        // Check if order with this email already exists
        const existingOrder = await this.orderRepository.findOne({
          where: { email: orderData.email },
        });

        if (existingOrder) {
          console.log(`⏭️  Order for ${orderData.email} already exists. Skipping...`);
          skippedCount++;
          continue; // Skip if order already exists
        }

        // Calculate order total
        let total = 0;
        const orderItems: OrderItem[] = [];

        for (const itemData of orderData.items) {
          const product = products[itemData.productIndex];
          if (!product) {
            console.warn(`⚠️  Product at index ${itemData.productIndex} not found. Skipping item.`);
            continue;
          }

          const itemPrice = Number(product.price) * itemData.quantity;
          total += itemPrice;

          const orderItem = this.orderItemRepository.create({
            product,
            size: itemData.size,
            quantity: itemData.quantity,
            price: itemPrice,
          });

          orderItems.push(orderItem);
        }

        if (orderItems.length === 0) {
          console.warn(`⚠️  No valid items for order ${orderData.email}. Skipping...`);
          continue;
        }

        const shipping = total >= 3999 ? 0 : 200;
        const finalTotal = total + shipping;

        const orderNumber = await this.generateOrderNumber();

        const order = this.orderRepository.create({
          orderNumber,
          customerName: orderData.customerName,
          email: orderData.email,
          phone: orderData.phone,
          address: orderData.address,
          city: orderData.city,
          postalCode: orderData.postalCode,
          total: finalTotal,
          shipping,
          status: orderData.status,
          items: orderItems,
        });

        const savedOrder = await this.orderRepository.save(order);
        console.log(`✅ Created order ${savedOrder.orderNumber} for ${orderData.customerName}`);
        createdCount++;
      } catch (error) {
        console.error(`❌ Error creating order for ${orderData.email}:`, error);
      }
    }

    console.log(`\n📊 Order seeding complete: ${createdCount} created, ${skippedCount} skipped`);
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

