import { IsString, IsNumber, IsDateString, IsEnum, IsOptional, IsObject } from 'class-validator';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';

export class CreateUpiCbsTransactionDto {
    @IsString()
    rrn: string;

    @IsString()
    upiTransactionId: string;

    @IsNumber()
    amount: number;

    @IsDateString()
    transactionDate: string;

    @IsString()
    payerVpa: string;

    @IsString()
    payeeVpa: string;

    @IsEnum(TransactionStatus)
    status: TransactionStatus;

    @IsObject()
    @IsOptional()
    rawData?: Record<string, any>;
}
