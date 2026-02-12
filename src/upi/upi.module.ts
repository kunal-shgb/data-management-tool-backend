import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UpiController } from './upi.controller';
import { UpiService } from './upi.service';
import { UpiCbsTransaction } from './entities/upi-cbs-transaction.entity';
import { UpiNpciTransaction } from './entities/upi-npci-transaction.entity';
import { UpiReconciliation } from './entities/upi-reconciliation.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            UpiCbsTransaction,
            UpiNpciTransaction,
            UpiReconciliation,
        ]),
    ],
    controllers: [UpiController],
    providers: [UpiService],
    exports: [UpiService],
})
export class UpiModule { }
