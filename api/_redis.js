import { Redis } from "@upstash/redis";

let client = null;

// Upstash直結(UPSTASH_*) と Vercel Marketplace経由(KV_*) のどちらの環境変数にも対応
export function getRedis() {
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    throw new Error("Upstash Redisの環境変数が設定されていません");
  }
  client = new Redis({ url, token });
  return client;
}
