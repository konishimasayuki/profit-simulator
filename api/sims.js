import { randomUUID } from "node:crypto";
import { defaultData, normalize } from "../shared/calc.js";
import { checkAuth } from "./_auth.js";
import { getRedis } from "./_redis.js";

const IDS = "ps:ids";
const key = (id) => `ps:sim:${id}`;
const MAX_BYTES = 200000;

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

function cleanName(name, fallback) {
  const s = typeof name === "string" ? name.trim().slice(0, 60) : "";
  return s || fallback;
}

async function createSim(redis, name, data) {
  const now = Date.now();
  const sim = {
    id: randomUUID(),
    name,
    data: normalize(data),
    createdAt: now,
    updatedAt: now,
  };
  await redis.set(key(sim.id), sim);
  await redis.sadd(IDS, sim.id);
  return sim;
}

export default async function handler(req, res) {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: "パスコードが違います" });
  }

  let redis;
  try {
    redis = getRedis();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const id = typeof req.query.id === "string" ? req.query.id : "";

  try {
    // 一覧（空なら初期シミュレーションを自動作成）。一覧取得はMGETでまとめて読む
    if (req.method === "GET" && !id) {
      let ids = await redis.smembers(IDS);
      if (!ids.length) {
        const sim = await createSim(
          redis,
          "基本シミュレーション",
          defaultData(),
        );
        ids = [sim.id];
      }
      const vals = await redis.mget(...ids.map(key));
      const sims = vals
        .filter(Boolean)
        .map((v) => ({ id: v.id, name: v.name, updatedAt: v.updatedAt }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
      return res.status(200).json({ sims });
    }

    if (req.method === "GET") {
      const sim = await redis.get(key(id));
      if (!sim) return res.status(404).json({ error: "見つかりません" });
      return res.status(200).json(sim);
    }

    if (req.method === "POST") {
      const body = parseBody(req.body);
      if (JSON.stringify(body).length > MAX_BYTES) {
        return res.status(413).json({ error: "データが大きすぎます" });
      }
      const sim = await createSim(
        redis,
        cleanName(body.name, "新しいシミュレーション"),
        body.data || defaultData(),
      );
      return res.status(200).json(sim);
    }

    if (req.method === "PUT") {
      if (!id) return res.status(400).json({ error: "idが必要です" });
      const sim = await redis.get(key(id));
      if (!sim) return res.status(404).json({ error: "見つかりません" });
      const body = parseBody(req.body);
      if (JSON.stringify(body).length > MAX_BYTES) {
        return res.status(413).json({ error: "データが大きすぎます" });
      }
      if (typeof body.name === "string")
        sim.name = cleanName(body.name, sim.name);
      if (body.data) sim.data = normalize(body.data);
      sim.updatedAt = Date.now();
      await redis.set(key(id), sim);
      return res.status(200).json(sim);
    }

    if (req.method === "DELETE") {
      if (!id) return res.status(400).json({ error: "idが必要です" });
      await redis.del(key(id));
      await redis.srem(IDS, id);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return res.status(405).json({ error: "許可されていないメソッドです" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "サーバーエラー" });
  }
}
