import { useEffect, useMemo, useRef, useState } from "react";
import {
  MODELS,
  calcModel,
  defaultModel,
  fmt,
  num,
  sgaSummaries,
  sgaSummary,
  uid,
} from "../shared/calc.js";
import { PdfSheet, buildRows, exportPdf } from "./pdf.jsx";

const PROFIT_ROWS = [
  { k: "op", l: "営業利益", b: 2 },
  { k: "opRate", l: "営業利益率" },
  { k: "tax", l: "法人税等（概算）" },
  { k: "net", l: "税引後利益", b: 2 },
  { k: "bep", l: "損益分岐台数" },
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

function MemoCell({ value, onChange }) {
  return (
    <td className="memo">
      <input
        className="memo-in"
        aria-label="備考"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </td>
  );
}

function showCalc(k, v) {
  if (k === "opRate") return `${(v * 100).toFixed(1)}%`;
  if (k === "bep") return v == null ? "—" : `${fmt(v)}台`;
  return fmt(v);
}

const showVal = (v, r) => (r.dec ? String(v) : fmt(v));

export default function Simulator({ kind, data, onChange, title }) {
  const model = MODELS[kind];
  const [exporting, setExporting] = useState(false);
  const sheetRef = useRef(null);
  const perCol = !!model.sgaPerCol;
  const SL = useMemo(() => sgaSummaries(kind, data), [kind, data]);
  const results = useMemo(
    () => data.sc.map((c, i) => calcModel(kind, c, data, SL[i])),
    [kind, data, SL],
  );
  const cols = data.sc.length;

  const setSc = (i, patch) =>
    onChange({
      ...data,
      sc: data.sc.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    });
  const setMemo = (k, v) =>
    onChange({ ...data, memo: { ...data.memo, [k]: v } });
  const setItem = (idx, patch) =>
    onChange({
      ...data,
      sga: data.sga.map((it, j) => (j === idx ? { ...it, ...patch } : it)),
    });
  const setDetail = (idx, id, patch) =>
    setItem(idx, {
      details: data.sga[idx].details.map((x) =>
        x.id === id ? { ...x, ...patch } : x,
      ),
    });
  const addDetail = (idx) => {
    const it = data.sga[idx];
    const first = it.details.length === 0;
    const row = {
      id: uid(),
      name: "",
      amount: first ? it.amount : 0,
      memo: "",
    };
    setItem(idx, { open: true, details: [...it.details, row] });
  };
  const removeDetail = (idx, id) =>
    setItem(idx, { details: data.sga[idx].details.filter((x) => x.id !== id) });

  const dup = (i) => {
    const c = { ...data.sc[i], name: `${data.sc[i].name}（複製）` };
    const sc = [...data.sc];
    sc.splice(i + 1, 0, c);
    onChange({ ...data, sc });
  };
  const del = (i) => {
    if (cols < 2) return;
    let sga = data.sga;
    let sc = data.sc.filter((_, j) => j !== i);
    if (perCol && i === 0) {
      // 新しい左列の販管費を項目の金額に引き継ぐ
      const next = sgaSummary(data, data.sc[1], 1, true);
      sga = data.sga.map((it) =>
        it.details.length
          ? {
              ...it,
              details: it.details.map((x) => ({
                ...x,
                amount: next.vals[x.id],
              })),
            }
          : { ...it, amount: next.totals[it.key] },
      );
      const { sgaAmt, ...first } = sc[0];
      sc = [first, ...sc.slice(1)];
    }
    onChange({ ...data, sga, sc });
  };
  const add = () => {
    const c = { ...data.sc[cols - 1], name: `パターン${cols + 1}` };
    onChange({ ...data, sc: [...data.sc, c] });
  };
  const reset = () => {
    if (window.confirm(`${model.label}を初期値に戻しますか？`))
      onChange(defaultModel(kind));
  };

  useEffect(() => {
    if (!exporting) return;
    let alive = true;
    const run = async () => {
      try {
        await exportPdf(sheetRef.current, title);
      } catch {
        window.alert("PDFの作成に失敗しました");
      } finally {
        if (alive) setExporting(false);
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [exporting, title]);

  // 左列だけ入力、右列は同じ値を表示
  const sameCells = (text, input) => (
    <>
      {input}
      {data.sc.slice(1).map((_, i) => (
        <td key={i} className="same">
          {text}
        </td>
      ))}
    </>
  );

  const section = (label, key) => (
    <tr key={key} className="sec">
      <th className="lab">{label}</th>
      <td colSpan={cols + 1} />
    </tr>
  );

  const topRows = model.rows.map((r, ri) => {
    if (r.sec) return section(r.sec, `s${ri}`);
    let cells;
    if (r.t === "shared") {
      cells = sameCells(
        showVal(data[r.k], r),
        <td>
          <NumInput
            decimal={r.dec}
            label={r.l}
            value={data[r.k]}
            onChange={(v) => onChange({ ...data, [r.k]: v })}
          />
          <span className="u">{r.u}</span>
        </td>,
      );
    } else if (r.t === "each") {
      cells = data.sc.map((c, i) => (
        <td key={i}>
          <NumInput
            decimal={r.dec}
            label={r.l}
            value={c[r.k]}
            onChange={(v) => setSc(i, { [r.k]: v })}
          />
          <span className="u">{r.u}</span>
        </td>
      ));
    } else {
      cells = results.map((x, i) => (
        <td key={i} className={`c ${x[r.k] < 0 ? "neg" : ""}`}>
          {fmt(x[r.k])}
        </td>
      ));
    }
    return (
      <tr key={r.k} className={r.b ? `b${r.b}` : ""}>
        <th className="lab">{r.l}</th>
        {cells}
        <MemoCell value={data.memo[r.k]} onChange={(v) => setMemo(r.k, v)} />
      </tr>
    );
  });

  // 右列の販管費を上書き（オートリンク）
  const setColSga = (i, id, v) =>
    setSc(i, { sgaAmt: { ...(data.sc[i].sgaAmt || {}), [id]: v } });

  // 販管費の1行分のセル。perColなら全列入力、そうでなければ左列だけ入力
  const sgaCells = (id, leftAmount, setLeft, label, colValue) => {
    if (!perCol) {
      return sameCells(
        fmt(leftAmount),
        <td>
          <NumInput label={label} value={leftAmount} onChange={setLeft} />
          <span className="u">円</span>
        </td>,
      );
    }
    return data.sc.map((c, i) => {
      const follow = i > 0 && c.sgaAmt?.[id] == null;
      return (
        <td key={i}>
          <NumInput
            className={follow ? "n follow" : "n"}
            label={label}
            value={colValue(i)}
            onChange={(v) => (i === 0 ? setLeft(v) : setColSga(i, id, v))}
          />
          <span className="u">円</span>
        </td>
      );
    });
  };

  const sgaRows = [];
  data.sga.forEach((it, idx) => {
    const hasDetail = it.details.length > 0;
    let cells;
    if (hasDetail) {
      cells = SL.map((s, i) => (
        <td key={i} className={i === 0 || perCol ? "c total" : "same"}>
          {fmt(s.totals[it.key])}
        </td>
      ));
    } else {
      cells = sgaCells(
        it.key,
        it.amount,
        (v) => setItem(idx, { amount: v }),
        it.label,
        (i) => SL[i].totals[it.key],
      );
    }
    sgaRows.push(
      <tr key={`c-${it.key}`} className="cat">
        <th className="lab">
          <button
            type="button"
            className="fold"
            aria-expanded={it.open}
            onClick={() => setItem(idx, { open: !it.open })}
          >
            <span className="caret">{it.open ? "▾" : "▸"}</span>
            {it.label}
            {hasDetail && <span className="cnt">{it.details.length}</span>}
          </button>
        </th>
        {cells}
        <MemoCell value={it.memo} onChange={(v) => setItem(idx, { memo: v })} />
      </tr>,
    );
    if (it.open) {
      for (const x of it.details) {
        sgaRows.push(
          <tr key={`d-${x.id}`} className="detail">
            <th className="lab">
              <div className="dname">
                <input
                  aria-label="明細名"
                  placeholder="明細名"
                  value={x.name}
                  onChange={(e) =>
                    setDetail(idx, x.id, { name: e.target.value })
                  }
                />
                <button
                  type="button"
                  className="x"
                  aria-label="明細を削除"
                  onClick={() => removeDetail(idx, x.id)}
                >
                  ×
                </button>
              </div>
            </th>
            {sgaCells(
              x.id,
              x.amount,
              (v) => setDetail(idx, x.id, { amount: v }),
              x.name || "明細",
              (i) => SL[i].vals[x.id],
            )}
            <MemoCell
              value={x.memo}
              onChange={(v) => setDetail(idx, x.id, { memo: v })}
            />
          </tr>,
        );
      }
      sgaRows.push(
        <tr key={`a-${it.key}`} className="detail addrow">
          <th className="lab">
            <button
              type="button"
              className="addbtn"
              onClick={() => addDetail(idx)}
            >
              ＋ 明細を追加
            </button>
          </th>
          <td colSpan={cols + 1} />
        </tr>,
      );
    }
    if (it.key === "kyuyo") {
      sgaRows.push(
        <tr key="welfare" className="cat">
          <th className="lab">
            <span className="plain">法定福利費</span>
          </th>
          {SL.map((s, i) => (
            <td key={i} className={i === 0 || perCol ? "c" : "same"}>
              {fmt(s.welfare)}
            </td>
          ))}
          <MemoCell
            value={data.memo.welfare}
            onChange={(v) => setMemo("welfare", v)}
          />
        </tr>,
      );
    }
  });

  return (
    <>
      <div className="panel">
        <div className="ctrl">
          <button
            type="button"
            className="btn"
            disabled={exporting}
            onClick={() => setExporting(true)}
          >
            {exporting ? "PDF作成中…" : "PDF出力（A4横）"}
          </button>
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
                項目<small>月額・円（税抜）</small>
              </th>
              {data.sc.map((c, i) => (
                <th key={i} className="col">
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
              <th className="memo-h">備考</th>
            </tr>
          </thead>
          <tbody>
            {topRows}

            {section("販売費及び一般管理費", "sga")}
            {sgaRows}
            <tr className="b1">
              <th className="lab">販管費合計</th>
              {SL.map((x, i) => (
                <td key={i} className="c">
                  {fmt(x.sgaT)}
                </td>
              ))}
              <MemoCell
                value={data.memo.sgaT}
                onChange={(v) => setMemo("sgaT", v)}
              />
            </tr>

            {section("利益", "profit")}
            {PROFIT_ROWS.map((r) => (
              <tr key={r.k} className={r.b ? `b${r.b}` : ""}>
                <th className="lab">{r.l}</th>
                {results.map((x, i) => (
                  <td key={i} className={`c ${x[r.k] < 0 ? "neg" : ""}`}>
                    {showCalc(r.k, x[r.k])}
                  </td>
                ))}
                <MemoCell
                  value={data.memo[r.k]}
                  onChange={(v) => setMemo(r.k, v)}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {exporting && (
        <PdfSheet
          title={title}
          data={data}
          rows={buildRows(kind, data, SL, results)}
          sheetRef={sheetRef}
        />
      )}

      <div className="panel foot">
        <div className="ctrl">
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
        </div>
      </div>
    </>
  );
}
