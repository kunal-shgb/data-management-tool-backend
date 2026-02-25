import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ImpsCbsTransaction } from './imps-cbs-transaction.entity';
import { ImpsNpciTransaction } from './imps-npci-transaction.entity';
import { User } from '../../users/entities/user.entity';
import { MatchConfidence } from '../../common/enums/match-confidence.enum';

@Entity('imps_reconciliations')
export class ImpsReconciliation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column('uuid')
    @Index()
    cbsTransactionId: string;

    @ManyToOne(() => ImpsCbsTransaction, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cbsTransactionId' })
    cbsTransaction: ImpsCbsTransaction;

    @Column()
    @Index()
    npciTransactionId: number;

    @ManyToOne(() => ImpsNpciTransaction, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'npciTransactionId' })
    npciTransaction: ImpsNpciTransaction;

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
