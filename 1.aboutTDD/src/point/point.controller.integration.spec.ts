import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PointModule } from './point.module';
import { UserPointTable } from '../database/userpoint.table';
import { TransactionType } from './point.model';

describe('PointController Integration', () => {
    let app: INestApplication;
    let userPointTable: UserPointTable;

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [PointModule],
        })
            .overrideProvider(UserPointTable)
            .useValue({
                selectById: jest.fn(),
                insertOrUpdate: jest.fn(),
            })
            .compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        userPointTable = moduleFixture.get<UserPointTable>(UserPointTable);
    });

    afterEach(async () => {
        await app.close();
    });

    describe('포인트 시스템 테스트', () => {
        describe('성공 테스트', () => {
            it('충전 요청이 동시에 3개 들어오면 순차적으로 처리되어야 한다.', async () => {
                const userId = 1;
                const chargeAmount = 1000;
                let currentPoint = 1000;

                jest.spyOn(userPointTable, 'selectById').mockImplementation(async () => ({
                    id: userId,
                    point: currentPoint,
                    updateMillis: Date.now(),
                }));

                jest.spyOn(userPointTable, 'insertOrUpdate').mockImplementation(
                    async (id, point) => {
                        currentPoint = point;
                        return {
                            id,
                            point,
                            updateMillis: Date.now(),
                        };
                    },
                );

                const results = await Promise.all([
                    request(app.getHttpServer())
                        .patch(`/point/${userId}/charge`)
                        .send({ amount: chargeAmount }),
                    request(app.getHttpServer())
                        .patch(`/point/${userId}/charge`)
                        .send({ amount: chargeAmount }),
                    request(app.getHttpServer())
                        .patch(`/point/${userId}/charge`)
                        .send({ amount: chargeAmount }),
                ]);

                results.forEach((response) => {
                    expect(response.status).toBe(200);
                });

                const finalResponse = await request(app.getHttpServer())
                    .get(`/point/${userId}`)
                    .expect(200);

                expect(finalResponse.body.point).toBe(4000);
            });
            it('사용 요청이 동시에 3개 들어오면 순차적으로 처리되어야 한다.', async () => {
                const userId = 2;
                const useAmount = 1000;
                let currentPoint = 4000;

                jest.spyOn(userPointTable, 'selectById').mockImplementation(async () => ({
                    id: userId,
                    point: currentPoint,
                    updateMillis: Date.now(),
                }));

                jest.spyOn(userPointTable, 'insertOrUpdate').mockImplementation(
                    async (id, point) => {
                        currentPoint = point;
                        return {
                            id,
                            point,
                            updateMillis: Date.now(),
                        };
                    },
                );

                const results = await Promise.all([
                    request(app.getHttpServer())
                        .patch(`/point/${userId}/use`)
                        .send({ amount: useAmount }),
                    request(app.getHttpServer())
                        .patch(`/point/${userId}/use`)
                        .send({ amount: useAmount }),
                    request(app.getHttpServer())
                        .patch(`/point/${userId}/use`)
                        .send({ amount: useAmount }),
                ]);

                results.forEach((response) => {
                    expect(response.status).toBe(200);
                });

                const finalResponse = await request(app.getHttpServer())
                    .get(`/point/${userId}`)
                    .expect(200);

                expect(finalResponse.body.point).toBe(1000);
            });
            it('포인트 이력이 올바르게 기록되어야 한다.', async () => {
                const userId = 6;
                const chargeAmount = 1000;
                const currentPoint = 0;

                jest.spyOn(userPointTable, 'selectById').mockImplementation(async () => ({
                    id: userId,
                    point: currentPoint,
                    updateMillis: Date.now(),
                }));

                await request(app.getHttpServer())
                    .patch(`/point/${userId}/charge`)
                    .send({ amount: chargeAmount })
                    .expect(200);

                const historyResponse = await request(app.getHttpServer())
                    .get(`/point/${userId}/histories`)
                    .expect(200);

                expect(historyResponse.body).toHaveLength(1);
                expect(historyResponse.body[0].amount).toEqual(chargeAmount);
                expect(historyResponse.body[0].type).toEqual(TransactionType.CHARGE);
            });
        });

        describe('실패 테스트', () => {
            it('잔액 부족 시 사용 요청이 실패해야 한다.', async () => {
                const userId = 3;
                const useAmount = 5000; // 현재 잔액보다 큰 금액
                const currentPoint = 1000;

                jest.spyOn(userPointTable, 'selectById').mockImplementation(async () => ({
                    id: userId,
                    point: currentPoint,
                    updateMillis: Date.now(),
                }));

                const response = await request(app.getHttpServer())
                    .patch(`/point/${userId}/use`)
                    .send({ amount: useAmount });

                expect(response.status).toBe(400);
            });
            it('잘못된 금액으로 요청 시 실패해야 한다.', async () => {
                const userId = 4;

                const responseNegative = await request(app.getHttpServer())
                    .patch(`/point/${userId}/charge`)
                    .send({ amount: -1000 });

                expect(responseNegative.status).toBe(400); // 음수 금액으로 실패

                const responseZero = await request(app.getHttpServer())
                    .patch(`/point/${userId}/charge`)
                    .send({ amount: 0 });

                expect(responseZero.status).toBe(400); // 0 금액으로 실패
            });
            it('최대 잔액 초과 시 충전 요청이 실패해야 한다.', async () => {
                const userId = 5;
                const maxAmount = 2_147_483_647; // 시스템 최대 잔액
                const currentPoint = maxAmount;

                jest.spyOn(userPointTable, 'selectById').mockImplementation(async () => ({
                    id: userId,
                    point: currentPoint,
                    updateMillis: Date.now(),
                }));

                const response = await request(app.getHttpServer())
                    .patch(`/point/${userId}/charge`)
                    .send({ amount: 1 });

                expect(response.status).toBe(400); // 최대 잔액 초과로 실패
            });
        });
    });
});
