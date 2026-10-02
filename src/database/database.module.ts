import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SequelizeModule } from './sequelize.provider';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [...SequelizeModule.providers],
  exports: [...SequelizeModule.exports],
})
export class DatabaseModule {}
