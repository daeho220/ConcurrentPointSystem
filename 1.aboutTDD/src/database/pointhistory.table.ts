import { Injectable } from "@nestjs/common";
import { randomInt } from "crypto";
import { PointHistory, TransactionType } from "src/point/point.model";

/**
 * 해당 Table 클래스는 변경하지 않고 공개된 API 만을 사용해 데이터를 제어합니다.
 */
@Injectable()
export class PointHistoryTable {
    private readonly table: PointHistory[] = []
    private cursor = 1

    insert(
        userId: number,
        amount: number,
        transactionType: TransactionType,
        updateMillis: number,
    ): Promise<PointHistory> {
        return new Promise((r) => {
            setTimeout(() => {
                const history: PointHistory  = {
                    id: this.cursor ++, 
                    userId: userId,
                    amount: amount,
                    type: transactionType,
                    timeMillis: updateMillis,
                }
                this.table.push(history)
                r(history)
            }, randomInt(300))
        })
    }

    selectAllByUserId(userId: number): Promise<PointHistory[]> {
        return new Promise((r) => {
            r(this.table.filter((v) => v.userId == userId))
        })
    }
}