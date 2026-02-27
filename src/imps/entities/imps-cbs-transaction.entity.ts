import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';

@Entity('imps_cbs_transactions')
@Index(['rrn', 'amount', 'transactionDate'])
export class ImpsCbsTransaction {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    systemNumber: string;

    @Column()
    @Index()
    rrn: string;

    @Column('decimal', { precision: 15, scale: 2 })
    amount: number;

    @Column({ type: 'timestamp' })
    @Index()
    transactionDate: Date;

    @Column()
    transactionType: string;

    @Column('jsonb', { nullable: true })
    rawData: Record<string, any>;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
