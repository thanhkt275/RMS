import { cors } from "hono/cors";

export const corsMiddleware = cors({
  origin: process.env.CORS_ORIGIN || "",
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});
