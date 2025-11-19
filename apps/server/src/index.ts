import "dotenv/config";
import type { RedisClient } from "bun";
import { Hono } from "hono";
import { getRedisClient } from "./lib/redis";
import { corsMiddleware } from "./middleware/cors";
import { logger } from "./middleware/logger";
import authRoute from "./routes/auth";
import { filesRoute } from "./routes/files";
import { scoreProfilesRoute } from "./routes/score-profiles";
import teamsRoute from "./routes/teams";
import { tournamentsRoute } from "./routes/tournaments/index";

type ServerVariables = {
  redis: RedisClient;
};

const redisClient = await getRedisClient();

const app = new Hono<{ Variables: ServerVariables }>();

// Apply middleware
app.use(logger);
app.use("/*", corsMiddleware);
app.use(async (c, next) => {
  c.set("redis", redisClient);
  await next();
});

// Mount routes
app.route("/api", authRoute);
app.route("/api/teams", teamsRoute);
app.route("/api/files", filesRoute);
app.route("/api/score-profiles", scoreProfilesRoute);
app.route("/api/tournaments", tournamentsRoute);
// Matches route is part of tournaments route
app.route("/api", tournamentsRoute);

app.get("/api/redis/ping", async (c) => {
  try {
    const reply = await c.var.redis.ping();
    return c.json({ status: "ok", redis: reply });
  } catch (error) {
    console.error("Redis ping failed:", error);
    return c.json({ error: "Redis is unavailable" }, 503);
  }
});

// Health check
app.get("/", (c) => c.text("OK"));

export default app;
