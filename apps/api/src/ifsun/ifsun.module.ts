import { Module } from '@nestjs/common';
import { SignaturesModule } from '../signatures/signatures.module';
import { IfsunService } from './ifsun.service';
import { IfsunController } from './ifsun.controller';

@Module({
  imports: [SignaturesModule],
  providers: [IfsunService],
  controllers: [IfsunController],
})
export class IfsunModule {}
