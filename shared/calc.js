// 計算ロジックと初期値（フロントとAPIで共用）。金額はすべて月額・税抜

export const VERSION = 3;

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

// 保存済みデータに新しい既定項目が無ければ既定の並び順で補う
function mergeSga(list) {
  const byKey = new Map(list.map((it) => [it.key, it]));
  const defaults = defaultSga();
  const merged = defaults.map((def) => byKey.get(def.key) || def);
  const known = new Set(defaults.map((def) => def.key));
  for (const it of list) if (!known.has(it.key)) merged.push(it);
  return merged;
}

export function itemTotal(it) {
  return it.details.length
    ? it.details.reduce((s, x) => s + num(x.amount), 0)
    : num(it.amount);
}

// 列ごとの販管費の値。左列（idx=0）は項目の金額、右列は上書きがあればその値、なければ左列と同じ
export function sgaValue(c, idx, id, leftAmount, perCol) {
  if (!perCol || idx === 0 || !c?.sgaAmt) return num(leftAmount);
  const v = c.sgaAmt[id];
  return v == null ? num(leftAmount) : num(v);
}

export function sgaSummary(d, c = null, idx = 0, perCol = false) {
  const totals = {};
  const vals = {};
  let sum = 0;
  for (const it of d.sga) {
    let t;
    if (it.details.length) {
      t = 0;
      for (const x of it.details) {
        const v = sgaValue(c, idx, x.id, x.amount, perCol);
        vals[x.id] = v;
        t += v;
      }
    } else {
      t = sgaValue(c, idx, it.key, it.amount, perCol);
    }
    totals[it.key] = t;
    sum += t;
  }
  const welfare =
    (((totals.yakuin || 0) + (totals.kyuyo || 0)) * d.welfare) / 100;
  return { totals, vals, welfare, sgaT: sum + welfare };
}

// 列ごとの販管費集計
export function sgaSummaries(kind, d) {
  const perCol = !!MODELS[kind].sgaPerCol;
  return d.sc.map((c, i) => sgaSummary(d, c, i, perCol));
}

function common(op, gross, sales, d, bep) {
  const tax = op > 0 ? (op * d.tax) / 100 : 0;
  return {
    op,
    opRate: sales ? op / sales : 0,
    tax,
    net: op - tax,
    bep,
    gross,
  };
}

// エンジン：仕入れ代行。売上＝本体価格×台数×代行手数料率＋整備粗利
function calcEngine(c, d, s) {
  const sales = (d.price * c.units * c.rate) / 100;
  const seibi = num(d.seibi);
  const gross = sales + seibi;
  const feePer = (d.price * c.rate) / 100;
  const bep =
    feePer > 0 ? Math.max(0, Math.ceil((s.sgaT - seibi) / feePer)) : null;
  return {
    sales,
    seibi,
    ...common(gross - s.sgaT, gross, gross, d, bep),
  };
}

// オートリンク：車販売。仕入原価＝本体価格×(1＋仕入手数料率)、販売価格＝仕入原価÷(1−利益率)
function calcAutolink(c, d, s) {
  const costPer = d.price * (1 + d.fee / 100);
  const pricePer = c.margin < 100 ? costPer / (1 - c.margin / 100) : 0;
  const grossPer = pricePer - costPer;
  const sales = pricePer * c.units;
  const cogs = costPer * c.units;
  const gross = sales - cogs;
  const bep = grossPer > 0 ? Math.ceil(s.sgaT / grossPer) : null;
  return {
    costPer,
    pricePer,
    sales,
    cogs,
    ...common(gross - s.sgaT, gross, sales, d, bep),
  };
}

