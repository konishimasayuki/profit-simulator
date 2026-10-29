let passcode = "";

export function setPasscode(p) {
  passcode = p || "";
}

async function req(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "x-passcode": passcode },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) {
    const err = new Error("unauthorized");
    err.code = 401;
    throw err;
  }
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || `通信エラー (${r.status})`);
  return json;
}

export const listSims = () => req("GET", "/api/sims");
export const getSim = (id) =>
  req("GET", `/api/sims?id=${encodeURIComponent(id)}`);
export const createSim = (name, data) =>
  req("POST", "/api/sims", { name, data });
export const updateSim = (id, patch) =>
  req("PUT", `/api/sims?id=${encodeURIComponent(id)}`, patch);
export const deleteSim = (id) =>
  req("DELETE", `/api/sims?id=${encodeURIComponent(id)}`);
