import { useMemo, useState } from "react";
import { type AppState, type Horse, type HorseRole } from "../types";
import {
  abnormalHorseCount,
  latestExam,
  recheckList,
} from "../lib/selectors";
import { HOOF_KEYS } from "../types";
import { daysFromToday } from "../lib/utils";

type Filter = "全部" | HorseRole | "待复查" | "异常步态";
const FILTERS: Filter[] = [
  "全部",
  "运动马",
  "休养马",
  "教学马",
  "待复查",
  "异常步态",
];

export function Dashboard({
  state,
  onOpenHorse,
  onNewHorse,
  onNewCheck,
}: {
  state: AppState;
  onOpenHorse: (id: string) => void;
  onNewHorse: () => void;
  onNewCheck: () => void;
}) {
  const reminders = recheckList(state);
  const overdue = reminders.filter((r) => r.status === "overdue");
  const today = reminders.filter((r) => r.status === "today");
  const abnormal = abnormalHorseCount(state);
  const recentShoes = state.shoeChanges.length;

  return (
    <div className="dashboard">
      <section className="metrics">
        <MetricCard
          label="马匹档案"
          value={state.horses.length}
          tone="primary"
          hint="全部在档马匹"
        />
        <MetricCard
          label="待复查"
          value={reminders.length}
          tone="accent"
          hint={`其中逾期 ${overdue.length} · 今天到期 ${today.length}`}
        />
        <MetricCard
          label="异常步态"
          value={abnormal}
          tone="danger"
          hint="最近检查中标记的马匹"
        />
        <MetricCard
          label="换蹄记录"
          value={recentShoes}
          tone="secondary"
          hint="累计蹄铁更换次数"
        />
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p className="kicker">复查提醒</p>
            <h2>近 14 天复查日程</h2>
          </div>
          <button className="secondary" onClick={onNewCheck}>
            直接去复查
          </button>
        </div>
        {reminders.length === 0 ? (
          <p className="empty-tip">
            近期没有待复查的马。做检查时填写「下次复查日期」即可自动进入提醒。
          </p>
        ) : (
          <div className="reminder-list">
            {reminders.map((r) => (
              <button
                key={r.horse.id}
                className={`reminder rem-${r.status}`}
                onClick={() => onOpenHorse(r.horse.id)}
              >
                <div>
                  <b>
                    {r.horse.code}
                    {r.horse.name ? ` ${r.horse.name}` : ""}
                  </b>
                  <span>{r.horse.role}</span>
                </div>
                <div className="rem-when">
                  {r.status === "overdue" && (
                    <em className="overdue">已逾期 {-r.daysLeft} 天</em>
                  )}
                  {r.status === "today" && <em className="today">今天到期</em>}
                  {r.status === "soon" && <em>{r.daysLeft} 天后</em>}
                  <small>{r.exam.nextRecheck}</small>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <HorseTable state={state} onOpenHorse={onOpenHorse} onNewHorse={onNewHorse} />
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  tone: "primary" | "secondary" | "accent" | "danger";
}) {
  return (
    <article className={`metric metric-${tone}`}>
      <small>{label}</small>
      <strong>{value}</strong>
      <span>{hint}</span>
    </article>
  );
}

export function HorseTable({
  state,
  onOpenHorse,
  onNewHorse,
}: {
  state: AppState;
  onOpenHorse: (id: string) => void;
  onNewHorse?: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("全部");
  const [query, setQuery] = useState("");

  const horses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.horses.filter((h) => {
      if (q) {
        const hit =
          h.code.toLowerCase().includes(q) ||
          (h.name ?? "").toLowerCase().includes(q) ||
          (h.notes ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      const exam = latestExam(state, h.id);
      if (filter === "待复查") {
        if (!exam?.nextRecheck) return false;
        return daysFromToday(exam.nextRecheck) <= 14;
      }
      if (filter === "异常步态") {
        return exam ? HOOF_KEYS.some((k) => exam.hooves[k].abnormalGait) : false;
      }
      if (filter === "全部") return true;
      return h.role === filter;
    });
  }, [state.horses, state.exams, filter, query]);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p className="kicker">马匹档案</p>
          <h2>在档马匹</h2>
        </div>
        {onNewHorse && (
          <button className="primary" onClick={onNewHorse}>
            + 新建马匹档案
          </button>
        )}
      </div>
      <div className="list-tools">
        <input
          className="search"
          placeholder="搜索编号 / 马名 / 备注"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={filter === f ? "chip-active" : ""}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      {horses.length === 0 ? (
        <p className="empty-tip">
          {state.horses.length === 0
            ? "还没有马匹档案，点击「新建马匹档案」开始。"
            : "当前筛选下没有马匹。"}
        </p>
      ) : (
        <div className="horse-cards">
          {horses.map((h) => (
            <HorseCard
              key={h.id}
              state={state}
              horse={h}
              onClick={() => onOpenHorse(h.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function HorseCard({
  state,
  horse,
  onClick,
}: {
  state: AppState;
  horse: Horse;
  onClick: () => void;
}) {
  const exam = latestExam(state, horse.id);
  const shoeCount = state.shoeChanges.filter(
    (s) => s.horseId === horse.id
  ).length;
  const abnormal = exam
    ? HOOF_KEYS.filter((k) => exam.hooves[k].abnormalGait)
    : [];
  const days = exam?.nextRecheck ? daysFromToday(exam.nextRecheck) : undefined;

  return (
    <button className="horse-card" onClick={onClick}>
      <div className="hc-head">
        <b>{horse.code}</b>
        {horse.name && <span className="hc-name">{horse.name}</span>}
        <span className="chip">{horse.role}</span>
      </div>
      <p className="hc-line">
        {exam ? `最近检查 ${exam.date}` : "尚未检查"}
        {shoeCount > 0 && ` · 换蹄 ${shoeCount} 次`}
      </p>
      <div className="hc-tags">
        {abnormal.length > 0 && (
          <span className="tag tag-worse">异常步态 {abnormal.length} 蹄</span>
        )}
        {days !== undefined && days < 0 && (
          <span className="tag tag-overdue">复查逾期 {-days} 天</span>
        )}
        {days !== undefined && days === 0 && (
          <span className="tag tag-today">今天复查</span>
        )}
        {days !== undefined && days > 0 && days <= 14 && (
          <span className="tag tag-soon">{days} 天后复查</span>
        )}
      </div>
      {horse.notes && <p className="hc-notes">{horse.notes}</p>}
    </button>
  );
}
