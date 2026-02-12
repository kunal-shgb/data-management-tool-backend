import { IsString, IsNumber, IsDateString, IsEnum, IsOptional, IsObject } from 'class-validator';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';

export class CreateImpsCbsTransactionDto {
    @IsString()
    rrn: string;

    @IsString()
    @IsOptional()
    utr?: string;

    @IsNumber()
    amount: number;

    @IsDateString()
    transactionDate: string;

    @IsString()
    senderAccount: string;

    @IsString()
    receiverAccount: string;

    @IsEnum(TransactionStatus)
    status: TransactionStatus;

    @IsObject()
    @IsOptional()
    rawData?: Record<string, any>;
}
