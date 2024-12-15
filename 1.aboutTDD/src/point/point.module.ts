import { Module } from "@nestjs/common";
import { PointController } from "./point.controller";
import { DatabaseModule } from "src/database/database.module";

@Module({
    imports: [DatabaseModule],
    controllers: [PointController],
})
export class PointModule {}