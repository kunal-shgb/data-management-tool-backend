import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { MatchConfidence } from '../../common/enums/match-confidence.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';

export class ReconciliationQueryDto {
    @IsEnum(MatchConfidence)
    @IsOptional()
    matchConfidence?: MatchConfidence;

    @IsEnum(TransactionStatus)
    @IsOptional()
    status?: TransactionStatus;

    @IsDateString()
    @IsOptional()
    startDate?: string;

    @IsDateString()
    @IsOptional()
    endDate?: string;
}
