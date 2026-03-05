import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
// import axios from 'axios';
// import FormData from 'form-data';
import { ImpsCbsTransaction } from './entities/imps-cbs-transaction.entity';
import { ImpsNpciTransaction } from './entities/imps-npci-transaction.entity';
import { ImpsReconciliation } from './entities/imps-reconciliation.entity';
import { CreateImpsCbsTransactionDto } from './dto/create-imps-cbs-transaction.dto';
// import { CreateImpsNpciTransactionDto } from './dto/create-imps-npci-transaction.dto';
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

    async uploadCbsData(file: Express.Multer.File) {
        if (!file.buffer) {
            throw new BadRequestException('File buffer is empty');
        }

        try {
            const content = file.buffer.toString('utf-8');
            const lines = content.split(/\r?\n/);
            const transactions: any[] = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                const parts = line.split('|');
                if (parts.length < 6) continue;

                const systemNumber = parts[0].trim();
                const transactionDateStr = parts[1].trim();
                const amountStr = parts[2].trim();
                const transactionDetails = parts[3].trim();
                const transactionType = parts[5].trim();
                if (!transactionDetails.startsWith('TRTR')) {
                    continue;
                }
                const detailsParts = transactionDetails.split('/');
                if (detailsParts.length < 2) {
                    continue;
                }

                const rrn = detailsParts[1].trim();
                const amount = parseFloat(amountStr);

                if (isNaN(amount)) {
                    this.logger.warn(`Invalid amount at line ${i + 1}: ${amountStr}`);
                    continue;
                }

                const [day, month, year] = transactionDateStr
                    .split('-')
                    .map((p) => parseInt(p, 10));
                const transactionDate = new Date(year, month - 1, day);
                transactions.push({
                    systemNumber,
                    rrn,
                    amount,
                    transactionDate,
                    transactionType,
                    rawData: { originalLine: line },
                });
            }

            if (transactions.length === 0) {
                return {
                    success: true,
                    message: 'No valid transactions found in file',
                    successCount: 0,
                };
            }

            const batchSize = 1000;
            let actualSuccessCount = 0;

            for (let i = 0; i < transactions.length; i += batchSize) {
                const batch = transactions.slice(i, i + batchSize);

                const result = await this.cbsTransactionRepo
                    .createQueryBuilder()
                    .insert()
                    .values(batch)
                    .orIgnore()
                    .execute();

                actualSuccessCount += result.identifiers.filter(
                    (id) => id !== undefined && id !== null,
                ).length;
            }

            const skippedCount = transactions.length - actualSuccessCount;
            this.logger.log(
                `Processed ${transactions.length} CBS transactions. Saved ${actualSuccessCount} new, skipped ${skippedCount} duplicates.`,
            );

            return {
                success: true,
                message:
                    skippedCount > 0
                        ? `CBS file processed with ${skippedCount} duplicate records skipped.`
                        : 'CBS file processed successfully',
                successCount: actualSuccessCount,
                skippedCount,
            };
        } catch (error: any) {
            this.logger.error('Error processing CBS file', error.stack);
            throw new BadRequestException(
                'CBS file processing failed: ' + error.message,
            );
        }
    }

    async uploadNpciData(file: Express.Multer.File) {
        if (!file.buffer) {
            throw new BadRequestException('File buffer is empty');
        }

        const fileName = file.originalname;
        const filenameRegex = /^(ISSUER|ACQUIRER)_(\d{8})(\.[^.]+)?$/;
        const filenameMatch = fileName.match(filenameRegex);

        if (!filenameMatch) {
            throw new BadRequestException(
                'Invalid file name. format must be ISSUER_DDMMYYYY or ACQUIRER_DDMMYYYY',
            );
        }

        // const filenameDate = filenameMatch[2]; // DDMMYYYY
        // const expectedDateInRow = filenameDate.substring(0, 4) + filenameDate.substring(6, 8); // DDMMYY

        try {
            const content = file.buffer.toString('utf-8');
            const lines = content.split(/\r?\n/);

            const transactions: any[] = [];
            let successCount = 0;
            let skippedCount = 0;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();

                // Skip empty lines, headers (e.g. 17022026_1C), and footers (e.g. EOF4)
                if (
                    !line ||
                    /^\d{8}_\d+[a-zA-Z]$/.test(line) ||
                    line.startsWith('EOF')
                ) {
                    skippedCount++;
                    continue;
                }

                const parts = line.split(',');
                if (parts.length < 21) {
                    skippedCount++;
                    continue;
                }

                // const rowDate = parts[8].trim();
                // if (rowDate !== expectedDateInRow) {
                //     throw new BadRequestException(`Date mismatch at line ${i + 1}: filename date ${expectedDateInRow} does not match row date ${rowDate}`);
                // }

                try {
                    const rrn = parts[4].trim(); // Index 5
                    const statusCode = parts[5].trim(); // Index 6
                    const dateStr = parts[8].trim(); // Index 9
                    const timeStr = parts[9].trim();
                    const senderMobileNumber =
                        parts[17] == 'PUNB0HGB001' ? parts[12].trim() : parts[11].trim(); // Index 12 or 13
                    const amountStr = parts[15].trim(); // Index 16
                    const modeOfTransaction = parts[16].trim(); // Index 17
                    const receiverIfsc = parts[17].trim(); // Index 18
                    const receiverAccountNumber = parts[18].trim(); // Index 19
                    const senderIfsc = parts[19].trim(); // Index 20
                    const senderAccountNumber = parts[20].trim(); // Index 21

                    // Parse Date & Time
                    let transactionDate: string | null = null;
                    if (
                        dateStr &&
                        dateStr.length === 6 &&
                        timeStr &&
                        timeStr.length >= 6
                    ) {
                        const year = parseInt(`20${dateStr.substring(0, 2)}`, 10);
                        const month = parseInt(dateStr.substring(2, 4), 10) - 1; // 0-based month
                        const day = parseInt(dateStr.substring(4, 6), 10);

                        transactionDate = new Date(year, month, day).toISOString();
                    }

                    const amount = parseFloat(amountStr) / 100;

                    let status = TransactionStatus.FAILED;
                    if (statusCode === '00') {
                        status = TransactionStatus.SUCCESS;
                    } else if (statusCode === '08') {
                        status = TransactionStatus.TIMEOUT;
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

            const entitiesToCreate = transactions.map((t) => ({
                ...t,
                transactionDate: t.transactionDate ? new Date(t.transactionDate) : null,
            }));

            let actualSuccessCount = 0;
            if (entitiesToCreate.length > 0) {
                const batchSize = 1000;
                for (let i = 0; i < entitiesToCreate.length; i += batchSize) {
                    const batch = entitiesToCreate.slice(i, i + batchSize);
                    const result = await this.npciTransactionRepo
                        .createQueryBuilder()
                        .insert()
                        .values(batch)
                        .orIgnore()
                        .execute();

                    // identifiers contains the ids of the inserted rows
                    actualSuccessCount += result.identifiers.filter(
                        (id) => id !== undefined && id !== null,
                    ).length;
                }
                const duplicatesCount = transactions.length - actualSuccessCount;
                this.logger.log(
                    `Processed ${transactions.length} transactions. Saved ${actualSuccessCount} new, skipped ${duplicatesCount} duplicates.`,
                );

                return {
                    success: true,
                    message:
                        duplicatesCount > 0
                            ? `File processed with ${duplicatesCount} duplicate records skipped.`
                            : 'File processed successfully',
                    successCount: actualSuccessCount,
                    skippedCount: skippedCount + duplicatesCount,
                };
            }

            return {
                success: true,
                message: 'No valid transactions found in file',
                successCount: 0,
                skippedCount,
            };
        } catch (error: any) {
            this.logger.error('Error processing text file', error.stack);
            throw new BadRequestException('File processing failed: ' + error.message);
        }
    }

    async reconcileTransactions(dateStr?: string) {
        if (!dateStr) {
            throw new BadRequestException('Transaction date is required');
        }

        const requestDate = new Date(dateStr);
        if (isNaN(requestDate.getTime())) {
            throw new BadRequestException('Invalid date format');
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const targetDate = new Date(requestDate);
        targetDate.setHours(0, 0, 0, 0);

        if (targetDate.getTime() >= today.getTime()) {
            throw new BadRequestException('Transaction date must be prior to the current date');
        }

        const dateStart = new Date(targetDate);
        const dateEnd = new Date(targetDate);
        dateEnd.setHours(23, 59, 59, 999);

        this.logger.log(`Starting IMPS reconciliation for date: ${targetDate.toISOString()}`);

        const cbsTxns = await this.cbsTransactionRepo.find({
            where: { transactionDate: Between(dateStart, dateEnd) },
        });

        const npciTxns = await this.npciTransactionRepo.find({
            where: { transactionDate: Between(dateStart, dateEnd) },
        });

        const matchedNpciIds = new Set<number>();

        const matched: { cbs: any, npci: any }[] = [];
        const unmatchedCbs: any[] = [];
        const unmatchedNpci: any[] = [];

        for (const cbsTxn of cbsTxns) {
            // Find a matching NPCI transaction by RRN and amount that hasn't been matched yet
            const matchingNpciIndex = npciTxns.findIndex(
                npciTxn => npciTxn.rrn === cbsTxn.rrn
                    && npciTxn.amount === cbsTxn.amount
                    && !matchedNpciIds.has(npciTxn.id)
            );

            if (matchingNpciIndex !== -1) {
                const matchedNpciTxn = npciTxns[matchingNpciIndex];
                matchedNpciIds.add(matchedNpciTxn.id);
                matched.push({
                    cbs: cbsTxn,
                    npci: matchedNpciTxn
                });
            } else {
                unmatchedCbs.push(cbsTxn);
            }
        }

        for (const npciTxn of npciTxns) {
            if (!matchedNpciIds.has(npciTxn.id)) {
                unmatchedNpci.push(npciTxn);
            }
        }

        this.logger.log(`Reconciliation complete. Matched: ${matched.length}, Unmatched CBS: ${unmatchedCbs.length}, Unmatched NPCI: ${unmatchedNpci.length}`);

        return {
            matchedCount: matched.length,
            unmatchedCbsCount: unmatchedCbs.length,
            unmatchedNpciCount: unmatchedNpci.length,
            matched,
            unmatched: {
                cbs: unmatchedCbs,
                npci: unmatchedNpci
            }
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
                'imps_reconciliations',
                'recon',
                'recon.cbsTransactionId = cbs.id',
            )
            .where('recon.id IS NULL')
            .getMany();

        const unmatchedNpci = await this.npciTransactionRepo
            .createQueryBuilder('npci')
            .leftJoin(
                'imps_reconciliations',
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
