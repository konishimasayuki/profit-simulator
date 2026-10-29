import { useMemo, useState } from "react";
import { SGA, calc, defaultData, fmt, num } from "../shared/calc.js";

const ROWS = [
  { t: "sec", l: "前提条件" },
  { t: "num", k: "price", l: "本体価格（1台）", u: "円" },
  { t: "num", k: "units", l: "年間総台数", u: "台" },
  { t: "rate", k: "rate", l: "代行手数料率" },
  {
    t: "num",
    k: "cogs",
    l: "1台あたり直接原価",
    u: "円",
    h: "陸送・検査・書類など",
  },
  { t: "sec", l: "損益計算（年間）" },
  { t: "calc", k: "sales", l: "売上高（代行手数料）", b: 1 },
  { t: "calc", k: "cogsT", l: "売上原価" },
  { t: "calc", k: "gross", l: "売上総利益", b: 1 },
  { t: "sec", l: "販売費及び一般管理費（年間）" },
  ...SGA.map(([k, l]) => ({ t: "sga", k, l })),
  { t: "calc", k: "welfare", l: "法定福利費", h: "役員報酬＋給料 × 率" },
  { t: "calc", k: "sgaT", l: "販管費合計", b: 1 },
  { t: "sec", l: "利益" },
  { t: "calc", k: "op", l: "営業利益", b: 2 },
  { t: "calc", k: "opRate", l: "営業利益率" },
  { t: "calc", k: "opM", l: "月平均営業利益" },
  { t: "calc", k: "tax", l: "法人税等（概算）" },
  { t: "calc", k: "net", l: "税引後利益", b: 2 },
  { t: "sec", l: "指標" },
  { t: "calc", k: "feePer", l: "1台あたり手数料" },
  { t: "calc", k: "opPer", l: "1台あたり営業利益" },
  { t: "calc", k: "bep", l: "損益分岐台数（年間）" },
  { t: "calc", k: "bepM", l: "損益分岐台数（月）" },
];

function NumInput({ value, onChange, decimal, label, className = "n" }) {
  const [focus, setFocus] = useState(false);
  const [text, setText] = useState("");
  const shown = decimal ? String(value) : fmt(value);
  return (
    <input
      className={className}
      inputMode={decimal ? "decimal" : "numeric"}
      aria-label={label}
      value={focus ? text : shown}
      onFocus={() => {
        setFocus(true);
        setText(shown);
      }}
      onBlur={() => setFocus(false)}
      onChange={(e) => {
        setText(e.target.value);
        onChange(num(e.target.value));
      }}
    />
  );
}

function showCalc(k, v) {
  if (k === "opRate") return `${(v * 100).toFixed(1)}%`;
  if (k === "bep" || k === "bepM") return v == null ? "—" : `${fmt(v)}台`;
  return fmt(v);
}

