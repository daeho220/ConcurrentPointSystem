import { Test, TestingModule } from '@nestjs/testing';
import { PointService } from '../../src/point/point.service';
import { DatabaseModule } from '../../src/database/database.module';
import { TransactionType } from './point.model';

describe('Point Integration Test', () => {
    let app: TestingModule;
    let pointService: PointService;

    beforeAll(async () => {
        app = await Test.createTestingModule({
            imports: [DatabaseModule],
            providers: [PointService],
        }).compile();

        pointService = app.get<PointService>(PointService);
    });

    describe('동시성 제어 통합 테스트', () => {
        it('동시에 여러 요청이 들어왔을 때 데이터 정합성이 유지되어야 한다', async () => {
            // Given
            const userId = 1;
            const chargeAmount = 1000;
            // When
            const results = await Promise.all([
                pointService.chargePoint(userId, chargeAmount),
                pointService.chargePoint(userId, chargeAmount),
                pointService.chargePoint(userId, chargeAmount),
            ]);
            // Then
            // 1. 최종 포인트 확인
            const finalPoint = await pointService.getPoint(userId);
            expect(finalPoint.point).toBe(3000);
            // 2. 히스토리 기록 확인
            const history = await pointService.getPointHistory(userId);
            expect(history).toHaveLength(3);
            // 3. 각 트랜잭션의 순서가 올바른지 확인
            const points = results.map((r) => r.point);
            expect(points).toEqual([1000, 2000, 3000]);
        });
        it('포인트 충전과 사용이 동시에 발생할 때 데이터 정합성이 유지되어야 한다', async () => {
            // Given
            const userId = 2;
            const chargeAmount = 1000;
            const useAmount = 500;
            // When
            await Promise.all([
                pointService.chargePoint(userId, chargeAmount),
                pointService.usePoint(userId, useAmount),
                pointService.chargePoint(userId, chargeAmount),
            ]);
            // Then
            const finalPoint = await pointService.getPoint(userId);
            const history = await pointService.getPointHistory(userId);
            expect(finalPoint.point).toBe(1500); // 1000 - 500 + 1000
            expect(history).toHaveLength(3);
        });
        it('포인트 조회, 충전, 사용, 히스토리 조회가 동시에 발생할 때 데이터 정합성이 유지되어야 한다', async () => {
            // Given
            const userId = 3;
            const chargeAmount = 1000;
            const useAmount = 500;
            // When
            await Promise.all([
                pointService.getPoint(userId),
                pointService.chargePoint(userId, chargeAmount),
                pointService.usePoint(userId, useAmount),
                pointService.getPointHistory(userId),
            ]);
            // Then
            const finalPoint = await pointService.getPoint(userId);
            const history = await pointService.getPointHistory(userId);
            expect(finalPoint.point).toBe(500); // 1000 - 500
            expect(history).toHaveLength(2);
        });
        it('잔액이 부족한 상태에서 동시에 여러 포인트 사용 요청이 들어오면 모두 실패해야 한다', async () => {
            // Given
            const userId = 4;
            const useAmount = 1000;
            // When
            const results = await Promise.allSettled([
                pointService.usePoint(userId, useAmount),
                pointService.usePoint(userId, useAmount),
                pointService.usePoint(userId, useAmount),
            ]);
            // Then
            const finalPoint = await pointService.getPoint(userId);
            const history = await pointService.getPointHistory(userId);
            expect(finalPoint.point).toBe(0);
            expect(history).toHaveLength(0);
            expect(results.every((r) => r.status === 'rejected')).toBe(true);
        });
        it('최대 한도에 근접한 상태에서 동시에 여러 충전 요청이 들어오면 한도를 초과하지 않아야 한다', async () => {
            // Given
            const userId = 5;
            const maxBalance = 2_147_483_647;
            const initialCharge = maxBalance - 2000;
            const chargeAmount = 1000;
            await pointService.chargePoint(userId, initialCharge);
            // When
            const results = await Promise.allSettled([
                pointService.chargePoint(userId, chargeAmount),
                pointService.chargePoint(userId, chargeAmount),
                pointService.chargePoint(userId, chargeAmount),
            ]);
            // Then
            const finalPoint = await pointService.getPoint(userId);
            expect(finalPoint.point).toBeLessThanOrEqual(maxBalance);
            expect(results.some((r) => r.status === 'rejected')).toBe(true);
        });
        it('여러 사용자의 포인트 요청이 동시에 발생해도 각각 독립적으로 처리되어야 한다', async () => {
            // Given
            const user1 = 6;
            const user2 = 7;
            const chargeAmount = 1000;
            const useAmount = 500;
            // When
            const startTime = Date.now();
            await Promise.all([
                pointService.chargePoint(user1, chargeAmount),
                pointService.chargePoint(user2, chargeAmount),
                pointService.usePoint(user1, useAmount),
                pointService.usePoint(user2, useAmount),
            ]);
            const endTime = Date.now();
            // Then
            // 1. 최종 포인트 확인
            const [user1Point, user2Point] = await Promise.all([
                pointService.getPoint(user1),
                pointService.getPoint(user2),
            ]);
            expect(user1Point.point).toBe(500);
            expect(user2Point.point).toBe(500);
            // 2. 처리 시간 검증
            // 순차 처리시: (충전 + 히스토리 저장) * 2 + (사용 + 히스토리 저장) * 2 = 최대 2400ms
            // 동시 처리시: 최대 600ms (한 번의 작업 사이클)
            const processingTime = endTime - startTime;
            expect(processingTime).toBeLessThan(1200); // 순차 처리 시간의 절반 이하
            // 3. 각 사용자의 트랜잭션이 독립적으로 처리되었는지 검증
            const [user1History, user2History] = await Promise.all([
                pointService.getPointHistory(user1),
                pointService.getPointHistory(user2),
            ]);
            // 각 사용자별로 정확한 히스토리 개수 확인
            expect(user1History).toHaveLength(2); // 충전 1회, 사용 1회
            expect(user2History).toHaveLength(2); // 충전 1회, 사용 1회
            // 각 사용자의 히스토리가 올바른 순서로 기록되었는지 확인
            expect(user1History.map((h) => h.type)).toEqual([
                TransactionType.CHARGE,
                TransactionType.USE,
            ]);
            expect(user2History.map((h) => h.type)).toEqual([
                TransactionType.CHARGE,
                TransactionType.USE,
            ]);
        });
        it('동시에 대량의 소액 트랜잭션이 발생해도 정확히 처리되어야 한다', async () => {
            // Given
            const userId = 8;
            const initialCharge = 10000;
            const smallAmount = 1;
            const transactionCount = 100;
            await pointService.chargePoint(userId, initialCharge);
            // When
            const chargePromises = Array(transactionCount)
                .fill(null)
                .map(() => pointService.chargePoint(userId, smallAmount));
            const usePromises = Array(transactionCount)
                .fill(null)
                .map(() => pointService.usePoint(userId, smallAmount));
            await Promise.all([...chargePromises, ...usePromises]);
            // Then
            const finalPoint = await pointService.getPoint(userId);
            const history = await pointService.getPointHistory(userId);
            expect(finalPoint.point).toBe(initialCharge);
            expect(history).toHaveLength(transactionCount * 2 + 1); // 초기 충전 포함
        }, 100000);
    });
    afterAll(async () => {
        await app.close();
    });
});
