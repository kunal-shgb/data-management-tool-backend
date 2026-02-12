import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { UpiService } from './upi.service';
import { CreateUpiCbsTransactionDto } from './dto/create-upi-cbs-transaction.dto';
import { CreateUpiNpciTransactionDto } from './dto/create-upi-npci-transaction.dto';
import { ReconciliationQueryDto } from '../imps/dto/reconciliation-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/upi')
@UseGuards(JwtAuthGuard)
export class UpiController {
    constructor(private readonly upiService: UpiService) { }

    @Post('cbs/ingest')
    async ingestCbsTransactions(@Body() transactions: CreateUpiCbsTransactionDto[]) {
        return await this.upiService.ingestCbsTransactions(transactions);
    }

    @Post('npci/ingest')
    async ingestNpciTransactions(@Body() transactions: CreateUpiNpciTransactionDto[]) {
        return await this.upiService.ingestNpciTransactions(transactions);
    }

    @Post('reconcile')
    async reconcileTransactions() {
        return await this.upiService.reconcileTransactions();
    }

    @Get('reconciliations')
    async getReconciliations(@Query() query: ReconciliationQueryDto) {
        return await this.upiService.getReconciliations(query);
    }

    @Get('unmatched')
    async getUnmatchedTransactions() {
        return await this.upiService.getUnmatchedTransactions();
    }
}
