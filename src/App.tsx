import { useMemo, useState } from "react";
import "./styles.css";
import {
  HOOF_LABEL,
  HOOVES,
  dueReminders,
  horseSummaries,
  metricStats,
  type Database,
  type Horse,
  type WorkEntry,
} from "./lib/domain";
import { exportFile, listDrafts, loadDb, saveDb } from "./lib/storage";
import { HorseDetail } from "./components/HorseDetail";
import { HorseFormModal } from "./components/HorseFormModal";
import { ImportModal } from "./components/ImportModal";
import { Badge, EmptyState } from "./components/ui";

type FilterKey = "all" | "review" | "abnormal" | "sport" | "rest";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "review", label: "待复查" },
  { key: "abnormal", label: "异常步态" },
  { key: "sport", label: "运动马" },
  { key: "rest", label: "休养马" },
];

interface Toast {
  id: number;
  msg: string;
  tone: "ok" | "err";
}

export default function App() {
  const [db, setDb] = useState<Database>(() => loadDb());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [horseModal, setHorseModal] = useState<{ open: boolean; horse?: Horse }>({ open: false });
  const [importOpen, setImportOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const drafts = useMemo(() => listDrafts(), [db]);

  // 所有写操作统一走这里：localStorage 同步落盘后再刷新界面，保证提交内容意外关页不丢
  const commit = (next: Database, msg?: string) => {
    saveDb(next);
    setDb(next);
    if (msg) toast(msg, "ok");
  };

  const toast = (msg: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  };

  const stats = useMemo(() => metricStats(db), [db]);
  const summaries = useMemo(() => horseSummaries(db), [db]);
  const reminders = useMemo(() => dueReminders(db), [db]);

  const filtered = summaries.filter((s) => {
    const q = query.trim().toLowerCase();
    if (q && !(`${s.horse.code} ${s.horse.name}`.toLowerCase().includes(q))) return false;
    switch (filter) {
      case "review":
        return s.urgency !== null && s.urgency <= 3;
      case "abnormal":
        return s.abnormal;
      case "sport":
        return s.horse.status === "运动马";
      case "rest":
        return s.horse.status === "休养马";
      default:
        return true;
    }
  });

  const selected = db.horses.find((h) => h.id === selectedId) ?? null;
  const draftOf = (id: string) => drafts.find((d) => d.horseId === id);

  const saveHorse = (horse: Horse) => {
    const exists = db.horses.some((h) => h.id === horse.id);
    const next: Database = exists
      ? { ...db, horses: db.horses.map((h) => (h.id === horse.id ? horse : h)) }
      : { ...db, horses: [...db.horses, horse] };
    commit(next, exists ? "档案已更新" : `已建立 ${horse.code} 档案`);
    setHorseModal({ open: false });
    if (!exists) setSelectedId(horse.id);
  };

  const addEntry = (entry: WorkEntry) => {
    commit({ ...db, entries: [...db.entries, entry] }, "检查记录已提交，数据已存入本机浏览器");
  };

  const deleteEntry = (id: string) => {
    commit({ ...db, entries: db.entries.filter((e) => e.id !== id) }, "记录已删除");
  };

  const deleteHorse = (horse: Horse) => {
    commit(
      {
        ...db,
        horses: db.horses.filter((h) => h.id !== horse.id),
        entries: db.entries.filter((e) => e.horseId !== horse.id),
      },
      `已删除 ${horse.code} 及其全部历史`,
    );
    setSelectedId(null);
  };

  const recent = useMemo(() => {
    return [...db.entries]
      .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1))
      .slice(0, 6);
  }, [db]);

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <h1>马术蹄铁修整档案</h1>
          <p>建档 → 四蹄检查 → 蹄铁更换 → 复查提醒，数据保存在当前浏览器</p>
        </div>
        <div className="topbar-actions">
          <button onClick={() => exportFile(db)}>导出备份</button>
          <button onClick={() => setImportOpen(true)}>导入备份</button>
          <button
            className="primary"
            onClick={() => {
              setSelectedId(null);
              setHorseModal({ open: true });
            }}
          >
            + 新马匹档案
          </button>
        </div>
      </header>

      <section className="metrics">
        <article>
          <small>待复查（3天内/逾期）</small>
          <strong className={stats.pending > 0 ? "num-danger" : ""}>{stats.pending}</strong>
        </article>
        <article>
          <small>异常步态 / 蹄况</small>
          <strong className={stats.abnormal > 0 ? "num-warn" : ""}>{stats.abnormal}</strong>
        </article>
        <article>
          <small>近30天更换蹄铁（蹄次）</small>
          <strong>{stats.shoeChanges30d}</strong>
        </article>
        <article>
          <small>马匹档案</small>
          <strong>{stats.horses}</strong>
        </article>
      </section>

      <div className="layout">
        <aside className="panel sidebar">
          <div className="sidebar-search">
            <input
              placeholder="搜索编号 / 马名"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="chips sidebar-chips">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={"chip" + (filter === f.key ? " on" : "")}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="horse-list">
            {filtered.map((s) => (
              <button
                key={s.horse.id}
                className={"horse-item" + (selectedId === s.horse.id ? " active" : "")}
                onClick={() => setSelectedId(s.horse.id)}
              >
                <div className="horse-item-top">
                  <b>{s.horse.code}</b>
                  {s.horse.name && <span>{s.horse.name}</span>}
                </div>
                <div className="horse-item-flags">
                  {s.urgency !== null && s.urgency < 0 && <Badge tone="danger">逾期{-s.urgency}天</Badge>}
                  {s.urgency !== null && s.urgency >= 0 && s.urgency <= 3 && (
                    <Badge tone={s.urgency === 0 ? "danger" : "warn"}>
                      {s.urgency === 0 ? "今日复查" : `${s.urgency}天后复查`}
                    </Badge>
                  )}
                  {s.abnormal && <Badge tone="warn">异常</Badge>}
                  {draftOf(s.horse.id) && <Badge tone="info">草稿</Badge>}
                </div>
              </button>
            ))}
            {filtered.length === 0 && <p className="muted sidebar-empty">没有符合条件的马匹</p>}
          </div>
        </aside>

        <section className="content">
          {selected ? (
            <HorseDetail
              key={selected.id}
              db={db}
              horse={selected}
              onEditHorse={() => setHorseModal({ open: true, horse: selected })}
              onDeleteHorse={() => deleteHorse(selected)}
              onAddEntry={addEntry}
              onDeleteEntry={deleteEntry}
            />
          ) : (
            <Dashboard
              db={db}
              reminders={reminders}
              recent={recent}
              onOpenHorse={setSelectedId}
              onNew={() => setHorseModal({ open: true })}
            />
          )}
        </section>
      </div>

      <HorseFormModal
        open={horseModal.open}
        existing={horseModal.horse}
        codeExists={(code, exceptId) =>
          db.horses.some((h) => h.code.trim() === code.trim() && h.id !== exceptId)
        }
        onClose={() => setHorseModal({ open: false })}
        onSave={saveHorse}
      />

      <ImportModal
        open={importOpen}
        db={db}
        onClose={() => setImportOpen(false)}
        onImport={(merged, report) => {
          commit(merged, `导入完成：新增 ${report.addedHorses} 匹档案、${report.addedEntries} 条历史记录`);
          setImportOpen(false);
        }}
      />

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={"toast toast-" + t.tone}>
            {t.tone === "ok" ? "✓ " : "⚠ "}
            {t.msg}
          </div>
        ))}
      </div>
    </main>
  );
}

