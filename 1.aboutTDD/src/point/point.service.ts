import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { UserPointTable } from '../database/userpoint.table';
import { PointHistoryTable } from '../database/pointhistory.table';
import { PointHistory, TransactionType, UserPoint } from './point.model';
import { Mutex } from 'async-mutex';

@Injectable()
export class PointService {
    private userMutexMap: Map<number, Mutex> = new Map();
    constructor(
        private readonly userPointTable: UserPointTable,
        private readonly pointHistoryTable: PointHistoryTable,
    ) {}

    private readonly MAX_BALANCE = 2_147_483_647;
    private readonly MIN_BALANCE = 0;

    async getPoint(userId: number): Promise<UserPoint> {
        const mutex = this.getUserMutex(userId);
        return await mutex.runExclusive(() => {
            if (userId == null || userId <= 0 || Number.isNaN(userId)) {
                throw new BadRequestException('올바르지 않은 ID 값 입니다.');
            }
            return this.userPointTable.selectById(userId);
        });
    }

    async chargePoint(userId: number, amount: number): Promise<UserPoint> {
        const mutex = this.getUserMutex(userId);

        return await mutex.runExclusive(async () => {
            if (amount < 0) {
                throw new BadRequestException('충전 금액은 0보다 커야 합니다.');
            }
            const userInfo = await this.userPointTable.selectById(userId);
            const currentBalance = userInfo.point;
            const newBalance = currentBalance + amount;

            // 잔고 검증 호출
            this.validateBalance(newBalance);

            // 실제 포인트 변경
            const updatedUserPoint = await this.userPointTable.insertOrUpdate(userId, newBalance);

            try {
                // 포인트 히스토리 저장
                await this.pointHistoryTable.insert(
                    userId,
                    amount,
                    TransactionType.CHARGE,
                    Date.now(),
                );
            } catch (error) {
                // 롤백을 위한 코드 추가
                await this.userPointTable.insertOrUpdate(userId, currentBalance);
                throw new Error('히스토리 기록 실패');
            }

            return updatedUserPoint;
        });
    }

    async usePoint(userId: number, amount: number): Promise<UserPoint> {
        const mutex = this.getUserMutex(userId);

        return await mutex.runExclusive(async () => {
            if (amount < 0) {
                throw new BadRequestException('사용 금액은 0보다 커야 합니다.');
            }
            const userInfo = await this.userPointTable.selectById(userId);
            const currentBalance = userInfo.point;
            const newBalance = currentBalance - amount;

            // 잔고 검증 호출
            this.validateBalance(newBalance);

            // 실제 포인트 변경
            const updatedUserPoint = await this.userPointTable.insertOrUpdate(userId, newBalance);

            try {
                // 포인트 히스토리 저장
                await this.pointHistoryTable.insert(
                    userId,
                    amount,
                    TransactionType.USE,
                    Date.now(),
                );
            } catch (error) {
                // 롤백을 위한 코드 추가
                await this.userPointTable.insertOrUpdate(userId, currentBalance);
                throw new Error('히스토리 기록 실패');
            }

            return updatedUserPoint;
        });
    }

    async getPointHistory(userId: number): Promise<PointHistory[]> {
        const mutex = this.getUserMutex(userId);
        return await mutex.runExclusive(() => {
            if (userId == null || userId <= 0 || Number.isNaN(userId)) {
                throw new BadRequestException('올바르지 않은 ID 값 입니다.');
            }
            return this.pointHistoryTable.selectAllByUserId(userId);
        });
    }

    validateBalance(newBalance: number): void {
        if (newBalance < this.MIN_BALANCE) {
            throw new BadRequestException('최저 잔고는 0입니다.');
        }

        if (newBalance > this.MAX_BALANCE) {
            throw new BadRequestException('최대 잔고를 초과했습니다.');
        }
    }

    private getUserMutex(userId: number): Mutex {
        if (!this.userMutexMap.has(userId)) {
            this.userMutexMap.set(userId, new Mutex());
        }
        return this.userMutexMap.get(userId);
    }
}
