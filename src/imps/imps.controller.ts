import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { ImpsService } from './imps.service';
import { CreateImpsCbsTransactionDto } from './dto/create-imps-cbs-transaction.dto';
import { CreateImpsNpciTransactionDto } from './dto/create-imps-npci-transaction.dto';
import { ReconciliationQueryDto } from './dto/reconciliation-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/imps')
@UseGuards(JwtAuthGuard)
export class ImpsController {
    constructor(private readonly impsService: ImpsService) { }

    @Post('cbs/ingest')
    async ingestCbsTransactions(@Body() transactions: CreateImpsCbsTransactionDto[]) {
        return await this.impsService.ingestCbsTransactions(transactions);
    }

    @Post('npci/ingest')
    async ingestNpciTransactions(@Body() transactions: CreateImpsNpciTransactionDto[]) {
        return await this.impsService.ingestNpciTransactions(transactions);
    }

    @Post('reconcile')
    async reconcileTransactions() {
        return await this.impsService.reconcileTransactions();
    }

    @Get('reconciliations')
    async getReconciliations(@Query() query: ReconciliationQueryDto) {
        return await this.impsService.getReconciliations(query);
    }

    @Get('unmatched')
    async getUnmatchedTransactions() {
        return await this.impsService.getUnmatchedTransactions();
    }
}