export default function Simulator({ data, onChange }) {
  const results = useMemo(() => data.sc.map((c) => calc(c, data)), [data]);

  const best = useMemo(() => {
    if (data.sc.length < 2) return -1;
    let bi = -1;
    let bv = Number.NEGATIVE_INFINITY;
    results.forEach((r, i) => {
      if (r.net > bv) {
        bv = r.net;
        bi = i;
      }
    });
    return bi;
  }, [results, data.sc.length]);

  const setSc = (i, patch) =>
    onChange({
      ...data,
      sc: data.sc.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    });

  const setSga = (i, k, v) =>
    onChange({
      ...data,
      sc: data.sc.map((c, j) =>
        data.shared || j === i ? { ...c, sga: { ...c.sga, [k]: v } } : c,
      ),
    });

  const dup = (i) => {
    const c = structuredClone(data.sc[i]);
    c.name += "（複製）";
    const sc = [...data.sc];
    sc.splice(i + 1, 0, c);
    onChange({ ...data, sc });
  };

  const del = (i) => {
    if (data.sc.length < 2) return;
    onChange({ ...data, sc: data.sc.filter((_, j) => j !== i) });
  };

  const add = () => {
    const c = structuredClone(data.sc[data.sc.length - 1]);
    c.name = `パターン${data.sc.length + 1}`;
    onChange({ ...data, sc: [...data.sc, c] });
  };

  const toggleShared = (checked) =>
    onChange({
      ...data,
      shared: checked,
      sc: checked
        ? data.sc.map((c) => ({ ...c, sga: { ...data.sc[0].sga } }))
        : data.sc,
    });

  const reset = () => {
    if (window.confirm("このシミュレーションを初期値に戻しますか？"))
      onChange(defaultData());
  };

  // 棒グラフ
  const ops = results.map((r) => r.op);
  const max = Math.max(0, ...ops);
  const min = Math.min(0, ...ops);
  const span = max - min || 1;
  const zero = (-min / span) * 100;

  const cols = data.sc.length;

  return (
    <>
      <div className="panel">
        <h2>営業利益の比較</h2>
        <div className="bars">
          {results.map((r, i) => {
            const w = (Math.abs(r.op) / span) * 100;
            const left = r.op >= 0 ? zero : zero - w;
            return (
              <div className="row" key={i}>
                <div className="nm">{data.sc[i].name}</div>
                <div className="track">
                  {min < 0 && (
                    <div className="zero" style={{ left: `${zero}%` }} />
                  )}
                  <div
                    className={`bar ${r.op < 0 ? "neg" : ""}`}
                    style={{ left: `${left}%`, width: `${w}%` }}
                  />
                </div>
                <div className={`val ${r.op < 0 ? "neg" : ""}`}>
                  {fmt(r.op)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="legend">
          税引後利益が最も大きいパターンを表の上で色付けしています。
        </div>
      </div>

      <div className="panel">
        <div className="ctrl">
          <label>
            <input
              type="checkbox"
              checked={data.shared}
              onChange={(e) => toggleShared(e.target.checked)}
            />
            販管費を全パターン共通にする
          </label>
          <label>
            法定福利費率
            <NumInput
              className="small"
              decimal
              label="法定福利費率"
              value={data.welfare}
              onChange={(v) => onChange({ ...data, welfare: v })}
            />
            %
          </label>
          <label>
            法人税等の実効税率
            <NumInput
              className="small"
              decimal
              label="実効税率"
              value={data.tax}
              onChange={(v) => onChange({ ...data, tax: v })}
            />
            %
          </label>
          <span className="sp" />
          <button type="button" className="btn ghost" onClick={reset}>
            初期値に戻す
          </button>
          <button type="button" className="btn" onClick={add}>
            パターンを追加
          </button>
        </div>
      </div>

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th className="lab">
                項目<small>単位：円（税抜）</small>
              </th>
              {data.sc.map((c, i) => (
                <th key={i} className={`col ${i === best ? "best" : ""}`}>
                  <span className="tag">
                    {i === best ? "最も利益が大きい" : ""}
                  </span>
                  <input
                    className="nm"
                    aria-label="パターン名"
                    value={c.name}
                    onChange={(e) => setSc(i, { name: e.target.value })}
                  />
                  <div className="ops">
                    <button type="button" onClick={() => dup(i)}>
                      複製
                    </button>
                    {cols > 1 && (
                      <button type="button" onClick={() => del(i)}>
                        削除
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, ri) => {
              if (r.t === "sec") {
                return (
                  <tr key={ri} className="sec">
                    <th className="lab">{r.l}</th>
                    <td colSpan={cols} />
                  </tr>
                );
              }
              return (
                <tr key={ri} className={r.b ? `b${r.b}` : ""}>
                  <th className="lab">
                    {r.l}
                    {r.h && <small>{r.h}</small>}
                  </th>
                  {data.sc.map((c, i) => {
                    if (r.t === "num") {
                      return (
                        <td key={i}>
                          <NumInput
                            label={r.l}
                            value={c[r.k]}
                            onChange={(v) => setSc(i, { [r.k]: v })}
                          />
                          <span className="u">{r.u}</span>
                        </td>
                      );
                    }
                    if (r.t === "rate") {
                      return (
                        <td key={i}>
                          <NumInput
                            decimal
                            label={r.l}
                            value={c.rate}
                            onChange={(v) => setSc(i, { rate: v })}
                          />
                          <span className="u">%</span>
                          <div className="chips">
                            {[10, 20].map((v) => (
                              <button
                                type="button"
                                key={v}
                                className={c.rate === v ? "on" : ""}
                                onClick={() => setSc(i, { rate: v })}
                              >
                                {v}%
                              </button>
                            ))}
                          </div>
                        </td>
                      );
                    }
                    if (r.t === "sga") {
                      return (
                        <td key={i}>
                          <NumInput
                            label={r.l}
                            value={c.sga[r.k]}
                            onChange={(v) => setSga(i, r.k, v)}
                          />
                          <span className="u">円</span>
                        </td>
                      );
                    }
                    const v = results[i][r.k];
                    return (
                      <td
                        key={i}
                        className={`c ${typeof v === "number" && v < 0 ? "neg" : ""}`}
                      >
                        {showCalc(r.k, v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="notes">
        <p>
          売上高 ＝ 本体価格 × 総台数 ×
          手数料率（仕入れ代行手数料のみを売上計上。本体代金は預り・立替扱い）
        </p>
        <p>
          売上原価 ＝ 1台あたり直接原価 ×
          総台数（陸送・検査・書類など台数に比例する経費）
        </p>
        <p>
          法定福利費 ＝（役員報酬＋給料手当）× 法定福利費率／損益分岐台数 ＝
          販管費合計 ÷（1台あたり手数料 − 1台あたり直接原価）
        </p>
        <p>法人税等は営業利益に実効税率を掛けた概算です。</p>
      </div>
    </>
  );
}
