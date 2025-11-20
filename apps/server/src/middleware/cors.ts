import type { Context } from "hono";
import { cors } from "hono/cors";

const rawOrigins =
  process.env.CORS_ORIGIN?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
const allowAnyOrigin = rawOrigins.length === 0;

const resolveOrigin = allowAnyOrigin
  ? "*"
  : (_origin: string, ctx: Context) => {
      const inboundOrigin = ctx.req.header("origin");
      return inboundOrigin && rawOrigins.includes(inboundOrigin)
        ? inboundOrigin
        : undefined;
    };

export const corsMiddleware = cors({
  origin: resolveOrigin,
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});
