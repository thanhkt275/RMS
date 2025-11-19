import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({
  path: "../../apps/server/.env",
});

const databaseUrl = process.env.DATABASE_URL || "";
const databaseAuthToken = process.env.DATABASE_AUTH_TOKEN;

export default defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "turso",
  dbCredentials: databaseAuthToken
    ? {
        url: databaseUrl,
        authToken: databaseAuthToken,
      }
    : {
        url: databaseUrl,
      },
});