function Dashboard({
  db,
  reminders,
  recent,
  onOpenHorse,
  onNew,
}: {
  db: Database;
  reminders: ReturnType<typeof dueReminders>;
  recent: WorkEntry[];
  onOpenHorse: (id: string) => void;
  onNew: () => void;
}) {
  const horseOf = (id: string) => db.horses.find((h) => h.id === id);

  return (
    <>
      <section className="panel">
        <div className="heading">
          <div>
            <p>复查提醒</p>
            <h2>今天该跟进的马</h2>
          </div>
        </div>
        {reminders.length === 0 ? (
          <EmptyState icon="✅" text="近期没有到期或逾期的复查，安排一次新的检查吧。" />
        ) : (
          <div className="reminder-grid">
            {reminders.map((r) => (
              <button key={r.horse.id} className="reminder-card" onClick={() => onOpenHorse(r.horse.id)}>
                <div className="reminder-top">
                  <b>{r.horse.code}</b>
                  {r.horse.name && <span>{r.horse.name}</span>}
                </div>
                {r.urgency < 0 ? (
                  <Badge tone="danger">已逾期 {-r.urgency} 天</Badge>
                ) : r.urgency === 0 ? (
                  <Badge tone="danger">今天到期</Badge>
                ) : (
                  <Badge tone="warn">{r.urgency} 天后到期</Badge>
                )}
                <p className="reminder-plan">原定复查日 {r.entry.nextReview}</p>
                {r.entry.note && <p className="reminder-note">“{r.entry.note}”</p>}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>工作台摘要</p>
            <h2>最近修蹄动态</h2>
          </div>
          <button onClick={onNew}>+ 建档</button>
        </div>
        {recent.length === 0 ? (
          <EmptyState icon="🐴" text="还没有任何修蹄记录，从建立第一份马匹档案开始。" />
        ) : (
          <div className="recent-list">
            {recent.map((e) => {
              const horse = horseOf(e.horseId);
              if (!horse) return null;
              const issues = HOOVES.flatMap((h) =>
                e.hooves[h].issues.map((i) => `${HOOF_LABEL[h]}${i}`),
              );
              return (
                <button key={e.id} className="recent-row" onClick={() => onOpenHorse(horse.id)}>
                  <div className="recent-date">{e.date}</div>
                  <div className="recent-main">
                    <h3>
                      {horse.code}
                      {horse.name ? ` · ${horse.name}` : ""}
                    </h3>
                    <p>
                      {e.gait && `步态：${e.gait}`}
                      {e.gait && (e.shoeChanges.length > 0 || issues.length > 0) ? "　·　" : ""}
                      {e.shoeChanges.length > 0 && `换蹄 ${e.shoeChanges.length} 蹄`}
                      {e.shoeChanges.length > 0 && issues.length > 0 ? "　·　" : ""}
                      {issues.slice(0, 3).join("、")}
                      {issues.length > 3 ? ` 等${issues.length}项` : ""}
                      {!e.gait && e.shoeChanges.length === 0 && issues.length === 0 && "已存档"}
                    </p>
                  </div>
                  <div className="recent-go">查看历史 →</div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
