import { Body, Controller, Get, Param, Patch, ValidationPipe, ParseIntPipe } from '@nestjs/common';
import { PointHistory, UserPoint } from './point.model';
import { UserPointTable } from '../database/userpoint.table';
import { PointHistoryTable } from '../database/pointhistory.table';
import { PointBody as PointDto } from './point.dto';
import { PointService } from './point.service';

@Controller('/point')
export class PointController {
    constructor(
        private readonly userDb: UserPointTable,
        private readonly historyDb: PointHistoryTable,
        private readonly pointService: PointService,
    ) {}

    /**
     * TODO - 특정 유저의 포인트를 조회하는 기능을 작성해주세요.
     */
    @Get(':id')
    async point(@Param('id', ParseIntPipe) userId: number): Promise<UserPoint> {
        return this.pointService.getPoint(userId);
    }

    /**
     * TODO - 특정 유저의 포인트 충전/이용 내역을 조회하는 기능을 작성해주세요.
     */
    @Get(':id/histories')
    async history(@Param('id', ParseIntPipe) userId: number): Promise<PointHistory[]> {
        return this.pointService.getPointHistory(userId);
    }

    /**
     * TODO - 특정 유저의 포인트를 충전하는 기능을 작성해주세요.
     */
    @Patch(':id/charge')
    async charge(
        @Param('id', ParseIntPipe) id: number,
        @Body(ValidationPipe) pointDto: PointDto,
    ): Promise<UserPoint> {
        const amount = pointDto.amount;
        return this.pointService.chargePoint(id, amount);
    }

    /**
     * TODO - 특정 유저의 포인트를 사용하는 기능을 작성해주세요.
     */
    @Patch(':id/use')
    async use(
        @Param('id', ParseIntPipe) id: number,
        @Body(ValidationPipe) pointDto: PointDto,
    ): Promise<UserPoint> {
        const amount = pointDto.amount;
        return this.pointService.usePoint(id, amount);
    }
}
