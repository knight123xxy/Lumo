import { bigint, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sqliteRechargeCard = sqliteTable("multiTenantRechargeCard", {
  codeHash: text("codeHash").primaryKey().notNull(),
  requestId: text("requestId").notNull().unique(),
  amountMicros: integer("amountMicros").notNull(),
});

export const mysqlRechargeCard = mysqlTable("multiTenantRechargeCard", {
  codeHash: varchar("codeHash", { length: 64 }).primaryKey(),
  requestId: varchar("requestId", { length: 36 }).notNull().unique(),
  amountMicros: bigint("amountMicros", { mode: "number" }).notNull(),
});

export type RechargeCard = typeof sqliteRechargeCard.$inferSelect;
