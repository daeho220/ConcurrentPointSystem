import { IsInt, isPositive } from 'class-validator';

export class PointBody {
    @IsInt()
    amount: number;
}
