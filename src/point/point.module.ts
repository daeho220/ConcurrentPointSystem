import { Module } from '@nestjs/common';
import { PointController } from './point.controller';
import { DatabaseModule } from '../database/database.module';
import { PointService } from './point.service';

@Module({
    imports: [DatabaseModule],
    controllers: [PointController],
    providers: [PointService],
})
export class PointModule {}
