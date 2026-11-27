import { Global, Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';

/** Global: the grids, the Excel export, and every DTO-adjacent check need the company list. */
@Global()
@Module({
  providers: [CompaniesService],
  controllers: [CompaniesController],
  exports: [CompaniesService],
})
export class CompaniesModule {}
