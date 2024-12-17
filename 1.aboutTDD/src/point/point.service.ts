import { BadRequestException, Injectable } from '@nestjs/common';
import { UserPointTable } from '../database/userpoint.table';
import { PointHistoryTable } from '../database/pointhistory.table';
import { PointHistory, TransactionType, UserPoint } from './point.model';

@Injectable()
export class PointService {
    constructor(
        private readonly userPointTable: UserPointTable,
        private readonly pointHistoryTable: PointHistoryTable,
    ) {}

    private readonly MAX_BALANCE = 2_147_483_647;
    private readonly MIN_BALANCE = 0;

    async getPoint(userId: number): Promise<UserPoint> {
        if (userId == null || userId <= 0 || Number.isNaN(userId)) {
            throw new BadRequestException('올바르지 않은 ID 값 입니다.');
        }
        return this.userPointTable.selectById(userId);
    }

    async chargePoint(userId: number, amount: number): Promise<UserPoint> {
        if (amount < 0) {
            throw new BadRequestException('충전 금액은 0보다 커야 합니다.');
        }

        const userInfo = await this.userPointTable.selectById(userId);
        const currentBalance = userInfo.point;

        // 잔고 검증 호출
        this.validateBalance(currentBalance, amount);

        // 포인트 히스토리 저장
        await this.insertPointHistory(userId, amount, TransactionType.CHARGE);

        const newBalance = currentBalance + amount;

        return this.userPointTable.insertOrUpdate(userId, newBalance);
    }

    validateBalance(currentBalance: number, amount: number): void {
        const newBalance = currentBalance + amount;

        if (newBalance < this.MIN_BALANCE) {
            throw new BadRequestException('최저 잔고는 0입니다.');
        }

        if (newBalance > this.MAX_BALANCE) {
            throw new BadRequestException('최대 잔고를 초과했습니다.');
        }
    }

    async insertPointHistory(
        userId: number,
        amount: number,
        type: TransactionType,
    ): Promise<PointHistory> {
        return this.pointHistoryTable.insert(userId, amount, type, Date.now());
    }
}
