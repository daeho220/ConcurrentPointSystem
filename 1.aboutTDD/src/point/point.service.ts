import { BadRequestException, Injectable } from '@nestjs/common';
import { UserPointTable } from '../database/userpoint.table';
import { UserPoint } from './point.model';

@Injectable()
export class PointService {
    constructor(private readonly userPointTable: UserPointTable) {}

    async getUserPoint(userId: number): Promise<UserPoint> {
        if (userId == null || userId <= 0 || Number.isNaN(userId)) {
            throw new BadRequestException('올바르지 않은 ID 값 입니다.');
        }
        return this.userPointTable.selectById(userId);
    }
}
