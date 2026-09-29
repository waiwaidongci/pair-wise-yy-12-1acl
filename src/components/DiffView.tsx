import { compareExams, type HoofChange } from "../lib/compare";
import type { Exam } from "../types";

export function DiffView({
  exam,
  previous,
  emphasize,
}: {
  exam: Exam;
  previous?: Exam;
  /** 刚提交时的醒目模式 */
  emphasize?: boolean;
}) {
  const changes: HoofChange[] = compareExams(previous?.hooves, exam.hooves);
  const anyChange =
    changes.some((c) => c.fields.length > 0 || c.gait !== "none") ||
    !!exam.gaitSummary ||
    !!exam.note;

  return (
    <div className={`diff ${emphasize ? "diff-emphasize" : ""}`}>
      <div className="diff-title">
        {previous
          ? `与上次检查（${previous.date}）对比的蹄况变化`
          : "首次检查 · 建立四蹄基线"}
      </div>
      {!anyChange && <p className="diff-empty">本次四只蹄与上次相比无变化</p>}
      <div className="diff-hooves">
        {changes.map((c) => (
          <HoofDiff key={c.hoof} change={c} />
        ))}
      </div>
      {(exam.gaitSummary || exam.note) && (
        <div className="diff-notes">
          {exam.gaitSummary && (
            <p>
              <b>整体步态：</b>
              {exam.gaitSummary}
            </p>
          )}
          {exam.note && (
            <p>
              <b>检查备注：</b>
              {exam.note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function HoofDiff({ change }: { change: HoofChange }) {
  const { fields, gait } = change;
  const empty = fields.length === 0 && gait === "none";
  return (
    <div
      className={`diff-hoof ${
        gait === "new" || fields.some((f) => f.kind === "worse")
          ? "is-worse"
          : gait === "resolved" || fields.some((f) => f.kind === "better")
            ? "is-better"
            : ""
      }`}
    >
      <h4>{change.label}</h4>
      {gait === "new" && <span className="tag tag-worse">新发异常步态</span>}
      {gait === "persist" && <span className="tag tag-warn">异常步态持续</span>}
      {gait === "resolved" && <span className="tag tag-better">异常步态消失</span>}
      {empty ? (
        <p className="diff-empty">无变化</p>
      ) : (
        <ul className="diff-fields">
          {fields.map((f, i) => (
            <li key={i} className={`kind-${f.kind}`}>
              <span className="diff-field-name">{f.field}</span>
              <span className="diff-val old">{f.before}</span>
              <span className="diff-arrow">→</span>
              <span className="diff-val new">{f.after}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
