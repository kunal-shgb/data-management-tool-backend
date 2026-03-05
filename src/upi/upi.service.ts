import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { UpiCbsTransaction } from './entities/upi-cbs-transaction.entity';
import { UpiNpciTransaction } from './entities/upi-npci-transaction.entity';
import { UpiReconciliation } from './entities/upi-reconciliation.entity';
import { CreateUpiCbsTransactionDto } from './dto/create-upi-cbs-transaction.dto';
import { CreateUpiNpciTransactionDto } from './dto/create-upi-npci-transaction.dto';
import { MatchConfidence } from '../common/enums/match-confidence.enum';

@Injectable()
export class UpiService {
  private readonly logger = new Logger(UpiService.name);

  constructor(
    @InjectRepository(UpiCbsTransaction)
    private cbsTransactionRepo: Repository<UpiCbsTransaction>,
    @InjectRepository(UpiNpciTransaction)
    private npciTransactionRepo: Repository<UpiNpciTransaction>,
    @InjectRepository(UpiReconciliation)
    private reconciliationRepo: Repository<UpiReconciliation>,
  ) {}

  async ingestCbsTransactions(transactions: CreateUpiCbsTransactionDto[]) {
    const entities = transactions.map((dto) =>
      this.cbsTransactionRepo.create({
        ...dto,
        transactionDate: new Date(dto.transactionDate),
      }),
    );
    return await this.cbsTransactionRepo.save(entities);
  }

  async ingestNpciTransactions(transactions: CreateUpiNpciTransactionDto[]) {
    const entities = transactions.map((dto) =>
      this.npciTransactionRepo.create({
        ...dto,
        transactionDate: new Date(dto.transactionDate),
      }),
    );
    return await this.npciTransactionRepo.save(entities);
  }

  async reconcileTransactions(userId?: string) {
    this.logger.log('Starting UPI reconciliation...');

    // Get unmatched CBS transactions
    const unmatchedCbs = await this.cbsTransactionRepo
      .createQueryBuilder('cbs')
      .leftJoin(
        'upi_reconciliations',
        'recon',
        'recon.cbsTransactionId = cbs.id',
      )
      .where('recon.id IS NULL')
      .getMany();

    this.logger.log(`Found ${unmatchedCbs.length} unmatched CBS transactions`);

    const reconciliations: UpiReconciliation[] = [];

    for (const cbsTxn of unmatchedCbs) {
      // Primary match: RRN + amount + date (within 5 minutes)
      const dateStart = new Date(
        cbsTxn.transactionDate.getTime() - 5 * 60 * 1000,
      );
      const dateEnd = new Date(
        cbsTxn.transactionDate.getTime() + 5 * 60 * 1000,
      );

      let npciTxn = await this.npciTransactionRepo.findOne({
        where: {
          rrn: cbsTxn.rrn,
          amount: cbsTxn.amount,
          transactionDate: Between(dateStart, dateEnd),
        },
      });

      let matchConfidence = MatchConfidence.EXACT;
      let matchedOn = ['rrn', 'amount', 'date'];

      // Secondary match: UPI Transaction ID + amount (if primary fails)
      if (!npciTxn && cbsTxn.upiTransactionId) {
        npciTxn = await this.npciTransactionRepo.findOne({
          where: {
            upiTransactionId: cbsTxn.upiTransactionId,
            amount: cbsTxn.amount,
          },
        });
        if (npciTxn) {
          matchConfidence = MatchConfidence.PARTIAL;
          matchedOn = ['upi_transaction_id', 'amount'];
        }
      }

      if (npciTxn) {
        // Check if NPCI transaction is already matched
        const existingMatch = await this.reconciliationRepo.findOne({
          where: { npciTransactionId: npciTxn.id },
        });

        if (!existingMatch) {
          const reconciliation = this.reconciliationRepo.create({
            cbsTransactionId: cbsTxn.id,
            npciTransactionId: npciTxn.id,
            matchConfidence,
            matchedOn,
            reconciledAt: new Date(),
            reconciledBy: userId || undefined,
          });
          reconciliations.push(reconciliation);
        }
      }
    }

    const saved = await this.reconciliationRepo.save(reconciliations);
    this.logger.log(`Reconciled ${saved.length} transactions`);

    return {
      totalProcessed: unmatchedCbs.length,
      matched: saved.length,
      unmatched: unmatchedCbs.length - saved.length,
    };
  }

  async getReconciliations(query: any) {
    const qb = this.reconciliationRepo
      .createQueryBuilder('recon')
      .leftJoinAndSelect('recon.cbsTransaction', 'cbs')
      .leftJoinAndSelect('recon.npciTransaction', 'npci')
      .leftJoinAndSelect('recon.reconciler', 'user');

    if (query.matchConfidence) {
      qb.andWhere('recon.matchConfidence = :confidence', {
        confidence: query.matchConfidence,
      });
    }

    if (query.startDate) {
      qb.andWhere('recon.reconciledAt >= :startDate', {
        startDate: new Date(query.startDate),
      });
    }

    if (query.endDate) {
      qb.andWhere('recon.reconciledAt <= :endDate', {
        endDate: new Date(query.endDate),
      });
    }

    return await qb.getMany();
  }

  async getUnmatchedTransactions() {
    const unmatchedCbs = await this.cbsTransactionRepo
      .createQueryBuilder('cbs')
      .leftJoin(
        'upi_reconciliations',
        'recon',
        'recon.cbsTransactionId = cbs.id',
      )
      .where('recon.id IS NULL')
      .getMany();

    const unmatchedNpci = await this.npciTransactionRepo
      .createQueryBuilder('npci')
      .leftJoin(
        'upi_reconciliations',
        'recon',
        'recon.npciTransactionId = npci.id',
      )
      .where('recon.id IS NULL')
      .getMany();

    return {
      cbs: unmatchedCbs,
      npci: unmatchedNpci,
    };
  }
}
