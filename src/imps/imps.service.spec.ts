import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ImpsService } from './imps.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ImpsCbsTransaction } from './entities/imps-cbs-transaction.entity';
import { ImpsNpciTransaction } from './entities/imps-npci-transaction.entity';
import { ImpsReconciliation } from './entities/imps-reconciliation.entity';
import { Repository } from 'typeorm';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ImpsService - NPCI Upload', () => {
    let service: ImpsService;
    let mockNpciRepo: Partial<Repository<ImpsNpciTransaction>>;

    beforeEach(async () => {
        mockNpciRepo = {
            create: jest.fn().mockImplementation((dto) => dto),
            save: jest.fn().mockResolvedValue([]),
            createQueryBuilder: jest.fn(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ImpsService,
                { provide: getRepositoryToken(ImpsCbsTransaction), useValue: {} },
                { provide: getRepositoryToken(ImpsNpciTransaction), useValue: mockNpciRepo },
                { provide: getRepositoryToken(ImpsReconciliation), useValue: {} },
            ],
        }).compile();

        service = module.get<ImpsService>(ImpsService);
        jest.clearAllMocks();
    });

    it('should parse NPCI file and attempt database insertion with orIgnore', async () => {
        // Sample line format from code: rrn is parts[4], statusCode is parts[5], amountStr is parts[15], senderAccountNumber is parts[20]
        // Line structure: ..., ..., ..., ..., RRN, STATUS, ..., ..., DATE, TIME, ..., ..., MOBILE, ..., ..., AMOUNT, MODE, REC_IFSC, REC_ACC, SEND_IFSC, SEND_ACC
        const line1 = 'H,H,H,H,605019639721,00,H,H,260219,100320,H,H,9876543210,H,H,120000,IMPS,IFSC1,ACC1,IFSC2,ACC2';
        const mockFile = {
            buffer: Buffer.from(line1, 'utf-8'),
            originalname: 'ISSUER_26022019.txt',
        } as Express.Multer.File;

        const mockInsertBuilder = {
            insert: jest.fn().mockReturnThis(),
            values: jest.fn().mockReturnThis(),
            orIgnore: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({ identifiers: [{ id: 1 }] }),
        };

        (mockNpciRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockInsertBuilder);

        const result = await service.uploadNpciData(mockFile);

        expect(result.success).toBe(true);
        expect(result.successCount).toBe(1);
        expect(mockInsertBuilder.insert).toHaveBeenCalled();
        expect(mockInsertBuilder.orIgnore).toHaveBeenCalled();

        const insertedValues = mockInsertBuilder.values.mock.calls[0][0];
        expect(insertedValues[0].rrn).toBe('605019639721');
        expect(insertedValues[0].amount).toBe(1200); // 120000 / 100
        expect(insertedValues[0].senderAccountNumber).toBe('ACC2');

        // Check date parsing (DDMMYY: 260219 -> 2019-02-26)
        const txnDate = new Date(insertedValues[0].transactionDate);
        expect(txnDate.getFullYear()).toBe(2019);
        expect(txnDate.getMonth()).toBe(1); // February (0-indexed)
        expect(txnDate.getDate()).toBe(26);
    });

    it('should correctly report duplicates based on database response', async () => {
        const line1 = 'H,H,H,H,RRN1,00,H,H,260219,100320,H,H,M1,H,H,10000,IMPS,IF1,AC1,IF2,AC2';
        const line2 = 'H,H,H,H,RRN1,00,H,H,260219,100320,H,H,M1,H,H,10000,IMPS,IF1,AC1,IF2,AC2'; // Duplicate

        const mockFile = {
            buffer: Buffer.from(`${line1}\n${line2}`, 'utf-8'),
            originalname: 'ISSUER_26022019.txt',
        } as Express.Multer.File;

        const mockInsertBuilder = {
            insert: jest.fn().mockReturnThis(),
            values: jest.fn().mockReturnThis(),
            orIgnore: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({ identifiers: [{ id: 1 }, undefined] }), // Second one skipped
        };

        (mockNpciRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockInsertBuilder);

        const result = await service.uploadNpciData(mockFile);

        expect(result.successCount).toBe(1);
        expect(result.skippedCount).toBe(1); // 1 duplicate
        expect(result.message).toContain('1 duplicate records skipped');
    });

    it('should allow same RRN if Amount or Sender Account Number is different', async () => {
        const line1 = 'H,H,H,H,RRN1,00,H,H,260219,100320,H,H,M1,H,H,10000,IMPS,IF1,AC1,IF2,AC2';
        const line2 = 'H,H,H,H,RRN1,00,H,H,260219,100320,H,H,M1,H,H,20000,IMPS,IF1,AC1,IF2,AC2'; // Different Amount

        const mockFile = {
            buffer: Buffer.from(`${line1}\n${line2}`, 'utf-8'),
            originalname: 'ISSUER_26022019.txt',
        } as Express.Multer.File;

        const mockInsertBuilder = {
            insert: jest.fn().mockReturnThis(),
            values: jest.fn().mockReturnThis(),
            orIgnore: jest.fn().mockReturnThis(),
            execute: jest.fn().mockResolvedValue({ identifiers: [{ id: 1 }, { id: 2 }] }), // Both inserted
        };

        (mockNpciRepo.createQueryBuilder as jest.Mock).mockReturnValue(mockInsertBuilder);

        const result = await service.uploadNpciData(mockFile);

        expect(result.successCount).toBe(2);
        expect(result.skippedCount).toBe(0);
    });

    it('should throw BadRequestException if row date does not match filename date', async () => {
        const line1 = 'H,H,H,H,RRN1,00,H,H,270219,100320,H,H,M1,H,H,10000,IMPS,IF1,AC1,IF2,AC2'; // Date is 270219

        const mockFile = {
            buffer: Buffer.from(line1, 'utf-8'),
            originalname: 'ISSUER_26022019.txt', // Date is 260219
        } as Express.Multer.File;

        await expect(service.uploadNpciData(mockFile)).rejects.toThrow(BadRequestException);
        await expect(service.uploadNpciData(mockFile)).rejects.toThrow(/Date mismatch/);
    });

    it('should throw BadRequestException if filename is invalid', async () => {
        const mockFile = {
            buffer: Buffer.from('some data', 'utf-8'),
            originalname: 'invalid_filename.txt',
        } as Express.Multer.File;

        await expect(service.uploadNpciData(mockFile)).rejects.toThrow(BadRequestException);
        await expect(service.uploadNpciData(mockFile)).rejects.toThrow('Invalid file name. format must be ISSUER_DDMMYYYY or ACQUIRER_DDMMYYYY');
    });
});
