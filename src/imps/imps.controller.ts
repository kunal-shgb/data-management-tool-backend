import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImpsService } from './imps.service';
import { CreateImpsCbsTransactionDto } from './dto/create-imps-cbs-transaction.dto';
import { CreateImpsNpciTransactionDto } from './dto/create-imps-npci-transaction.dto';
import { ReconciliationQueryDto } from './dto/reconciliation-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('imps')
@UseGuards(JwtAuthGuard)
export class ImpsController {
  constructor(private readonly impsService: ImpsService) {}

  @Post('upload/npci')
  @UseInterceptors(FileInterceptor('file'))
  async uploadNpciData(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!file.originalname.match(/\.(txt|csv)$/)) {
      throw new BadRequestException('Only .txt, .csv files are allowed');
    }

    return await this.impsService.uploadNpciData(file);
  }

  @Post('upload/cbs')
  @UseInterceptors(FileInterceptor('file'))
  async uploadCbsData(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!file.originalname.match(/\.(txt|csv)$/)) {
      throw new BadRequestException('Only .txt, .csv files are allowed');
    }

    return await this.impsService.uploadCbsData(file);
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
