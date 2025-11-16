Best Practices: Using Redis with Hono and Bun

This document outlines the best practices for integrating a Redis database with a Hono web server running on the Bun JavaScript runtime. This combination is exceptionally powerful because it pairs Hono's lightweight speed with Bun's built-in, high-performance native Redis client.

Table of Contents

Core Principle: Use Bun's Native Redis Client

Connection Management

Integrating with Hono: The Middleware Pattern

Primary Use Case: The Cache-Aside Pattern

Key Naming and Data Serialization

Robust Error Handling

Advanced Use Case: Rate Limiting

Security and Configuration

Advanced Use Case: Real-Time Leaderboards

1. Core Principle: Use Bun's Native Redis Client

The most important practice is to use Bun's built-in Redis client.

Do not install or use node-redis or ioredis. Bun's native client (bun:redis) is written in highly-optimized native code (Zig) and is designed for maximum performance within the Bun runtime.

// Correct: Use the built-in client
import { redis } from 'bun';

// Incorrect: Do not use external packages
// import { createClient } from 'redis';
// import Redis from 'ioredis';


2. Connection Management

Manage your Redis client as a singleton (a single, shared instance) to be reused across your application. This avoids the overhead of creating new connections for every request.

Best Practice: Create a dedicated module to initialize and export your client.

src/lib/redis.ts

import { redis, RedisClient } as BunRedis from 'bun:redis';

let redisClient: BunRedis.RedisClient | null = null;

/**
 * Gets the shared Redis client instance, creating it if it doesn't exist.
 */
export async function getRedisClient(): Promise<BunRedis.RedisClient> {
  if (redisClient) {
    return redisClient;
  }

  // Uses REDIS_URL from .env or defaults to localhost
  const client = redis.createClient(Bun.env.REDIS_URL);
  
  try {
    await client.connect();
    console.log("Successfully connected to Redis.");
    redisClient = client;
    return redisClient;
  } catch (err) {
    console.error("Failed to connect to Redis:", err);
    // Exit or implement retry logic
    process.exit(1);
  }
}


Call await getRedisClient() once when your server starts to establish the connection.

Bun's client handles connection pooling and automatic reconnection internally.

3. Integrating with Hono: The Middleware Pattern

Do not access your singleton client directly in every route. Instead, use Hono's middleware to inject the client instance into the request Context. This makes your handlers cleaner, more testable, and type-safe.

src/index.ts

import { Hono } from 'hono';
import { RedisClient } from 'bun:redis';
import { getRedisClient } from './lib/redis';

// Define the type for Hono's context variables
type HonoVariables = {
  redis: RedisClient;
}

const app = new Hono<{ Variables: HonoVariables }>();

// 1. Initialize Redis on server start
const redis = await getRedisClient();

// 2. Create middleware to inject the client
app.use(async (c, next) => {
  c.set('redis', redis);
  await next();
});

// 3. Use the client in your route handler
app.get('/', (c) => {
  // Client is now available and type-safe
  const redisClient = c.var.redis;
  return c.text('Hello Hono with Redis!');
});

// Example of using it
app.get('/ping', async (c) => {
  const redisClient = c.var.redis;
  try {
    const reply = await redisClient.ping(); // PING
    return c.json({ reply }); // { "reply": "PONG" }
  } catch (err) {
    return c.json({ error: 'Redis command failed' }, 500);
  }
});

export default {
  port: 3000,
  fetch: app.fetch,
}


4. Primary Use Case: The Cache-Aside Pattern

The most common use for Redis is caching. The "cache-aside" pattern is a robust strategy:

Check Cache: Your app tries to fetch the data from Redis.

Cache Hit: If found, return the data from Redis immediately.

Cache Miss: If not found, fetch the data from the primary database (e.g., Postgres, SQLite).

Set Cache: Store the data from the database in Redis before returning it, so it's available for the next request.

