import { Controller, Post, Get, Body, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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

    @Post('npci/upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadNpciData(@UploadedFile() file: Express.Multer.File) {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        const fileNameWithoutExt = file.originalname.substring(0, file.originalname.lastIndexOf('.')) || file.originalname;
        if (!/^ISSUER_.+$/.test(fileNameWithoutExt)) {
            throw new BadRequestException('File name must be in format ISSUER_{ANY_DATE}');
        }

        if (!file.originalname.match(/\.(txt|csv|xlsx|xls)$/)) {
            throw new BadRequestException('Only .txt, .csv, .xlsx, and .xls files are allowed');
        }
        return await this.impsService.uploadNpciData(file);
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
