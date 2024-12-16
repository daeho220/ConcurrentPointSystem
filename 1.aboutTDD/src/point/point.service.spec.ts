import { Test, TestingModule } from '@nestjs/testing';
import { PointService } from './point.service';
import { UserPointTable } from '../database/userpoint.table';
import { PointHistory, TransactionType, UserPoint } from './point.model';
import { BadRequestException } from '@nestjs/common';
import { PointHistoryTable } from '../database/pointhistory.table';

describe('PointService', () => {
    let service: PointService;
    let userPointTable: UserPointTable;
    let pointHistoryTable: PointHistoryTable;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PointService,
                {
                    provide: UserPointTable,
                    useValue: {
                        selectById: jest.fn(),
                        insertOrUpdate: jest.fn(),
                    },
                },
                {
                    provide: PointHistoryTable,
                    useValue: {
                        insert: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<PointService>(PointService);
        userPointTable = module.get<UserPointTable>(UserPointTable);
        pointHistoryTable = module.get<PointHistoryTable>(PointHistoryTable);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // 포인트 조회 Unit test
    describe('get user point', () => {
        // 성공 케이스
        // 1. 유효한 사용자 ID가 제공되면 올바른 사용자 포인트 정보를 반환합니다.
        it('should return the correct user point information when a valid user ID is provided', async () => {
            const userId = 1;
            const now = Date.now();

            //selectById 메서드 모킹
            const mockUserPoint: UserPoint = { id: userId, point: 100, updateMillis: now };
            jest.spyOn(userPointTable, 'selectById').mockResolvedValue(mockUserPoint);

            const result = await service.getUserPoint(userId);

            expect(result).toEqual({ id: userId, point: 100, updateMillis: now });
        });

        //실패 케이스
        // 1. 유효하지 않은 사용자 ID가 제공되면 예외를 발생시킵니다.
        it.each([
            { userId: null, description: 'null' },
            { userId: 0, description: '0' },
            { userId: -1, description: 'negative number' },
            { userId: NaN, description: 'NaN' },
            { userId: undefined, description: 'undefined' },
        ])('should throw an error when userId is $description', async ({ userId }) => {
            await expect(service.getUserPoint(userId)).rejects.toThrow(
                '올바르지 않은 ID 값 입니다.',
            );
        });
    });

    // 포인트 충전 Unit test
    describe('charge user point', () => {
        // 성공 케이스
        // 1. 유효한 사용자 ID와 충전 금액이 제공되면 올바른 사용자 포인트 정보를 반환합니다.
        it('should charge the user point', async () => {
            const userId = 1;
            const firstPoint = 0;
            const amount = 1000;
            const newBalance = firstPoint + amount;

            const now = Date.now();

            // 사용자 포인트 조회 모킹
            const mockUserPoint: UserPoint = {
                id: userId,
                point: firstPoint,
                updateMillis: now,
            };
            jest.spyOn(userPointTable, 'selectById').mockResolvedValue(mockUserPoint);

            // 포인트 히스토리 삽입 모킹
            const mockPointHistory: PointHistory = {
                id: 1,
                userId: userId,
                amount: amount,
                type: TransactionType.CHARGE,
                timeMillis: now,
            };

            jest.spyOn(pointHistoryTable, 'insert').mockResolvedValue(mockPointHistory);

            // 사용자 포인트 업데이트 모킹
            const mockInsertOrUpdate: UserPoint = {
                id: userId,
                point: newBalance,
                updateMillis: now,
            };
            jest.spyOn(userPointTable, 'insertOrUpdate').mockResolvedValue(mockInsertOrUpdate);

            const result = await service.chargeUserPoint(userId, amount);

            expect(result).toEqual(mockInsertOrUpdate);
        });

        // 실패 케이스
        // 1. 충전 금액이 0보다 작으면 예외를 발생시킵니다.
        it('should throw an error when the amount is less than 0', async () => {
            const userId = 1;
            const amount = -1000;

            await expect(service.chargeUserPoint(userId, amount)).rejects.toThrow(
                BadRequestException,
            );
        });
        // 2. 충전 금액이 최대 잔고(2,147,483,647)를 초과하면 예외를 발생시킵니다.
        it('should throw an error when the amount exceeds the maximum balance', async () => {
            const userId = 1;
            const firstPoint = 0;
            const amount = 2_147_483_648;

            const now = Date.now();

            const mockUserPoint: UserPoint = {
                id: userId,
                point: firstPoint,
                updateMillis: now,
            };
            jest.spyOn(userPointTable, 'selectById').mockResolvedValue(mockUserPoint);

            await expect(service.chargeUserPoint(userId, amount)).rejects.toThrow(
                BadRequestException,
            );
            await expect(service.chargeUserPoint(userId, amount)).rejects.toThrow(
                '최대 잔고를 초과했습니다.',
            );
        });
        // 3. 유효하지 않은 사용자 ID가 제공되면 예외를 발생시킵니다.
        it.each([
            { userId: null, description: 'null' },
            { userId: 0, description: '0' },
            { userId: -1, description: 'negative number' },
            { userId: NaN, description: 'NaN' },
            { userId: undefined, description: 'undefined' },
        ])('should throw an error when the userId is $description', async ({ userId }) => {
            const amount = 1000;

            jest.spyOn(userPointTable, 'selectById').mockRejectedValue(
                new Error('올바르지 않은 ID 값 입니다.'),
            );

            const result = service.chargeUserPoint(userId, amount);
            await expect(result).rejects.toThrow('올바르지 않은 ID 값 입니다.');
        });
    });
});
