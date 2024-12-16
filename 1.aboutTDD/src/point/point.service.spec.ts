import { Test, TestingModule } from '@nestjs/testing';
import { PointService } from './point.service';
import { UserPointTable } from '../database/userpoint.table';
import { UserPoint } from './point.model';

describe('PointService', () => {
    let service: PointService;
    let userPointTable: UserPointTable;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PointService,
                {
                    provide: UserPointTable,
                    useValue: {
                        selectById: jest.fn(),
                    },
                },
            ],
        }).compile();

        service = module.get<PointService>(PointService);
        userPointTable = module.get<UserPointTable>(UserPointTable);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    // 포인트 조회 단위 테스트
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
});
