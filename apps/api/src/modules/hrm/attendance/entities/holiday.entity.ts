import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'holidays' })
export class Holiday {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'holiday_date', type: 'date', unique: true })
  holidayDate!: string;

  @Column()
  name!: string;

  @Column({ name: 'is_optional', default: false })
  isOptional!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
