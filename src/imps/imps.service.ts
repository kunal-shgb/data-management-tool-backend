import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import axios from 'axios';
import FormData from 'form-data';
import { ImpsCbsTransaction } from './entities/imps-cbs-transaction.entity';
import { ImpsNpciTransaction } from './entities/imps-npci-transaction.entity';
import { ImpsReconciliation } from './entities/imps-reconciliation.entity';
import { CreateImpsCbsTransactionDto } from './dto/create-imps-cbs-transaction.dto';
import { CreateImpsNpciTransactionDto } from './dto/create-imps-npci-transaction.dto';
import { MatchConfidence } from '../common/enums/match-confidence.enum';

@Injectable()
export class ImpsService {
    private readonly logger = new Logger(ImpsService.name);

    constructor(
        @InjectRepository(ImpsCbsTransaction)
        private cbsTransactionRepo: Repository<ImpsCbsTransaction>,
        @InjectRepository(ImpsNpciTransaction)
        private npciTransactionRepo: Repository<ImpsNpciTransaction>,
        @InjectRepository(ImpsReconciliation)
        private reconciliationRepo: Repository<ImpsReconciliation>,
    ) { }

    async ingestCbsTransactions(transactions: CreateImpsCbsTransactionDto[]) {
        const entities = transactions.map(dto =>
            this.cbsTransactionRepo.create({
                ...dto,
                transactionDate: new Date(dto.transactionDate),
            })
        );
        return await this.cbsTransactionRepo.save(entities);
    }

    async uploadNpciData(file: Express.Multer.File) {
        if (!file.buffer) {
            throw new BadRequestException('File buffer is empty');
        }

        try {
            
            const formData = new FormData();
            formData.append('file', file.buffer, {
                filename: file.originalname,
                contentType: file.mimetype,
            });

            const response = await axios.post('http://localhost:8000/process-npci-file', formData, {
                headers: formData.getHeaders(),
            });

            const { transactions, successCount, skippedCount, message } = response.data;

            const entities = transactions.map((t: any) => this.npciTransactionRepo.create({
                ...t,
                transactionDate: t.transactionDate ? new Date(t.transactionDate) : null,
            }));

            // Save in batches
            if (entities.length > 0) {
                const batchSize = 1000;
                for (let i = 0; i < entities.length; i += batchSize) {
                    const batch = entities.slice(i, i + batchSize);
                    await this.npciTransactionRepo.save(batch);
                }
                this.logger.log(`Saved ${successCount} NPCI transactions from uploaded file`);
            }

            return {
                message,
                successCount,
                skippedCount,
            };

        } catch (error: any) {
            this.logger.error('Error processing file with Python service', error.stack);
            throw new BadRequestException(
                'File processing failed. Ensure the Python file processing service is running. Details: ' +
                (error.response?.data?.detail || error.message)
            );
        }
    }

    async reconcileTransactions(userId?: string) {
        this.logger.log('Starting IMPS reconciliation...');

        // Get unmatched CBS transactions
        const unmatchedCbs = await this.cbsTransactionRepo
            .createQueryBuilder('cbs')
            .leftJoin('imps_reconciliations', 'recon', 'recon.cbsTransactionId = cbs.id')
            .where('recon.id IS NULL')
            .getMany();

        this.logger.log(`Found ${unmatchedCbs.length} unmatched CBS transactions`);

        const reconciliations: ImpsReconciliation[] = [];

        for (const cbsTxn of unmatchedCbs) {
            // Primary match: RRN + amount + date (within 5 minutes)
            const dateStart = new Date(cbsTxn.transactionDate.getTime() - 5 * 60 * 1000);
            const dateEnd = new Date(cbsTxn.transactionDate.getTime() + 5 * 60 * 1000);

            let npciTxn = await this.npciTransactionRepo.findOne({
                where: {
                    rrn: cbsTxn.rrn,
                    amount: cbsTxn.amount,
                    transactionDate: Between(dateStart, dateEnd),
                },
            });

            let matchConfidence = MatchConfidence.EXACT;
            let matchedOn = ['rrn', 'amount', 'date'];

            // Secondary match: UTR + amount (if primary fails)
            if (!npciTxn && cbsTxn.utr) {
                npciTxn = await this.npciTransactionRepo.findOne({
                    where: {
                        utr: cbsTxn.utr,
                        amount: cbsTxn.amount,
                    },
                });
                if (npciTxn) {
                    matchConfidence = MatchConfidence.PARTIAL;
                    matchedOn = ['utr', 'amount'];
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
            qb.andWhere('recon.matchConfidence = :confidence', { confidence: query.matchConfidence });
        }

        if (query.startDate) {
            qb.andWhere('recon.reconciledAt >= :startDate', { startDate: new Date(query.startDate) });
        }

        if (query.endDate) {
            qb.andWhere('recon.reconciledAt <= :endDate', { endDate: new Date(query.endDate) });
        }

        return await qb.getMany();
    }

    async getUnmatchedTransactions() {
        const unmatchedCbs = await this.cbsTransactionRepo
            .createQueryBuilder('cbs')
            .leftJoin('imps_reconciliations', 'recon', 'recon.cbsTransactionId = cbs.id')
            .where('recon.id IS NULL')
            .getMany();

        const unmatchedNpci = await this.npciTransactionRepo
            .createQueryBuilder('npci')
            .leftJoin('imps_reconciliations', 'recon', 'recon.npciTransactionId = npci.id')
            .where('recon.id IS NULL')
            .getMany();

        return {
            cbs: unmatchedCbs,
            npci: unmatchedNpci,
        };
    }
}
