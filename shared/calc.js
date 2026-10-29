// 計算ロジックと初期値（フロントとAPIで共用）。金額はすべて月額・税抜

export const VERSION = 2;

export const SGA_DEFAULTS = [
  ["yakuin", "役員報酬", 400000],
  ["kyuyo", "給料手当", 300000],
  ["fukuri", "福利厚生費", 5000],
  ["gaichu", "外注費", 0],
  ["nizukuri", "荷造運賃", 0],
  ["koukoku", "広告宣伝費", 50000],
  ["kousai", "交際費", 20000],
  ["ryohi", "旅費交通費", 50000],
  ["tsushin", "通信費", 20000],
  ["suido", "水道光熱費", 10000],
  ["shomo", "消耗品費", 10000],
  ["shokai", "諸会費", 5000],
  ["sharyo", "車両費", 30000],
  ["chidai", "地代家賃", 100000],
  ["lease", "リース料", 0],
  ["hoken", "保険料", 10000],
  ["sozei", "租税公課", 5000],
  ["shiharai", "支払手数料", 25000],
  ["genka", "減価償却費", 0],
  ["zappi", "雑費", 15000],
];

export const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("ja-JP");

const str = (v, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");

export const uid = () => Math.random().toString(36).slice(2, 10);

export function defaultSga() {
  return SGA_DEFAULTS.map(([key, label, amount]) => ({
    key,
    label,
    amount,
    open: false,
    memo: "",
    details: [],
  }));
}

export function makeScenario(name, price, units, rate) {
  return { name, price, units, rate };
}

export function defaultData() {
  return {
    v: VERSION,
    welfare: 15,
    tax: 30,
    memo: {},
    sga: defaultSga(),
    sc: [
      makeScenario("手数料10%", 2000000, 10, 10),
      makeScenario("手数料20%", 2000000, 10, 20),
      makeScenario("10%・台数増", 2000000, 17, 10),
      makeScenario("20%・台数減", 2000000, 7, 20),
    ],
  };
}

// 保存済みデータに新しい既定項目が無ければ既定の並び順で補う
function mergeSga(list) {
  const byKey = new Map(list.map((it) => [it.key, it]));
  const defaults = defaultSga();
  const merged = defaults.map((def) => byKey.get(def.key) || def);
  const known = new Set(defaults.map((def) => def.key));
  for (const it of list) if (!known.has(it.key)) merged.push(it);
  return merged;
}

export function normalize(d) {
  if (
    !d ||
    d.v !== VERSION ||
    !Array.isArray(d.sc) ||
    !d.sc.length ||
    !Array.isArray(d.sga)
  ) {
    return defaultData();
  }
  const memo = {};
  if (d.memo && typeof d.memo === "object") {
    for (const [k, v] of Object.entries(d.memo)) memo[k] = str(v);
  }
  return {
    v: VERSION,
    welfare: num(d.welfare),
    tax: num(d.tax),
    memo,
    sga: mergeSga(d.sga).map((it) => ({
      key: str(it.key, 40) || uid(),
      label: str(it.label, 60),
      amount: num(it.amount),
      open: !!it.open,
      memo: str(it.memo),
      details: (Array.isArray(it.details) ? it.details : []).map((x) => ({
        id: str(x.id, 20) || uid(),
        name: str(x.name, 60),
        amount: num(x.amount),
        memo: str(x.memo),
      })),
    })),
    sc: d.sc.map((c, i) => ({
      name: str(c.name, 60) || `パターン${i + 1}`,
      price: num(c.price),
      units: num(c.units),
      rate: num(c.rate),
    })),
  };
}

export function itemTotal(it) {
  return it.details.length
    ? it.details.reduce((s, x) => s + num(x.amount), 0)
    : num(it.amount);
}

// 販管費は全パターン共通
export function sgaSummary(d) {
  const totals = {};
  let sum = 0;
  for (const it of d.sga) {
    const t = itemTotal(it);
    totals[it.key] = t;
    sum += t;
  }
  const welfare =
    (((totals.yakuin || 0) + (totals.kyuyo || 0)) * d.welfare) / 100;
  return { totals, welfare, sgaT: sum + welfare };
}

export function calc(c, d, s = sgaSummary(d)) {
  const sales = (c.price * c.units * c.rate) / 100;
  const op = sales - s.sgaT;
  const tax = op > 0 ? (op * d.tax) / 100 : 0;
  const feePer = (c.price * c.rate) / 100;
  return {
    sales,
    sgaT: s.sgaT,
    op,
    opRate: sales ? op / sales : 0,
    tax,
    net: op - tax,
    feePer,
    opPer: c.units ? op / c.units : 0,
    bep: feePer > 0 ? Math.ceil(s.sgaT / feePer) : null,
  };
}
