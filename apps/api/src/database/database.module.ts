import { Global, Module } from '@nestjs/common';
import { FieldCipherService } from './field-cipher.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService, FieldCipherService],
  exports: [PrismaService, FieldCipherService],
})
export class DatabaseModule {}
