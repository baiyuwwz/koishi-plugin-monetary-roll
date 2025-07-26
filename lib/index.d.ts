import { Context, Schema } from 'koishi';
declare module 'koishi' {
    interface Tables {
        roll_record: RollRecord;
    }
}
export interface RollRecord {
    id: string;
    count: number;
    lastRollDate: string;
}
export interface RewardConfig {
    name: string;
    probability: number;
    reward: number;
}
export declare const inject: string[];
export declare const name = "monetary-roll";
export interface Config {
    cost: number;
    dailyLimit: number;
    rewards: RewardConfig[];
}
export declare const Config: Schema<Config>;
export declare function apply(ctx: Context): void;
