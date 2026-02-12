import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { UpiCbsTransaction } from './upi-cbs-transaction.entity';
import { UpiNpciTransaction } from './upi-npci-transaction.entity';
import { User } from '../../users/entities/user.entity';
import { MatchConfidence } from '../../common/enums/match-confidence.enum';

@Entity('upi_reconciliations')
export class UpiReconciliation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('uuid')
    @Index()
    cbsTransactionId: string;

    @ManyToOne(() => UpiCbsTransaction, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cbsTransactionId' })
    cbsTransaction: UpiCbsTransaction;

    @Column('uuid')
    @Index()
    npciTransactionId: string;

    @ManyToOne(() => UpiNpciTransaction, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'npciTransactionId' })
    npciTransaction: UpiNpciTransaction;

    @Column({
        type: 'enum',
        enum: MatchConfidence,
    })
    @Index()
    matchConfidence: MatchConfidence;

    @Column('simple-array')
    matchedOn: string[];

    @Column({ type: 'timestamp' })
    @Index()
    reconciledAt: Date;

    @Column('uuid', { nullable: true })
    reconciledBy: string;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'reconciledBy' })
    reconciler: User;

    @Column('text', { nullable: true })
    notes: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
