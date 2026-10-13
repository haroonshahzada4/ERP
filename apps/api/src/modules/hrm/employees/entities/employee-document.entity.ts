import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DocumentType } from '../../organization/entities/document-type.entity';
import { Employee } from './employee.entity';

@Entity({ name: 'employee_documents' })
export class EmployeeDocument {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'employee_id', type: 'int' })
  employeeId!: number;

  @ManyToOne(() => Employee, (employee) => employee.documents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ name: 'document_type_id', type: 'int' })
  documentTypeId!: number;

  @ManyToOne(() => DocumentType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'document_type_id' })
  documentType!: DocumentType;

  @Column({ name: 'file_name' })
  fileName!: string;

  @Column({ name: 'storage_key' })
  storageKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
