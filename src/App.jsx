import { useCallback, useEffect, useRef, useState } from "react";
import { defaultData, normalize } from "../shared/calc.js";
import Simulator from "./Simulator.jsx";
import {
  createSim,
  deleteSim,
  getSim,
  listSims,
  setPasscode,
  updateSim,
} from "./api.js";

const PASS_KEY = "ps-passcode";
const STATUS_TEXT = {
  loading: "読み込み中…",
  dirty: "未保存",
  saving: "保存中…",
  saved: "保存済み",
  error: "保存に失敗しました",
};

// パスコードのみブラウザに保持（アプリのデータはすべてRedis）
function readPass() {
  try {
    return localStorage.getItem(PASS_KEY) || "";
  } catch {
    return "";
  }
}
function writePass(p) {
  try {
    localStorage.setItem(PASS_KEY, p);
  } catch {
    // 保存できなくても動作は継続
  }
}

export default function App() {
  const [needPass, setNeedPass] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [sims, setSims] = useState([]);
  const [cur, setCur] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const timer = useRef(null);
  const pending = useRef(null);

  const flush = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setStatus("saving");
    try {
      const saved = await updateSim(p.id, p.patch);
      setSims((list) =>
        list.map((s) =>
          s.id === saved.id
            ? { ...s, name: saved.name, updatedAt: saved.updatedAt }
            : s,
        ),
      );
      setStatus(pending.current ? "dirty" : "saved");
    } catch (e) {
      if (e.code === 401) setNeedPass(true);
      setStatus("error");
    }
  }, []);

  const schedule = useCallback(
    (id, patch) => {
      const prev = pending.current?.id === id ? pending.current.patch : {};
      pending.current = { id, patch: { ...prev, ...patch } };
      setStatus("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
    },
    [flush],
  );

  const open = useCallback(async (id) => {
    setStatus("loading");
    const s = await getSim(id);
    setCur({ id: s.id, name: s.name, data: normalize(s.data) });
    setStatus("saved");
  }, []);

  const load = useCallback(
    async (selectId) => {
      setStatus("loading");
      setError("");
      try {
        const res = await listSims();
        setSims(res.sims);
        setNeedPass(false);
        const id = selectId || res.sims[0]?.id;
        if (id) await open(id);
      } catch (e) {
        if (e.code === 401) {
          setNeedPass(true);
          setStatus("saved");
        } else {
          setError(e.message);
          setStatus("error");
        }
      }
    },
    [open],
  );

  useEffect(() => {
    setPasscode(readPass());
    load();
  }, [load]);

  // 画面を閉じる前に未保存分を送る
  useEffect(() => {
    const h = () => {
      if (pending.current) flush();
    };
    window.addEventListener("pagehide", h);
    return () => window.removeEventListener("pagehide", h);
  }, [flush]);

  const submitPass = () => {
    writePass(passInput);
    setPasscode(passInput);
    load();
  };

  const onData = (data) => {
    setCur((c) => ({ ...c, data }));
    schedule(cur.id, { data });
  };

  const switchSim = async (id) => {
    try {
      await flush();
      await open(id);
    } catch (e) {
      setError(e.message);
      setStatus("error");
    }
  };

  const newSim = async () => {
    const name = window.prompt(
      "新しいシミュレーションの名前",
      "新しいシミュレーション",
    );
    if (name == null) return;
    const copy = window.confirm(
      "今のシミュレーションの内容をコピーして作りますか？\n（キャンセルで初期値から作成）",
    );
    try {
      await flush();
      setStatus("saving");
      const s = await createSim(name, copy && cur ? cur.data : defaultData());
      setSims((list) => [
        { id: s.id, name: s.name, updatedAt: s.updatedAt },
        ...list,
      ]);
      setCur({ id: s.id, name: s.name, data: normalize(s.data) });
      setStatus("saved");
    } catch (e) {
      setError(e.message);
      setStatus("error");
    }
  };

  const rename = () => {
    if (!cur) return;
    const name = window.prompt("シミュレーション名", cur.name);
    if (name == null || !name.trim()) return;
    setCur((c) => ({ ...c, name: name.trim() }));
    setSims((list) =>
      list.map((s) => (s.id === cur.id ? { ...s, name: name.trim() } : s)),
    );
    schedule(cur.id, { name: name.trim() });
  };

  const remove = async () => {
    if (!cur) return;
    if (!window.confirm(`「${cur.name}」を削除しますか？`)) return;
    try {
      if (pending.current?.id === cur.id) {
        pending.current = null;
        if (timer.current) clearTimeout(timer.current);
      }
      await deleteSim(cur.id);
      setCur(null);
      await load();
    } catch (e) {
      setError(e.message);
      setStatus("error");
    }
  };

  if (needPass) {
    return (
      <div className="wrap">
        <div className="panel pass">
          <h1>仕入れ代行 利益シミュレーター</h1>
          <p className="sub">パスコードを入力してください。</p>
          <div className="ctrl">
            <input
              type="password"
              value={passInput}
              aria-label="パスコード"
              onChange={(e) => setPassInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitPass()}
            />
            <button type="button" className="btn" onClick={submitPass}>
              開く
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap">
      <header className="head">
        <h1>仕入れ代行 利益シミュレーター</h1>
        <span className={`status ${status}`}>{STATUS_TEXT[status]}</span>
      </header>

      <div className="panel">
        <div className="ctrl">
          <select
            aria-label="シミュレーションを選ぶ"
            value={cur?.id || ""}
            onChange={(e) => switchSim(e.target.value)}
          >
            {sims.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn ghost"
            onClick={rename}
            disabled={!cur}
          >
            名前を変更
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={remove}
            disabled={!cur}
          >
            削除
          </button>
          <span className="sp" />
          <button type="button" className="btn" onClick={newSim}>
            新しいシミュレーション
          </button>
        </div>
        {error && <p className="err">{error}</p>}
      </div>

      {cur ? (
        <Simulator data={cur.data} onChange={onData} />
      ) : (
        <div className="panel">
          {status === "loading"
            ? "読み込み中…"
            : "シミュレーションがありません。"}
        </div>
      )}
    </div>
  );
}
