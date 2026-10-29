import { MODELS, fmt } from "../shared/calc.js";

// PDF用の行データ（販管費は0円の科目を省略）
export function buildRows(kind, data, SL, results) {
  const same = (v) => data.sc.map(() => v);
  const unit = (v, r) => {
    if (r.u === "台") return `${fmt(v)}台`;
    if (r.u === "%") return `${v}%`;
    return fmt(v);
  };
  const rows = [];
  for (const r of MODELS[kind].rows) {
    if (r.sec) {
      rows.push({ sec: r.sec });
    } else if (r.t === "shared") {
      rows.push({ l: r.l, v: same(unit(data[r.k], r)), m: data.memo[r.k] });
    } else if (r.t === "each") {
      rows.push({
        l: r.l,
        v: data.sc.map((c) => unit(c[r.k], r)),
        m: data.memo[r.k],
      });
    } else {
      rows.push({
        l: r.l,
        v: results.map((x) => fmt(x[r.k])),
        n: results.map((x) => x[r.k] < 0),
        m: data.memo[r.k],
        b: r.b,
      });
    }
  }
  rows.push({ sec: "販売費及び一般管理費" });
  const cols = (f) => SL.map((x) => fmt(f(x)));
  for (const it of data.sga) {
    const anyValue = SL.some((x) => x.totals[it.key] !== 0);
    if (anyValue || it.details.length) {
      rows.push({ l: it.label, v: cols((x) => x.totals[it.key]), m: it.memo });
      for (const d of it.details) {
        rows.push({
          l: d.name || "明細",
          v: cols((x) => x.vals[d.id]),
          m: d.memo,
          d: 1,
        });
      }
    }
    if (it.key === "kyuyo" && SL.some((x) => x.welfare !== 0)) {
      rows.push({
        l: "法定福利費",
        v: cols((x) => x.welfare),
        m: data.memo.welfare,
      });
    }
  }
  rows.push({
    l: "販管費合計",
    v: cols((x) => x.sgaT),
    m: data.memo.sgaT,
    b: 1,
  });
  rows.push({ sec: "利益" });
  const val = (k, f) => ({
    v: results.map((r) => f(r[k])),
    n: results.map((r) => typeof r[k] === "number" && r[k] < 0),
    m: data.memo[k],
  });
  rows.push({ l: "営業利益", b: 2, ...val("op", fmt) });
  rows.push({
    l: "営業利益率",
    ...val("opRate", (x) => `${(x * 100).toFixed(1)}%`),
  });
  rows.push({ l: "法人税等（概算）", ...val("tax", fmt) });
  rows.push({ l: "税引後利益", b: 2, ...val("net", fmt) });
  rows.push({
    l: "損益分岐台数",
    ...val("bep", (x) => (x == null ? "—" : `${fmt(x)}台`)),
  });
  return rows;
}

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export function PdfSheet({ title, data, rows, sheetRef }) {
  const cols = data.sc.length;
  return (
    <div className="pdf-host" aria-hidden="true">
      <div className="pdf-sheet" ref={sheetRef}>
        <div className="pdf-head">
          <h1>{title}</h1>
          <div>作成日 {today()}　月額・円（税抜）</div>
        </div>
        <table className="pdf-table">
          <colgroup>
            <col style={{ width: 190 }} />
            {data.sc.map((_, i) => (
              <col key={i} />
            ))}
            <col style={{ width: 210 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="pl">項目</th>
              {data.sc.map((c, i) => (
                <th key={i}>{c.name}</th>
              ))}
              <th className="pl">備考</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) =>
              r.sec ? (
                <tr key={ri} className="psec">
                  <td colSpan={cols + 2}>{r.sec}</td>
                </tr>
              ) : (
                <tr
                  key={ri}
                  className={[r.b ? `pb${r.b}` : "", r.d ? "pd" : ""].join(" ")}
                >
                  <td className="pl">{r.l}</td>
                  {r.v.map((v, i) => (
                    <td key={i} className={r.n?.[i] ? "pneg" : ""}>
                      {v}
                    </td>
                  ))}
                  <td className="pm">{r.m || ""}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        <div className="pdf-foot">
          法定福利費率 {data.welfare}%　法人税等の実効税率 {data.tax}%
        </div>
      </div>
    </div>
  );
}

// A4横。1ページに収まらない場合は縮小、それでも厳しければ行の切れ目で改ページ
export async function exportPdf(el, title) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  if (document.fonts?.ready) await document.fonts.ready;
  const scale = 2;
  const canvas = await html2canvas(el, { scale, backgroundColor: "#ffffff" });
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const M = 10;
  const PW = 297 - M * 2;
  const PH = 210 - M * 2;
  const elW = el.offsetWidth;
  const elH = el.offsetHeight;
  const mmPerPx = PW / elW;
  const fullH = elH * mmPerPx;

  if (fullH <= PH) {
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", M, M, PW, fullH);
  } else if (PH / fullH >= 0.7) {
    const w = PW * (PH / fullH);
    pdf.addImage(
      canvas.toDataURL("image/jpeg", 0.95),
      "JPEG",
      M + (PW - w) / 2,
      M,
      w,
      PH,
    );
  } else {
    const top0 = el.getBoundingClientRect().top;
    const bottoms = [...el.querySelectorAll("tr")].map(
      (tr) => tr.getBoundingClientRect().bottom - top0,
    );
    bottoms.push(elH);
    const pagePx = PH / mmPerPx;
    let start = 0;
    let first = true;
    while (start < elH - 1) {
      let end = start + pagePx;
      if (end < elH) {
        const fit = bottoms.filter((b) => b > start + 1 && b <= end);
        if (fit.length) end = Math.max(...fit);
      } else {
        end = elH;
      }
      const piece = document.createElement("canvas");
      piece.width = canvas.width;
      piece.height = Math.round((end - start) * scale);
      piece
        .getContext("2d")
        .drawImage(
          canvas,
          0,
          Math.round(start * scale),
          canvas.width,
          piece.height,
          0,
          0,
          canvas.width,
          piece.height,
        );
      if (!first) pdf.addPage();
      pdf.addImage(
        piece.toDataURL("image/jpeg", 0.95),
        "JPEG",
        M,
        M,
        PW,
        (end - start) * mmPerPx,
      );
      first = false;
      start = end;
    }
  }
  const safe = String(title || "利益シミュレーション").replace(
    /[\\/:*?"<>|]/g,
    "_",
  );
  pdf.save(`${safe}_${today()}.pdf`);
}
