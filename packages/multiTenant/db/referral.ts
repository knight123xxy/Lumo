import { bigint, mysqlTable, varchar } from "drizzle-orm/mysql-core";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sqliteReferralCode = sqliteTable("multiTenantReferralCode", {
  codeHash: text("codeHash").primaryKey(),
  referrerUserId: text("referrerUserId").notNull(),
  createdAt: integer("createdAt").notNull(),
});

export const mysqlReferralCode = mysqlTable("multiTenantReferralCode", {
  codeHash: varchar("codeHash", { length: 64 }).primaryKey(),
  referrerUserId: varchar("referrerUserId", { length: 36 }).notNull(),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export const sqliteReferralBinding = sqliteTable("multiTenantReferralBinding", {
  userId: text("userId").primaryKey(),
  codeHash: text("codeHash").notNull().references(() => sqliteReferralCode.codeHash),
  createdAt: integer("createdAt").notNull(),
});

export const mysqlReferralBinding = mysqlTable("multiTenantReferralBinding", {
  userId: varchar("userId", { length: 36 }).primaryKey(),
  codeHash: varchar("codeHash", { length: 64 }).notNull().references(() => mysqlReferralCode.codeHash),
  createdAt: bigint("createdAt", { mode: "number" }).notNull(),
});

export type ReferralCodeRecord = typeof sqliteReferralCode.$inferInsert;
