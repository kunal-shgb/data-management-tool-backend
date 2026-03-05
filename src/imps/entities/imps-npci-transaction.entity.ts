import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';

@Entity('imps_npci_transactions')
@Index(['rrn', 'amount', 'transactionDate'])
@Unique(['rrn', 'amount', 'senderAccountNumber'])
export class ImpsNpciTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Index()
  rrn: string;

  @Column('decimal', { precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'timestamp' })
  @Index()
  transactionDate: Date;

  @Column({ nullable: true })
  senderMobileNumber: string;

  @Column({ nullable: true })
  modeOfTransaction: string;

  @Column({ nullable: true })
  senderIfsc: string;

  @Column({ nullable: true })
  senderAccountNumber: string;

  @Column({ nullable: true })
  receiverIfsc: string;

  @Column({ nullable: true })
  receiverAccountNumber: string;

  @Column()
  transactionStatusCode: string;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  @Index()
  status: TransactionStatus;

  @Column('jsonb', { nullable: true })
  rawData: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
