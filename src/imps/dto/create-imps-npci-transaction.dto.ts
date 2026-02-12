import { IsString, IsNumber, IsDateString, IsEnum, IsOptional, IsObject } from 'class-validator';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';

export class CreateImpsNpciTransactionDto {
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
    senderIfsc: string;

    @IsString()
    receiverIfsc: string;

    @IsEnum(TransactionStatus)
    status: TransactionStatus;

    @IsObject()
    @IsOptional()
    rawData?: Record<string, any>;
}
