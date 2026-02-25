import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import axios from 'axios';
import FormData from 'form-data';
import { ImpsCbsTransaction } from './entities/imps-cbs-transaction.entity';
import { ImpsNpciTransaction } from './entities/imps-npci-transaction.entity';
import { ImpsReconciliation } from './entities/imps-reconciliation.entity';
import { CreateImpsCbsTransactionDto } from './dto/create-imps-cbs-transaction.dto';
import { CreateImpsNpciTransactionDto } from './dto/create-imps-npci-transaction.dto';
import { MatchConfidence } from '../common/enums/match-confidence.enum';
import { TransactionStatus } from '../common/enums/transaction-status.enum';

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
            const content = file.buffer.toString('utf-8');
            const lines = content.split(/\r?\n/);

            const transactions: any[] = [];
            let successCount = 0;
            let skippedCount = 0;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                // Skip empty lines, headers (e.g. 17022026_1C), and footers (e.g. EOF4)
                if (!line || /^\d{8}_\d+[a-zA-Z]$/.test(line) || line.startsWith('EOF')) {
                    skippedCount++;
                    continue;
                }

                const parts = line.split(',');
                if (parts.length < 21) {
                    skippedCount++;
                    continue;
                }

                try {
                    const rrn = parts[4].trim(); // Index 5
                    const statusCode = parts[5].trim(); // Index 6
                    const dateStr = parts[8].trim(); // Index 9
                    const timeStr = parts[9].trim();
                    const senderMobileNumber = parts[12].trim(); // Index 13
                    const amountStr = parts[15].trim(); // Index 16
                    const modeOfTransaction = parts[16].trim(); // Index 17
                    const receiverIfsc = parts[17].trim(); // Index 18
                    const receiverAccountNumber = parts[18].trim(); // Index 19
                    const senderIfsc = parts[19].trim(); // Index 20
                    const senderAccountNumber = parts[20].trim(); // Index 21

                    // Parse Date & Time
                    let transactionDate: string | null = null;
                    if (dateStr && dateStr.length === 6 && timeStr && timeStr.length >= 6) {
                        const year = parseInt(`20${dateStr.substring(0, 2)}`, 10);
                        const month = parseInt(dateStr.substring(2, 4), 10) - 1; // 0-based month
                        const day = parseInt(dateStr.substring(4, 6), 10);

                        transactionDate = new Date(year, month, day).toISOString();
                    }

                    const amount = parseFloat(amountStr) / 100;

                    let status = TransactionStatus.PENDING;
                    if (statusCode === '00') {
                        status = TransactionStatus.SUCCESS;
                    }

                    transactions.push({
                        rrn,
                        transactionStatusCode: statusCode,
                        transactionDate,
                        senderMobileNumber,
                        amount,
                        modeOfTransaction,
                        receiverIfsc,
                        receiverAccountNumber,
                        senderIfsc,
                        senderAccountNumber,
                        status,
                        rawData: { originalLine: line },
                    });

                    successCount++;
                } catch (err: any) {
                    this.logger.error(`Error parsing line: ${line}`, err.stack);
                    skippedCount++;
                }
            }

            // Save in batches
            const allRrns = transactions.map(t => t.rrn);
            const existingRrns = new Set(
                (await this.npciTransactionRepo.find({
                    where: { rrn: In(allRrns) },
                    select: ['rrn']
                })).map(t => t.rrn)
            );

            const uniqueTransactions = transactions.filter(t => !existingRrns.has(t.rrn));
            const duplicatesCount = transactions.length - uniqueTransactions.length;
            skippedCount += duplicatesCount;

            const entitiesToCreate = uniqueTransactions.map((t) => ({
                ...t,
                transactionDate: t.transactionDate ? new Date(t.transactionDate) : null,
            }));
            const entities = this.npciTransactionRepo.create(entitiesToCreate);

            if (entities.length > 0) {
                const batchSize = 1000;
                for (let i = 0; i < entities.length; i += batchSize) {
                    const batch = entities.slice(i, i + batchSize);
                    await this.npciTransactionRepo.save(batch);
                }
                this.logger.log(`Saved ${uniqueTransactions.length} unique NPCI transactions. Skipped ${duplicatesCount} duplicates.`);
            }

            return {
                success: true,
                message: duplicatesCount > 0
                    ? `File processed with ${duplicatesCount} duplicate records skipped.`
                    : "File processed successfully",
                successCount: uniqueTransactions.length,
                skippedCount,
            };

        } catch (error: any) {
            this.logger.error('Error processing text file', error.stack);
            throw new BadRequestException('File processing failed: ' + error.message);
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