Best Practice: Always set an expiration (TTL) on your cache keys. This prevents stale data. Use the SETEX command (SET with EXpiration) as it's an atomic operation.

Example: Caching Route

// ... (Hono setup from above) ...

// A mock database function
async function getExpensiveDataFromDB(id: string): Promise<object> {
  console.log("SIMULATING SLOW DB CALL...");
  await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5s delay
  return { id, name: `User ${id}`, fetchedAt: new Date().toISOString() };
}

app.get('/users/:id', async (c) => {
  const { id } = c.req.param();
  const redis = c.var.redis;
  const cacheKey = `user:${id}`;
  const CACHE_TTL_SECONDS = 60; // Cache for 60 seconds

  try {
    // 1. Check Cache
    const cachedData = await redis.get(cacheKey);

    if (cachedData) {
      // 2. Cache Hit
      console.log(`HIT: Serving user ${id} from cache`);
      // Don't forget to parse the stored JSON
      return c.json({ source: 'cache', data: JSON.parse(cachedData) });
    }

    // 3. Cache Miss
    console.log(`MISS: Fetching user ${id} from DB`);
    const newData = await getExpensiveDataFromDB(id);

    // 4. Set Cache
    // Use JSON.stringify for objects/arrays
    // Use SETEX to set key, expiration, and value atomically
    await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(newData));

    return c.json({ source: 'database', data: newData });

  } catch (err) {
    // See "Error Handling" section
    console.error(`Error during cache/DB lookup for user ${id}:`, err);
    // "Fail open" - if cache fails, try to serve from DB anyway
    try {
      const newData = await getExpensiveDataFromDB(id);
      return c.json({ source: 'database_fallback', data: newData });
    } catch (dbErr) {
      return c.json({ error: 'Both cache and database failed' }, 500);
    }
  }
});


5. Key Naming and Data Serialization

Key Naming

Use a consistent naming convention to avoid collisions and make debugging easier. A common pattern is object:id:field.

Good: user:123, post:456:comments, session:abcxyz, leaderboard:daily

Bad: 123, user123, comments-for-post-456

Data Serialization

Redis stores strings. You must serialize complex data (objects, arrays) before storing and parse them after retrieving.

Store: JSON.stringify(myObject)

Retrieve: JSON.parse(cachedString)

For very high-performance applications, consider using a faster binary format like MessagePack, but JSON is the standard for most use cases.

6. Robust Error Handling

Your application must not crash if Redis is unavailable.

Best Practice: Wrap all Redis calls (get, setex, etc.) in try...catch blocks.

For caching, implement a "fail open" strategy. If a cache read or write fails, log the error and proceed to fetch the data from the primary database. This ensures your application remains available, albeit slower, when the cache is down. The code in section 4 demonstrates this pattern.

7. Advanced Use Case: Rate Limiting

Redis is perfect for rate limiting due to its atomic INCR command.

Example: Rate Limiting Middleware

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 100;

app.use('/api/*', async (c, next) => {
  const redis = c.var.redis;
  // Use IP, API key, or user ID as the identifier
  const ip = c.req.header('x-forwarded-for') || 'unknown';
  const key = `rate-limit:${ip}:${c.req.path}`;
  
  let count: number;
  
  try {
    // INCR is atomic. It increments the key and returns the new value.
    count = await redis.incr(key);

    // If it's a new key, set its expiration
    if (count === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
    }
  } catch (err) {
    // If Redis fails, "fail open" and let the request through
    console.error("Rate limiter Redis error:", err);
    await next();
    return;
  }

  if (count > RATE_LIMIT_MAX_REQUESTS) {
    return c.json({ error: 'Too many requests' }, 429);
  }

  await next();
});


8. Security and Configuration

Use Environment Variables: Never hardcode your Redis URL. Use Bun.env to load it from the environment.

.env.local: REDIS_URL="redis://localhost:6379"

