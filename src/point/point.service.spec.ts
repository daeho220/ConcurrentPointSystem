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
                        selectAllByUserId: jest.fn(),
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

    describe('포인트 조회 단위 테스트', () => {
        describe('성공 케이스', () => {
            it('유효한 사용자 ID가 제공되면 올바른 사용자 포인트 정보를 반환합니다.', async () => {
                const userId = 1;
                const now = Date.now();

                //selectById 메서드 모킹
                const mockUserPoint: UserPoint = { id: userId, point: 100, updateMillis: now };
                jest.spyOn(userPointTable, 'selectById').mockResolvedValue(mockUserPoint);

                const result = await service.getPoint(userId);

                expect(result).toEqual({ id: userId, point: 100, updateMillis: now });
            });
        });
        describe('실패 케이스', () => {
            it.each([
                { userId: null, description: 'null' },
                { userId: 0, description: '0' },
                { userId: -1, description: 'negative number' },
                { userId: NaN, description: 'NaN' },
                { userId: undefined, description: 'undefined' },
            ])(
                '유효하지 않은 사용자 ID가 제공되면 예외를 발생시킵니다. userId is $description',
                async ({ userId }) => {
                    await expect(service.getPoint(userId)).rejects.toThrow(
                        '올바르지 않은 ID 값 입니다.',
                    );
                },
            );
        });
    });

    describe('포인트 충전 단위 테스트', () => {
        describe('성공 케이스', () => {
            beforeAll(async () => {
                // 포인트 히스토리 모킹
                jest.spyOn(pointHistoryTable, 'insert').mockImplementation(
                    async (userId, amount, type, time) => ({
                        id: Math.random(),
                        userId,
                        amount,
                        type,
                        timeMillis: time,
                    }),
                );
            });
            it('유효한 사용자 ID와 충전 금액이 제공되면 올바른 사용자 포인트 정보를 반환합니다.', async () => {
                const userId = 1;
                const initialPoint = 0;
                const chargeAmount = 1000;
                const newBalance = initialPoint + chargeAmount;

                const now = Date.now();

                // selectById 모킹 - 항상 초기값 반환
                const mockUserPoint: UserPoint = {
                    id: userId,
                    point: initialPoint,
                    updateMillis: now,
                };
                jest.spyOn(userPointTable, 'selectById').mockResolvedValue(mockUserPoint);

                // 사용자 포인트 업데이트 모킹
                const mockInsertOrUpdate: UserPoint = {
                    id: userId,
                    point: newBalance,
                    updateMillis: now,
                };
                jest.spyOn(userPointTable, 'insertOrUpdate').mockResolvedValue(mockInsertOrUpdate);

                const result = await service.chargePoint(userId, chargeAmount);

                expect(result).toEqual(mockInsertOrUpdate);
            });
            it('동시에 3번의 충전 요청이 들어오면 순차적으로 처리되어야 합니다.', async () => {
                const userId = 1;
                const chargeAmount = 1000;
                let currentPoint = 1000; // 초기 포인트

                // selectById 모킹 - 현재 포인트 반환
                jest.spyOn(userPointTable, 'selectById').mockImplementation(async () => ({
                    id: userId,
                    point: currentPoint,
                    updateMillis: Date.now(),
                }));

                // insertOrUpdate 모킹 - 포인트 업데이트
                jest.spyOn(userPointTable, 'insertOrUpdate').mockImplementation(
                    async (userId, newPoint) => {
                        await new Promise((resolve) => setTimeout(resolve, 10)); // 의도적 지연
                        currentPoint = newPoint;
                        return {
                            id: userId,
                            point: newPoint,
                            updateMillis: Date.now(),
                        };
                    },
                );

                // 동시에 3번의 충전 요청
                const results = await Promise.all([
                    service.chargePoint(userId, chargeAmount),
                    service.chargePoint(userId, chargeAmount),
                    service.chargePoint(userId, chargeAmount),
                ]);

                // 검증
                const finalResult = results[results.length - 1];
                expect(finalResult.point).toBe(4000); // 1000 + (1000 * 3)

                // 모든 충전이 순차적으로 처리되었는지 검증
                const points = results.map((r) => r.point);
                expect(points).toEqual([2000, 3000, 4000]);

                // insertOrUpdate 호출 횟수 확인
                expect(userPointTable.insertOrUpdate).toHaveBeenCalledTimes(3);
            });
        });
        describe('실패 케이스', () => {
            it('충전 금액이 0보다 작으면 예외를 발생시킵니다.', async () => {
                const userId = 1;
                const chargeAmount = -1000;

                await expect(service.chargePoint(userId, chargeAmount)).rejects.toThrow(
                    BadRequestException,
                );
            });
            it('충전 금액이 최대 잔고(2,147,483,647)를 초과하면 예외를 발생시킵니다.', async () => {
                const userId = 1;
                const initialPoint = 0;
                const chargeAmount = 2_147_483_648;

                const now = Date.now();

                const mockUserPoint: UserPoint = {
                    id: userId,
                    point: initialPoint,
                    updateMillis: now,
                };
                jest.spyOn(userPointTable, 'selectById').mockResolvedValue(mockUserPoint);

                await expect(service.chargePoint(userId, chargeAmount)).rejects.toThrow(
                    BadRequestException,
                );
                await expect(service.chargePoint(userId, chargeAmount)).rejects.toThrow(
                    '최대 잔고를 초과했습니다.',
                );
            });
            it.each([
                { userId: null, description: 'null' },
                { userId: 0, description: '0' },
                { userId: -1, description: 'negative number' },
                { userId: NaN, description: 'NaN' },
                { userId: undefined, description: 'undefined' },
            ])(
                '유효하지 않은 사용자 ID가 제공되면 예외를 발생시킵니다. userId is $description',
                async ({ userId }) => {
                    const amount = 1000;

                    jest.spyOn(userPointTable, 'selectById').mockRejectedValue(
                        new Error('올바르지 않은 ID 값 입니다.'),
                    );

                    const result = service.chargePoint(userId, amount);
                    await expect(result).rejects.toThrow('올바르지 않은 ID 값 입니다.');
                },
            );
        });
    });

    describe('포인트 사용 단위 테스트', () => {
        describe('성공 케이스', () => {
            beforeAll(async () => {
                // 포인트 히스토리 모킹
                jest.spyOn(pointHistoryTable, 'insert').mockImplementation(
                    async (userId, amount, type, time) => ({
                        id: Math.random(),
                        userId,
                        amount,
                        type,
                        timeMillis: time,
                    }),
                );
            });
            it('유효한 사용자 ID와 사용 금액이 제공되면 올바른 사용자 포인트 정보를 반환합니다.', async () => {
                const userId = 1;
                const initialPoint = 10000;
                const useAmount = 1000;
                const newBalance = initialPoint - useAmount;

                const now = Date.now();

                // selectById 모킹 - 항상 초기값 반환
                const mockUserPoint: UserPoint = {
                    id: userId,
                    point: initialPoint,
                    updateMillis: now,
                };
                jest.spyOn(userPointTable, 'selectById').mockResolvedValue(mockUserPoint);

                // 사용자 포인트 업데이트 모킹
                const mockInsertOrUpdate: UserPoint = {
                    id: userId,
                    point: newBalance,
                    updateMillis: now,
                };
                jest.spyOn(userPointTable, 'insertOrUpdate').mockResolvedValue(mockInsertOrUpdate);

                const result = await service.usePoint(userId, useAmount);

                expect(result).toEqual(mockInsertOrUpdate);
            });
            it('동시에 3번의 사용 요청이 들어오면 순차적으로 처리되어야 합니다.', async () => {
                const userId = 1;
                const useAmount = 1000;
                let currentPoint = 10000; // 초기 포인트

                // selectById 모킹 - 현재 포인트 반환
                jest.spyOn(userPointTable, 'selectById').mockImplementation(async () => ({
                    id: userId,
                    point: currentPoint,
                    updateMillis: Date.now(),
                }));

                // insertOrUpdate 모킹 - 포인트 업데이트
                jest.spyOn(userPointTable, 'insertOrUpdate').mockImplementation(
                    async (userId, newPoint) => {
                        await new Promise((resolve) => setTimeout(resolve, 10)); // 의도적 지연
                        currentPoint = newPoint;
                        return {
                            id: userId,
                            point: newPoint,
                            updateMillis: Date.now(),
                        };
                    },
                );

                // 동시에 3번의 충전 요청
                const results = await Promise.all([
                    service.usePoint(userId, useAmount),
                    service.usePoint(userId, useAmount),
                    service.usePoint(userId, useAmount),
                ]);

                // 검증
                const finalResult = results[results.length - 1];
                expect(finalResult.point).toBe(7000); // 10000 - (1000 * 3)

                // 모든 충전이 순차적으로 처리되었는지 검증
                const points = results.map((r) => r.point);
                expect(points).toEqual([9000, 8000, 7000]);

                // insertOrUpdate 호출 횟수 확인
                expect(userPointTable.insertOrUpdate).toHaveBeenCalledTimes(3);
            });
        });
        describe('실패 케이스', () => {
            it('사용 금액이 0보다 작으면 예외를 발생시킵니다.', async () => {
                const userId = 1;
                const useAmount = -1000;

                await expect(service.usePoint(userId, useAmount)).rejects.toThrow(
                    BadRequestException,
                );
            });
            it('사용 금액이 현재 잔고를 초과하면 예외를 발생시킵니다.', async () => {
                const userId = 1;
                const currentPoint = 0;
                const useAmount = 1000;

                const now = Date.now();

                const mockUserPoint: UserPoint = {
                    id: userId,
                    point: currentPoint,
                    updateMillis: now,
                };
                jest.spyOn(userPointTable, 'selectById').mockResolvedValue(mockUserPoint);

                await expect(service.usePoint(userId, useAmount)).rejects.toThrow(
                    BadRequestException,
                );
                await expect(service.usePoint(userId, useAmount)).rejects.toThrow(
                    '최저 잔고는 0입니다.',
                );
            });
            it.each([
                { userId: null, description: 'null' },
                { userId: 0, description: '0' },
                { userId: -1, description: 'negative number' },
                { userId: NaN, description: 'NaN' },
                { userId: undefined, description: 'undefined' },
            ])(
                '유효하지 않은 사용자 ID가 제공되면 예외를 발생시킵니다. userId is $description',
                async ({ userId }) => {
                    const amount = 1000;

                    jest.spyOn(userPointTable, 'selectById').mockRejectedValue(
                        new Error('올바르지 않은 ID 값 입니다.'),
                    );

                    const result = service.usePoint(userId, amount);
                    await expect(result).rejects.toThrow('올바르지 않은 ID 값 입니다.');
                },
            );
        });
    });

    describe('포인트 이력 조회 단위 테스트', () => {
        describe('성공 케이스', () => {
            it('유효한 사용자 ID가 제공되면 올바른 사용자 포인트 이력을 반환합니다.', async () => {
                const userId = 1;
                const now = Date.now();

                const mockPointHistory: PointHistory[] = [
                    { id: 1, userId, amount: 2000, type: TransactionType.CHARGE, timeMillis: now },
                    { id: 2, userId, amount: 1000, type: TransactionType.USE, timeMillis: now },
                ];

                jest.spyOn(pointHistoryTable, 'selectAllByUserId').mockResolvedValue(
                    mockPointHistory,
                );

                const result = await service.getPointHistory(userId);

                expect(result).toEqual(mockPointHistory);
            });
        });
        describe('실패 케이스', () => {
            it.each([
                { userId: null, description: 'null' },
                { userId: 0, description: '0' },
                { userId: -1, description: 'negative number' },
                { userId: NaN, description: 'NaN' },
                { userId: undefined, description: 'undefined' },
            ])(
                '유효하지 않은 사용자 ID가 제공되면 예외를 발생시킵니다. userId is $description',
                async ({ userId }) => {
                    await expect(service.getPointHistory(userId)).rejects.toThrow(
                        '올바르지 않은 ID 값 입니다.',
                    );
                },
            );
        });
    });
});
