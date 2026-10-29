// 計算ロジックと初期値（フロントとAPIで共用）

export const SGA = [
  ["yakuin", "役員報酬", 4800000],
  ["kyuyo", "給料手当", 3600000],
  ["chidai", "地代家賃", 1200000],
  ["koukoku", "広告宣伝費", 600000],
  ["ryohi", "旅費交通費", 600000],
  ["tsushin", "通信費", 240000],
  ["shiharai", "支払手数料", 300000],
  ["shomo", "消耗品費", 120000],
  ["genka", "減価償却費", 0],
  ["zappi", "雑費", 200000],
];

export function defSga() {
  const o = {};
  for (const [k, , v] of SGA) o[k] = v;
  return o;
}

export function makeScenario(name, price, units, rate) {
  return { name, price, units, rate, cogs: 20000, sga: defSga() };
}

export function defaultData() {
  return {
    shared: true,
    welfare: 15,
    tax: 30,
    sc: [
      makeScenario("手数料10%", 2000000, 120, 10),
      makeScenario("手数料20%", 2000000, 120, 20),
      makeScenario("10%・台数増", 2000000, 200, 10),
      makeScenario("20%・台数減", 2000000, 80, 20),
    ],
  };
}

export const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("ja-JP");

export function normalize(d) {
  const base = defaultData();
  if (!d || !Array.isArray(d.sc) || d.sc.length === 0) return base;
  return {
    shared: d.shared !== false,
    welfare: num(d.welfare ?? base.welfare),
    tax: num(d.tax ?? base.tax),
    sc: d.sc.map((c, i) => ({
      name: typeof c.name === "string" ? c.name : `パターン${i + 1}`,
      price: num(c.price),
      units: num(c.units),
      rate: num(c.rate),
      cogs: num(c.cogs),
      sga: { ...defSga(), ...(c.sga || {}) },
    })),
  };
}

export function calc(c, d) {
  const sales = (c.price * c.units * c.rate) / 100;
  const cogsT = c.cogs * c.units;
  const gross = sales - cogsT;
  let sum = 0;
  for (const [k] of SGA) sum += num(c.sga[k]);
  const welfare = ((num(c.sga.yakuin) + num(c.sga.kyuyo)) * d.welfare) / 100;
  const sgaT = sum + welfare;
  const op = gross - sgaT;
  const tax = op > 0 ? (op * d.tax) / 100 : 0;
  const feePer = (c.price * c.rate) / 100;
  const margin = feePer - c.cogs;
  const bep = margin > 0 ? Math.ceil(sgaT / margin) : null;
  return {
    sales,
    cogsT,
    gross,
    welfare,
    sgaT,
    op,
    opRate: sales ? op / sales : 0,
    opM: op / 12,
    tax,
    net: op - tax,
    feePer,
    opPer: c.units ? op / c.units : 0,
    bep,
    bepM: bep == null ? null : Math.ceil(bep / 12),
  };
}
