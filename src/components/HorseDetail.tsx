import { useState } from "react";
import {
  HOOF_KEYS,
  HOOF_LABELS,
  type AppState,
  type Exam,
  type Horse,
  type ShoeChange,
  type ShoeTarget,
} from "../types";
import {
  horseExams,
  horseShoes,
  previousExam,
} from "../lib/selectors";
import { daysFromToday } from "../lib/utils";
import { DiffView } from "./DiffView";

type TimelineItem =
  | { kind: "exam"; date: string; createdAt: number; data: Exam }
  | { kind: "shoe"; date: string; createdAt: number; data: ShoeChange };

const HOOF_OF: Record<ShoeTarget, string> = {
  ALL: "四蹄",
  LF: HOOF_LABELS.LF,
  RF: HOOF_LABELS.RF,
  LH: HOOF_LABELS.LH,
  RH: HOOF_LABELS.RH,
};

export function HorseDetail({
  state,
  horse,
  onBack,
  onNewExam,
  onNewShoe,
  onEditHorse,
  onDeleteHorse,
  onDeleteExam,
  onDeleteShoe,
  notify,
  highlightExamId,
}: {
  state: AppState;
  horse: Horse;
  onBack: () => void;
  onNewExam: () => void;
  onNewShoe: () => void;
  onEditHorse: () => void;
  onDeleteHorse: () => void;
  onDeleteExam: (id: string) => void;
  onDeleteShoe: (id: string) => void;
  notify: (kind: "success" | "error" | "info", msg: string) => void;
  highlightExamId?: string;
}) {
  const exams = horseExams(state, horse.id);
  const shoes = horseShoes(state, horse.id);
  const latest = exams[0];
  const [lightbox, setLightbox] = useState<string | undefined>(undefined);
  const [confirmDel, setConfirmDel] = useState<
    { kind: "exam" | "shoe" | "horse"; id: string; label: string } | undefined
  >(undefined);

  const timeline: TimelineItem[] = [
    ...exams.map((e) => ({
      kind: "exam" as const,
      date: e.date,
      createdAt: e.createdAt,
      data: e,
    })),
    ...shoes.map((s) => ({
      kind: "shoe" as const,
      date: s.date,
      createdAt: s.createdAt,
      data: s,
    })),
  ].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt
  );

  const recheck = latest?.nextRecheck;
  const daysLeft = recheck ? daysFromToday(recheck) : undefined;

  return (
    <div className="detail">
      <div className="detail-top">
        <button className="btn-ghost" onClick={onBack}>
          ← 返回马匹列表
        </button>
        <div className="detail-actions">
          <button className="btn-ghost" onClick={onEditHorse}>
            编辑档案
          </button>
          <button
            className="btn-ghost danger"
            onClick={() =>
              setConfirmDel({
                kind: "horse",
                id: horse.id,
                label: `删除档案 ${horse.code}（其全部检查与换蹄历史将一并删除）`,
              })
            }
          >
            删除档案
          </button>
          <button className="secondary" onClick={onNewShoe}>
            登记换蹄
          </button>
          <button className="primary" onClick={onNewExam}>
            新建检查
          </button>
        </div>
      </div>

      <section className="panel horse-header">
        <div>
          <h1>
            {horse.code}
            {horse.name ? <span className="horse-name">{horse.name}</span> : null}
          </h1>
          <p className="horse-meta">
            <span className="chip">{horse.role}</span>
            {horse.breed && <span>品种：{horse.breed}</span>}
            {horse.notes && <span className="horse-notes">{horse.notes}</span>}
          </p>
        </div>
        <RecheckBadge daysLeft={daysLeft} date={recheck} />
      </section>

      {latest && (
        <section className="panel">
          <h2 className="section-title">当前四蹄状况（{latest.date} 检查）</h2>
          <div className="current-hooves">
            {HOOF_KEYS.map((k) => {
              const h = latest.hooves[k];
              return (
                <div
                  key={k}
                  className={`current-hoof ${h.abnormalGait ? "hoof-warn" : ""}`}
                >
                  <h3>{HOOF_LABELS[k]}</h3>
                  <dl>
                    <dt>蹄形</dt>
                    <dd>{h.shape || "—"}</dd>
                    <dt>蹄铁</dt>
                    <dd>{h.shoeType || "—"}</dd>
                    <dt>磨耗</dt>
                    <dd>{h.wear || "—"}</dd>
                    <dt>钉位</dt>
                    <dd>{h.nailPositions || "—"}</dd>
                  </dl>
                  {h.abnormalGait && (
                    <span className="tag tag-worse">
                      异常步态{h.gaitNote ? `：${h.gaitNote}` : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="panel">
        <h2 className="section-title">检查与换蹄历史（按时间倒序，可追溯）</h2>
        {timeline.length === 0 && (
          <p className="empty-tip">
            还没有任何记录。点击右上角「新建检查」开始第一次四蹄检查。
          </p>
        )}
        <div className="timeline">
          {timeline.map((item) =>
            item.kind === "exam" ? (
              <ExamEntry
                key={"e" + item.data.id}
                exam={item.data}
                previous={previousExam(state, horse.id, item.data.id)}
                forceOpen={item.data.id === highlightExamId}
                onPhoto={setLightbox}
                onDelete={() =>
                  setConfirmDel({
                    kind: "exam",
                    id: item.data.id,
                    label: `删除 ${item.data.date} 的四蹄检查记录`,
                  })
                }
              />
            ) : (
              <ShoeEntry
                key={"s" + item.data.id}
                change={item.data}
                onDelete={() =>
                  setConfirmDel({
                    kind: "shoe",
                    id: item.data.id,
                    label: `删除 ${item.data.date} 的蹄铁更换记录`,
                  })
                }
              />
            )
          )}
        </div>
      </section>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(undefined)}>
          <img src={lightbox} alt="检查照片大图" />
        </div>
      )}

      {confirmDel && (
        <div className="modal-backdrop" onClick={() => setConfirmDel(undefined)}>
          <div className="modal confirm" onClick={(e) => e.stopPropagation()}>
            <h2>确认删除</h2>
            <p>{confirmDel.label}</p>
            <div className="modal-actions">
              <button onClick={() => setConfirmDel(undefined)}>取消</button>
              <button
                className="danger-btn"
                onClick={() => {
                  if (confirmDel.kind === "exam") {
                    onDeleteExam(confirmDel.id);
                    notify("info", "检查记录已删除");
                  } else if (confirmDel.kind === "shoe") {
                    onDeleteShoe(confirmDel.id);
                    notify("info", "换蹄记录已删除");
                  } else {
                    onDeleteHorse();
                  }
                  setConfirmDel(undefined);
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecheckBadge({
  daysLeft,
  date,
}: {
  daysLeft?: number;
  date?: string;
}) {
  if (daysLeft === undefined || !date) {
    return <div className="recheck-badge none">未安排复查</div>;
  }
  if (daysLeft < 0)
    return (
      <div className="recheck-badge overdue">
        复查已逾期 {-daysLeft} 天
        <small>计划日期 {date}</small>
      </div>
    );
  if (daysLeft === 0)
    return (
      <div className="recheck-badge today">
        今天该复查
        <small>{date}</small>
      </div>
    );
  return (
    <div className="recheck-badge soon">
      {daysLeft} 天后复查
      <small>{date}</small>
    </div>
  );
}

function ExamEntry({
  exam,
  previous,
  forceOpen,
  onPhoto,
  onDelete,
}: {
  exam: Exam;
  previous?: Exam;
  /** 刚提交后强制展开并高亮，之后可手动收起 */
  forceOpen?: boolean;
  onPhoto: (src: string) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(!!forceOpen);
  const show = forceOpen || open;
  return (
    <article className={`tl-entry tl-exam ${forceOpen ? "flash" : ""}`}>
      <header
        className="tl-head"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tl-dot exam-dot" />
        <div className="tl-head-main">
          <h3>
            四蹄检查 · {exam.date}
            {exam.nextRecheck && (
              <span className="tl-recheck">
                复查 {exam.nextRecheck}
              </span>
            )}
          </h3>
          {exam.gaitSummary && <p>{exam.gaitSummary}</p>}
        </div>
        <button
          className="btn-mini danger"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          删除
        </button>
        <span className="tl-toggle">{show ? "收起" : "展开对比"}</span>
      </header>
      {show && (
        <div className="tl-body">
          <DiffView exam={exam} previous={previous} emphasize={forceOpen} />
          {exam.photos.length > 0 && (
            <div className="entry-photos">
              {exam.photos.map((p) => (
                <figure key={p.id}>
                  <img
                    src={p.dataUrl}
                    alt={p.caption ?? "检查照片"}
                    onClick={() => onPhoto(p.dataUrl)}
                  />
                  {p.caption && <figcaption>{p.caption}</figcaption>}
                </figure>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function ShoeEntry({
  change,
  onDelete,
}: {
  change: ShoeChange;
  onDelete: () => void;
}) {
  return (
    <article className="tl-entry tl-shoe">
      <header className="tl-head static">
        <span className="tl-dot shoe-dot" />
        <div className="tl-head-main">
          <h3>
            蹄铁更换 · {change.date}
            <span className="tl-shoe-hoof">{HOOF_OF[change.hoof]}</span>
          </h3>
          <p>
            <span className="shoe-from">{change.fromShoe || "（未记录原蹄铁）"}</span>
            <span className="diff-arrow">→</span>
            <b>{change.toShoe}</b>
            {change.reason && <span className="shoe-reason"> · {change.reason}</span>}
            {change.nailPositions && (
              <span className="shoe-reason"> · 钉位 {change.nailPositions}</span>
            )}
          </p>
          {change.note && <p className="shoe-note">{change.note}</p>}
        </div>
        <button className="btn-mini danger" onClick={onDelete}>
          删除
        </button>
      </header>
    </article>
  );
}
