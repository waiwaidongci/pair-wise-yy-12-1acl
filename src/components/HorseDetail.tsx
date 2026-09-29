import { useMemo, useState } from "react";
import {
  HOOF_LABEL,
  HOOF_SHORT,
  HOOVES,
  currentShoes,
  diffEntries,
  entriesOf,
  reviewUrgency,
  type Database,
  type Horse,
  type WorkEntry,
} from "../lib/domain";
import { Badge, EmptyState, Modal } from "./ui";
import { WorkForm } from "./WorkForm";

function reviewBadge(nextReview: string) {
  const u = reviewUrgency(nextReview);
  if (u === null) return <Badge tone="muted">未安排复查</Badge>;
  if (u < 0) return <Badge tone="danger">已逾期 {-u} 天（{nextReview}）</Badge>;
  if (u === 0) return <Badge tone="danger">今天复查（{nextReview}）</Badge>;
  if (u <= 3) return <Badge tone="warn">{u} 天后复查（{nextReview}）</Badge>;
  return <Badge tone="ok">{u} 天后复查（{nextReview}）</Badge>;
}

function EntryCard({ entry, prev, onDelete }: { entry: WorkEntry; prev?: WorkEntry; onDelete: () => void }) {
  const diff = useMemo(() => diffEntries(prev, entry), [entry, prev]);
  const [open, setOpen] = useState(false);
  const issueCount = HOOVES.reduce((n, h) => n + entry.hooves[h].issues.length, 0);

  return (
    <article className="entry-card">
      <header className="entry-head" onClick={() => setOpen((o) => !o)}>
        <div className="entry-date">
          <b>{entry.date}</b>
          <span>{entry.farrier || "未署名"}</span>
        </div>
        <div className="entry-tags">
          <Badge tone={entry.gaitAbnormal ? "warn" : "ok"}>{entry.gait || "步态未记"}{entry.gaitAbnormal ? " ⚠" : ""}</Badge>
          {entry.shoeChanges.length > 0 && <Badge tone="info">换蹄 ×{entry.shoeChanges.length}</Badge>}
          {issueCount > 0 && <Badge tone="danger">蹄部问题 ×{issueCount}</Badge>}
          {reviewBadge(entry.nextReview)}
        </div>
        <button className="expand-btn" aria-label="展开详情">{open ? "收起 ▲" : "详情 ▼"}</button>
      </header>

      {open && (
        <div className="entry-body">
          {entry.gaitNote && (
            <p className="entry-line"><b>步态描述：</b>{entry.gaitNote}</p>
          )}

          {entry.shoeChanges.length > 0 && (
            <div className="shoe-history">
              <h5>蹄铁更换（本次）</h5>
              {entry.shoeChanges.map((c) => (
                <div key={c.hoof} className="shoe-history-row">
                  <Badge tone="info">{HOOF_LABEL[c.hoof]}</Badge>
                  <span className="shoe-fromto">
                    {c.oldShoe || "（未登记）"} <i>→</i> <b>{c.newShoe}</b>
                  </span>
                  {c.nails && <span className="shoe-meta">钉位 {c.nails}</span>}
                  {c.reason && <span className="shoe-meta">{c.reason}</span>}
                </div>
              ))}
            </div>
          )}

          <div className="entry-hooves">
            {HOOVES.map((h) => {
              const st = entry.hooves[h];
              const d = diff.perHoof[h];
              if (!st.shape && !st.balance && st.issues.length === 0 && !st.note) return null;
              return (
                <div key={h} className={"entry-hoof" + (d.hasChange ? " changed" : "")}>
                  <div className="entry-hoof-head">
                    <b>{HOOF_SHORT[h]}</b>
                    {[st.shape, st.balance].filter(Boolean).join(" · ")}
                  </div>
                  {d.hasChange && (
                    <div className="entry-hoof-diff">
                      {d.shapeChanged && <span className="diff-chg">蹄形 {d.shapeChanged.from}→{d.shapeChanged.to}</span>}
                      {d.addedIssues.map((i) => <span key={i} className="diff-new">＋{i}</span>)}
                      {d.resolvedIssues.map((i) => <span key={i} className="diff-ok">－{i}</span>)}
                      {d.shoeChanged && <span className="diff-chg">{d.shoeChanged.from}→{d.shoeChanged.to}</span>}
                    </div>
                  )}
                  {(!d.hasChange || st.issues.length > 0) && st.issues.length > 0 && (
                    <div className="entry-hoof-issues">{st.issues.map((i) => `· ${i}`).join(" ")}</div>
                  )}
                  {st.note && <p className="entry-hoof-note">{st.note}</p>}
                </div>
              );
            })}
          </div>

          {entry.note && <p className="entry-line"><b>备注：</b>{entry.note}</p>}
          {entry.photoData && (
            <figure className="entry-photo">
              <img src={entry.photoData} alt={entry.photoCaption || "蹄部照片"} />
              {entry.photoCaption && <figcaption>{entry.photoCaption}</figcaption>}
            </figure>
          )}

          <div className="entry-actions">
            <button className="link-danger" onClick={onDelete}>删除此记录</button>
          </div>
        </div>
      )}
    </article>
  );
}