Production: REDIS_URL="redis://:your-password@prod-host:port"

Redis Passwords: Always secure your production Redis instance with a strong password. Bun's client supports the redis://:password@host:port URL format.

Firewall: Configure your firewall to only allow connections to your Redis port from your application servers. Do not expose Redis to the public internet.

9. Advanced Use Case: Real-Time Leaderboards

Redis is the industry standard for leaderboards due to its Sorted Set data structure (ZSET). A sorted set is a collection of unique members, each associated with a score. The set is automatically kept sorted by score, making reads for "top N" users extremely fast.

Core Redis Commands:

ZADD key INCR score member: Atomically increments the score for a member. If the member doesn't exist, it's added with the new score. This is the only command you need for updating scores.

ZREVRANGE key start stop [WITHSCORES]: Gets a range of members from the set, ordered from highest score to lowest (reversed). This is your main query for fetching the top 10.

ZREVRANK key member: Gets the 0-based rank of a specific member, ordered from highest score to lowest.

Example: Leaderboard API

Here is how you would build Hono endpoints to update and fetch a leaderboard.

// ... (Hono setup with 'redis' in context) ...

const LEADERBOARD_KEY = 'leaderboard:global';

/**
 * Endpoint to submit a new score for a user.
 * This will atomically increment their total score.
 */
app.post('/leaderboard/submit', async (c) => {
  const { userId, score } = await c.req.json<{ userId: string, score: number }>();
  const redis = c.var.redis;

  if (!userId || score == null) {
    return c.json({ error: 'userId and score are required' }, 400);
  }

  try {
    // ZADD with INCR atomically adds the score.
    // 'newScore' will be the user's total score after the update.
    const newScore = await redis.zadd(LEADERBOARD_KEY, score, userId, {
      incr: true,
    });
    
    return c.json({ userId, newScore });
  } catch (err) {
    console.error("Leaderboard submit error:", err);
    return c.json({ error: 'Could not update score' }, 500);
  }
});

/**
 * Endpoint to fetch the top 10 players.
 */
app.get('/leaderboard/top10', async (c) => {
  const redis = c.var.redis;

  try {
    // Get top 10 (indices 0 through 9)
    // Ordered from highest score to lowest (ZREVRANGE)
    // WITHSCORES returns both the member (userId) and their score
    const top10 = await redis.zrevrange(LEADERBOARD_KEY, 0, 9, {
      withScores: true,
    });
    
    // The result is an array of [member, score, member, score, ...]
    // We can parse this into a cleaner array of objects.
    const leaderboard = [];
    for (let i = 0; i < top10.length; i += 2) {
      leaderboard.push({
        userId: top10[i],
        score: parseInt(top10[i + 1], 10),
        rank: (i / 2) + 1, // 1-based rank
      });
    }
    
    return c.json(leaderboard);
  } catch (err) {
    console.error("Leaderboard fetch error:", err);
    return c.json({ error: 'Could not fetch leaderboard' }, 500);
  }
});


Making it "Real-Time"

The "real-time" aspect comes from how clients are notified of changes.

Simple Polling (Good): A frontend client can simply call the /leaderboard/top10 endpoint every 5-10 seconds. This is the easiest to implement and is often "real-time enough."

WebSockets + Pub/Sub (Best): For true instant updates, use WebSockets.

Client: Connects to your Hono server via a WebSocket.

Score Update: When the /leaderboard/submit endpoint is called, after the redis.zadd command, it also publishes a message using redis.publish('leaderboard-updated', 'true').

Server (WebSocket): Your Hono WebSocket handler (using hono/bun) subscribes to the 'leaderboard-updated' channel using redis.subscribe().

Push: When it receives a message, it immediately re-fetches the top 10 (using zrevrange) and pushes the new JSON data down the WebSocket to all connected clients.

This pattern leverages Bun's built-in support for both Redis Pub/Sub and WebSockets, making it a highly efficient solution.