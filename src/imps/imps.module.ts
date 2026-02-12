import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImpsController } from './imps.controller';
import { ImpsService } from './imps.service';
import { ImpsCbsTransaction } from './entities/imps-cbs-transaction.entity';
import { ImpsNpciTransaction } from './entities/imps-npci-transaction.entity';
import { ImpsReconciliation } from './entities/imps-reconciliation.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            ImpsCbsTransaction,
            ImpsNpciTransaction,
            ImpsReconciliation,
        ]),
    ],
    controllers: [ImpsController],
    providers: [ImpsService],
    exports: [ImpsService],
})
export class ImpsModule { }
