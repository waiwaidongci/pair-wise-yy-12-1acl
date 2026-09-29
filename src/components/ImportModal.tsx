import { useState } from "react";
import {
  analyzeImport,
  buildImportPayload,
  type ConflictChoice,
  type ImportPlan,
  type ParsedBackup,
} from "../lib/backup";
import type { AppState } from "../types";
import { actions } from "../lib/store";
import { Modal } from "./Modal";

export function ImportModal({
  current,
  parsed,
  onClose,
  onDone,
  notify,
}: {
  current: AppState;
  parsed: ParsedBackup;
  onClose: () => void;
  onDone: () => void;
  notify: (kind: "success" | "error" | "info", msg: string) => void;
}) {
  const [plan, setPlan] = useState<ImportPlan>(() =>
    analyzeImport(current, parsed)
  );

  const setChoice = (index: number, choice: ConflictChoice) => {
    setPlan((p) => ({
      ...p,
      conflicts: p.conflicts.map((c, i) =>
        i === index ? { ...c, choice } : c
      ),
    }));
  };

  const setAll = (choice: ConflictChoice) => {
    setPlan((p) => ({
      ...p,
      conflicts: p.conflicts.map((c) => ({ ...c, choice })),
    }));
  };

  const doImport = () => {
    const payload = buildImportPayload(current, plan);
    try {
      const result = actions.bulkImport(payload);
      const parts = [
        payload.importedHorseCount > 0
          ? `新导入 ${payload.importedHorseCount} 匹马`
          : "",
        payload.exams.length > 0 ? `${payload.exams.length} 条检查` : "",
        payload.shoeChanges.length > 0
          ? `${payload.shoeChanges.length} 条换蹄历史`
          : "",
      ].filter(Boolean);
      const mergedHorses = plan.conflicts.filter(
        (c) => c.choice === "merge"
      ).length;
      const skipped = plan.conflicts.filter((c) => c.choice === "keep").length;
      const extra = [
        mergedHorses > 0 ? `并入 ${mergedHorses} 匹同编号马的历史` : "",
        skipped > 0 ? `按选择保留现有、跳过 ${skipped} 匹` : "",
        payload.duplicatedExams > 0
          ? `去重 ${payload.duplicatedExams} 条重复检查`
          : "",
        payload.duplicatedShoes > 0
          ? `去重 ${payload.duplicatedShoes} 条重复换蹄`
          : "",
      ].filter(Boolean);
      notify(
        result.photosDropped ? "error" : "success",
        `导入完成：${parts.join("、") || "无新增内容"}${
          extra.length ? "；" + extra.join("，") : ""
        }${result.photosDropped ? "；空间不足，备份中的照片未存入" : ""}`
      );
      onDone();
    } catch (e) {
      notify(
        "error",
        e instanceof Error
          ? e.message
          : "导入失败，现有数据未受影响，请重试"
      );
    }
  };

  return (
    <Modal
      title="导入旧备份"
      subtitle={
        parsed.exportedAt
          ? `备份导出时间 ${new Date(parsed.exportedAt).toLocaleString()}`
          : undefined
      }
      onClose={onClose}
      wide
    >
      <p className="import-summary">
        备份内含 <b>{parsed.horses.length}</b> 匹马、
        <b> {parsed.exams.length}</b> 条检查、
        <b> {parsed.shoeChanges.length}</b> 条换蹄记录。其中
        <b className="accent-text"> {plan.newHorses.length}</b> 匹是新档案将直接导入，
        <b className="warn-text"> {plan.conflicts.length}</b> 匹与现有马匹编号相同，需要你决定：
      </p>

      {plan.conflicts.length > 0 && (
        <div className="conflict-block">
          <div className="conflict-bulk">
            <span>编号相同的马匹：</span>
            <button className="btn-mini" onClick={() => setAll("keep")}>
              全部保留现有
            </button>
            <button className="btn-mini" onClick={() => setAll("merge")}>
              全部并入历史
            </button>
          </div>
          <div className="conflict-list">
            {plan.conflicts.map((c, i) => (
              <div key={c.backupHorse.id} className="conflict-row">
                <div className="conflict-info">
                  <h3>{c.backupHorse.code}</h3>
                  <p>
                    现有：{c.existingHorse.name || "未命名"}（
                    {current.exams.filter((e) => e.horseId === c.existingHorse.id)
                      .length}{" "}
                    条检查）
                  </p>
                  <p className="muted">
                    备份：{c.backupHorse.name || "未命名"} · {c.examCount} 条检查 ·{" "}
                    {c.shoeCount} 条换蹄 · 最近 {c.latestDate}
                  </p>
                </div>
                <div className="conflict-choice">
                  <label
                    className={c.choice === "keep" ? "choice-on keep" : ""}
                  >
                    <input
                      type="radio"
                      name={`choice-${c.backupHorse.id}`}
                      checked={c.choice === "keep"}
                      onChange={() => setChoice(i, "keep")}
                    />
                    <span>
                      <b>保留现有记录</b>
                      <small>跳过备份里这匹马及其全部历史</small>
                    </span>
                  </label>
                  <label
                    className={c.choice === "merge" ? "choice-on merge" : ""}
                  >
                    <input
                      type="radio"
                      name={`choice-${c.backupHorse.id}`}
                      checked={c.choice === "merge"}
                      onChange={() => setChoice(i, "merge")}
                    />
                    <span>
                      <b>并入历史</b>
                      <small>
                        档案资料以现有为准，备份里的检查/换蹄追加到同编号马下
                      </small>
                    </span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="modal-actions">
        <button onClick={onClose}>取消</button>
        <button className="primary" onClick={doImport}>
          按以上选择导入
        </button>
      </div>
    </Modal>
  );
}
