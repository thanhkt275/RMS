import { RedisClient } from "bun";

let redisClient: RedisClient | null = null;

export function resolveRedisUrl(): string {
  const rawUrl = process.env.REDIS_URL?.trim();
  const baseUrl = rawUrl && rawUrl.length > 0 ? rawUrl : "localhost:6379";
  const urlWithScheme = baseUrl.includes("://")
    ? baseUrl
    : `redis://${baseUrl}`;

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(urlWithScheme);
  } catch (error) {
    throw new Error(`Invalid REDIS_URL value: ${urlWithScheme}`);
  }

  const username = process.env.REDIS_USERNAME?.trim();
  const password = process.env.REDIS_PASSWORD?.trim();

  if (username) {
    parsedUrl.username = username;
  }

  if (password) {
    parsedUrl.password = password;
  }

  const finalUrl = parsedUrl.toString();
  return finalUrl.endsWith("/") ? finalUrl.slice(0, -1) : finalUrl;
}

export async function getRedisClient(): Promise<RedisClient> {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = resolveRedisUrl();
  const client = new RedisClient(redisUrl);

  try {
    await client.connect();
    console.log("Connected to Redis at", new URL(redisUrl).host);
    redisClient = client;
    return client;
  } catch (error) {
    console.error("Failed to connect to Redis:", error);
    throw error;
  }
}

export async function createRedisSubscriber(): Promise<RedisClient> {
  const redisUrl = resolveRedisUrl();
  const client = new RedisClient(redisUrl);
  await client.connect();
  return client;
}