export function HorseDetail({
  db,
  horse,
  onEditHorse,
  onDeleteHorse,
  onAddEntry,
  onDeleteEntry,
}: {
  db: Database;
  horse: Horse;
  onEditHorse: () => void;
  onDeleteHorse: () => void;
  onAddEntry: (entry: WorkEntry) => void;
  onDeleteEntry: (id: string) => void;
}) {
  const [mode, setMode] = useState<"view" | "new">("view");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const list = useMemo(() => entriesOf(db, horse.id), [db, horse.id]);
  const latest = list[0];
  const shoes = useMemo(() => currentShoes(db, horse.id), [db, horse.id]);

  // 历史里相邻两条的“变化”：第 n 条对比第 n+1 条（更早一次）
  const diffSummary = useMemo(() => (latest ? diffEntries(list[1], latest) : null), [latest, list]);

  const submit = (e: WorkEntry) => {
    onAddEntry(e);
    setMode("view");
  };

  return (
    <div className="detail">
      <section className="panel horse-head-card">
        <div className="horse-head-main">
          <div>
            <h2>{horse.code}{horse.name ? ` · ${horse.name}` : ""}</h2>
            <p className="horse-meta">
              {[horse.breed, horse.status, horse.owner ? `负责人 ${horse.owner}` : ""].filter(Boolean).join("　·　")}
            </p>
            {horse.note && <p className="horse-note">📋 {horse.note}</p>}
          </div>
          <div className="horse-head-side">
            {reviewBadge(latest?.nextReview ?? "")}
            <div className="horse-head-btns">
              <button onClick={onEditHorse}>编辑档案</button>
              <button className="link-danger" onClick={() => setConfirmDelete(true)}>删除档案</button>
            </div>
          </div>
        </div>

        {mode === "view" && (
          <div className="shoe-now">
            <span className="shoe-now-label">当前蹄铁：</span>
            {HOOVES.some((h) => shoes[h]) ? (
              HOOVES.map((h) => (
                <span key={h} className="shoe-now-item">
                  <b>{HOOF_SHORT[h]}</b>
                  {shoes[h]
                    ? `${shoes[h]!.newShoe}${shoes[h]!.nails ? `（钉位 ${shoes[h]!.nails}）` : ""}`
                    : "—"}
                </span>
              ))
            ) : (
              <span className="muted">尚无换蹄记录</span>
            )}
          </div>
        )}
      </section>

      {mode === "new" ? (
        <section className="panel">
          <div className="heading">
            <div>
              <p>每日作业</p>
              <h2>新增修蹄检查记录</h2>
            </div>
          </div>
          <WorkForm
            horse={horse}
            prevEntry={latest}
            currentShoes={shoes}
            onCancel={() => setMode("view")}
            onSubmit={submit}
          />
        </section>
      ) : (
        <section className="panel">
          <div className="heading">
            <div>
              <p>可追溯历史</p>
              <h2>修蹄记录时间线</h2>
            </div>
            <button className="primary" onClick={() => setMode("new")}>
              + 今日检查 / 换蹄
            </button>
          </div>

          {list.length === 0 ? (
            <EmptyState
              icon="🐎"
              text="还没有任何检查记录。开始第一次四蹄检查，后续每次都能与这次对比蹄况变化。"
              action={<button className="primary" onClick={() => setMode("new")}>+ 新增第一次检查</button>}
            />
          ) : (
            <>
              {diffSummary && diffSummary.changeCount > 0 && (
                <div className="latest-change">
                  <b>最近一次（{latest!.date}）相对上次的变化：</b>
                  {diffSummary.gaitChanged && (
                    <Badge tone="warn">步态 {diffSummary.gaitChanged.from}→{diffSummary.gaitChanged.to}</Badge>
                  )}
                  {HOOVES.filter((h) => diffSummary.perHoof[h].hasChange).map((h) => {
                    const d = diffSummary.perHoof[h];
                    return (
                      <span key={h} className="latest-change-hoof">
                        <b>{HOOF_SHORT[h]}：</b>
                        {d.shapeChanged && <span className="diff-chg">{d.shapeChanged.from}→{d.shapeChanged.to} </span>}
                        {d.addedIssues.map((i) => <span key={i} className="diff-new">＋{i} </span>)}
                        {d.resolvedIssues.map((i) => <span key={i} className="diff-ok">－{i} </span>)}
                        {d.shoeChanged && <span className="diff-chg">{d.shoeChanged.from}→{d.shoeChanged.to}</span>}
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="timeline">
                {list.map((e, i) => (
                  <EntryCard key={e.id} entry={e} prev={list[i + 1]} onDelete={() => onDeleteEntry(e.id)} />
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <Modal
        open={confirmDelete}
        title="删除马匹档案"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <button onClick={() => setConfirmDelete(false)}>取消</button>
            <button className="danger" onClick={onDeleteHorse}>
              连同 {list.length} 条记录一并删除
            </button>
          </>
        }
      >
        <p>确定删除 <b>{horse.code}</b> 的档案和全部修蹄历史吗？此操作不可恢复，建议先导出备份。</p>
      </Modal>
    </div>
  );
}
