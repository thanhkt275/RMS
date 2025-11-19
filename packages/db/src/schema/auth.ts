import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userTypes = ["REGULAR", "ORG"] as const;
export const regularRoles = [
  "TEAM_MENTOR",
  "TEAM_LEADER",
  "TEAM_MEMBER",
  "COMMON",
] as const;
export const orgRoles = [
  "ADMIN",
  "TSO",
  "HEAD_REFEREE",
  "SCORE_KEEPER",
  "QUEUER",
] as const;

export const allUserRoles = [...regularRoles, ...orgRoles] as const;

export type UserType = (typeof userTypes)[number];
export type RegularRole = (typeof regularRoles)[number];
export type OrgRole = (typeof orgRoles)[number];
export type AnyUserRole = (typeof allUserRoles)[number];

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  username: text("username").unique(),
  displayUsername: text("display_username"),
  type: text("type").$type<UserType>().notNull().default("REGULAR"),
  role: text("role").$type<AnyUserRole>().notNull().default("COMMON"),
  phone: text("phone"),
  dateOfBirth: integer("date_of_birth", { mode: "timestamp_ms" }),
  image: text("image"),
  banned: integer("banned", { mode: "boolean" }).notNull().default(false),
  isAnonymous: integer("is_anonymous", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  activeOrganizationId: text("active_organization_id"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});
