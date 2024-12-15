import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PointModule } from './point/point.module';

@Module({
  imports: [PointModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
