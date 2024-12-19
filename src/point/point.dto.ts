import { IsInt, IsPositive } from 'class-validator';

export class PointBody {
    @IsInt()
    @IsPositive()
    amount: number;
}
