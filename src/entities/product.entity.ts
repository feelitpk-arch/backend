import {
  Entity,
  ObjectIdColumn,
  ObjectId,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Category } from './category.entity';
import { OrderItem } from './order-item.entity';

export enum ProductCategory {
  BEST_SELLERS = 'best-sellers',
  WEEKLY_DEALS = 'weekly-deals',
  TESTERS = 'testers',
  EXPLORER_KITS = 'explorer-kits',
  MEN = 'men',
  WOMEN = 'women',
  NEW_ARRIVALS = 'new-arrivals',
  COLOGNES = 'colognes',
  ROLL_ONS = 'roll-ons',
}

@Entity('products')
export class Product {
  @ObjectIdColumn()
  id: ObjectId;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column('text')
  description: string;

  @Column('text', { nullable: true })
  notes: string;

  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  @Column('simple-array')
  sizes: string;

  @Column()
  defaultSize: number;

  @Column({
    type: 'varchar',
    enum: ProductCategory,
  })
  category: ProductCategory;

  @Column({ default: false })
  isBestSeller: boolean;

  @Column({ default: false })
  isNewArrival: boolean;

  @Column()
  image: string;

  @Column('simple-array', { nullable: true })
  gallery: string;

  @ManyToOne(() => Category, (category) => category.products, { nullable: true })
  categoryRelation: Category;

  @OneToMany(() => OrderItem, (orderItem) => orderItem.product)
  orderItems: OrderItem[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

