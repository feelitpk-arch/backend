import {
  Entity,
  ObjectIdColumn,
  ObjectId,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('categories')
export class Category {
  @ObjectIdColumn()
  id: ObjectId;

  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  @OneToMany(() => Product, (product) => product.categoryRelation)
  products: Product[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

