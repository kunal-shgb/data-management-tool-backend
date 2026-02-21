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

    it('should proxy file to Python service and save returned transactions', async () => {
        const mockFile = {
            buffer: Buffer.from('test content', 'utf-8'),
            originalname: 'test.csv',
            mimetype: 'text/csv',
        } as Express.Multer.File;

        // Mock the response from the Python microservice
        const mockPythonResponse = {
            data: {
                message: 'File processed successfully',
                successCount: 2,
                skippedCount: 1,
                transactions: [
                    {
                        rrn: '605019639721',
                        utr: undefined,
                        amount: 1200,
                        transactionDate: '2019-02-26T10:03:20.000Z',
                        senderIfsc: 'BARB0KICHAX',
                        receiverIfsc: 'PUNB0HGB001',
                        rawData: { originalLine: 'test1' }
                    },
                    {
                        rrn: '605019639725',
                        utr: 'cb1cbf',
                        amount: 20000,
                        transactionDate: '2019-02-26T10:03:20.000Z',
                        senderIfsc: 'SBIN0001071',
                        receiverIfsc: 'PUNB0HGB001',
                        rawData: { originalLine: 'test2' }
                    }
                ]
            }
        };

        mockedAxios.post.mockResolvedValueOnce(mockPythonResponse);

        const result = await service.uploadNpciData(mockFile);

        expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        expect(mockedAxios.post.mock.calls[0][0]).toBe('http://localhost:8000/process-npci-file');

        expect(result.successCount).toBe(2);
        expect(result.skippedCount).toBe(1);

        expect(mockNpciRepo.create).toHaveBeenCalledTimes(2);
        expect(mockNpciRepo.save).toHaveBeenCalled();

        // Check first record mapping
        const firstCreateCallArg = (mockNpciRepo.create as jest.Mock).mock.calls[0][0];
        expect(firstCreateCallArg.rrn).toBe('605019639721');
        expect(firstCreateCallArg.amount).toBe(1200);
        expect(firstCreateCallArg.senderIfsc).toBe('BARB0KICHAX');
    });
});
