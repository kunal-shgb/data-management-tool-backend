import { IsString, IsNumber, IsDateString, IsEnum, IsOptional, IsObject } from 'class-validator';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';

export class CreateImpsCbsTransactionDto {

    @IsString()
    systemNumber: string;

    @IsString()
    rrn: string;

    @IsNumber()
    amount: number;

    @IsDateString()
    transactionDate: string;

    @IsString()
    transactionType: string;

    @IsObject()
    @IsOptional()
    rawData?: Record<string, any>;
}