// 行定義  shared:左列だけ入力 / each:列ごとに入力 / calc:計算結果
export const MODELS = {
  engine: {
    label: "エンジン",
    shared: { price: 2000000, seibi: 0 },
    each: { units: 10, rate: 10 },
    scenarios: [
      ["手数料10%", { units: 10, rate: 10 }],
      ["手数料20%", { units: 10, rate: 20 }],
      ["10%・台数増", { units: 17, rate: 10 }],
      ["20%・台数減", { units: 7, rate: 20 }],
    ],
    rows: [
      { sec: "前提条件" },
      { t: "shared", k: "price", l: "本体価格（1台）", u: "円" },
      { t: "each", k: "units", l: "月間台数", u: "台" },
      { t: "each", k: "rate", l: "代行手数料率", u: "%", dec: true },
      { sec: "売上" },
      { t: "calc", k: "sales", l: "売上高（代行手数料）", b: 1 },
      { t: "shared", k: "seibi", l: "整備粗利", u: "円" },
      { t: "calc", k: "gross", l: "売上総利益", b: 1 },
    ],
    calc: calcEngine,
  },
  autolink: {
    label: "オートリンク",
    sgaPerCol: true,
    shared: { price: 2000000, fee: 20 },
    each: { units: 5, margin: 15 },
    scenarios: [
      ["利益率10%", { units: 5, margin: 10 }],
      ["利益率15%", { units: 5, margin: 15 }],
      ["利益率20%", { units: 5, margin: 20 }],
      ["15%・台数増", { units: 8, margin: 15 }],
    ],
    rows: [
      { sec: "前提条件" },
      { t: "shared", k: "price", l: "本体価格（1台）", u: "円" },
      { t: "shared", k: "fee", l: "仕入手数料率", u: "%", dec: true },
      { t: "calc", k: "costPer", l: "1台あたり仕入原価" },
      { t: "each", k: "units", l: "月間台数", u: "台" },
      { t: "each", k: "margin", l: "利益率", u: "%", dec: true },
      { sec: "売上" },
      { t: "calc", k: "pricePer", l: "1台あたり販売価格" },
      { t: "calc", k: "sales", l: "売上高", b: 1 },
      { t: "calc", k: "cogs", l: "売上原価" },
      { t: "calc", k: "gross", l: "売上総利益", b: 1 },
    ],
    calc: calcAutolink,
  },
};

export const KINDS = Object.keys(MODELS);

export function defaultModel(kind) {
  const m = MODELS[kind];
  return {
    welfare: 15,
    tax: 30,
    ...m.shared,
    memo: {},
    sga: defaultSga(),
    sc: m.scenarios.map(([name, v]) => ({ name, ...v })),
  };
}

export function defaultData() {
  const d = { v: VERSION };
  for (const k of KINDS) d[k] = defaultModel(k);
  return d;
}

export function normalizeModel(kind, d) {
  const m = MODELS[kind];
  if (!d || !Array.isArray(d.sc) || !d.sc.length || !Array.isArray(d.sga)) {
    return defaultModel(kind);
  }
  const memo = {};
  if (d.memo && typeof d.memo === "object") {
    for (const [k, v] of Object.entries(d.memo)) memo[k] = str(v);
  }
  const out = {
    welfare: num(d.welfare ?? 15),
    tax: num(d.tax ?? 30),
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
  };
  for (const [k, def] of Object.entries(m.shared)) {
    out[k] = num(d[k] ?? d.sc[0]?.[k] ?? def);
  }
  out.sc = d.sc.map((c, i) => {
    const sc = { name: str(c.name, 60) || `パターン${i + 1}` };
    for (const [k, def] of Object.entries(m.each)) sc[k] = num(c[k] ?? def);
    if (m.sgaPerCol && c.sgaAmt && typeof c.sgaAmt === "object") {
      sc.sgaAmt = {};
      for (const [k, v] of Object.entries(c.sgaAmt)) {
        if (v != null) sc.sgaAmt[str(k, 40)] = num(v);
      }
    }
    return sc;
  });
  return out;
}

export function normalize(d) {
  if (d && d.v === VERSION) {
    const out = { v: VERSION };
    for (const k of KINDS) out[k] = normalizeModel(k, d[k]);
    return out;
  }
  // 旧形式（エンジンのみ）からの移行
  const out = defaultData();
  if (d && d.v === 2) out.engine = normalizeModel("engine", d);
  return out;
}

export function calcModel(kind, c, d, s) {
  return MODELS[kind].calc(c, d, s);
}
