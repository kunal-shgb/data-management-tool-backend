import {
  IsString,
  IsNumber,
  IsDateString,
  IsEnum,
  IsOptional,
  IsObject,
} from 'class-validator';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';

export class CreateImpsNpciTransactionDto {
  @IsString()
  rrn: string;

  @IsNumber()
  amount: number;

  @IsDateString()
  transactionDate: string;

  @IsString()
  @IsOptional()
  senderMobileNumber?: string;

  @IsString()
  @IsOptional()
  modeOfTransaction?: string;

  @IsString()
  senderIfsc: string;

  @IsString()
  @IsOptional()
  senderAccountNumber?: string;

  @IsString()
  receiverIfsc: string;

  @IsString()
  @IsOptional()
  receiverAccountNumber?: string;

  @IsString()
  @IsOptional()
  transactionStatusCode?: string;

  @IsEnum(TransactionStatus)
  status: TransactionStatus;

  @IsObject()
  @IsOptional()
  rawData?: Record<string, any>;
}
