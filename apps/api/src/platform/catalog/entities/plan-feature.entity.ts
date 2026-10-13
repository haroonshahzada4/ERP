import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { PlatformFeature } from './platform-feature.entity';
import { Plan } from './plan.entity';

@Entity({ name: 'plan_features' })
@Unique(['planId', 'featureId'])
export class PlanFeature {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'plan_id', type: 'int' })
  planId!: number;

  @ManyToOne(() => Plan, (p) => p.planFeatures, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan!: Plan;

  @Column({ name: 'feature_id', type: 'int' })
  featureId!: number;

  @ManyToOne(() => PlatformFeature, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'feature_id' })
  feature!: PlatformFeature;
}
