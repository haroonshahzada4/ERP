import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PlatformModule } from './platform-module.entity';

@Entity({ name: 'platform_features' })
export class PlatformFeature {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'module_id', type: 'int' })
  moduleId!: number;

  @ManyToOne(() => PlatformModule, (m) => m.features, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'module_id' })
  module!: PlatformModule;

  @Column({ unique: true })
  key!: string;

  @Column()
  name!: string;

  @Column({ type: 'varchar', nullable: true })
  description!: string | null;

  /** Optional dependency on another feature key (e.g. payroll → employees). */
  @Column({ name: 'depends_on_feature_key', type: 'varchar', nullable: true })
  dependsOnFeatureKey!: string | null;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
