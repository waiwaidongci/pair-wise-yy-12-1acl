import { useState } from "react";
import {
  applyImport,
  buildImportPreview,
  entriesOf,
  type ConflictChoice,
  type Database,
  type ImportPreview,
} from "../lib/domain";
import { parseBackupFile } from "../lib/storage";
import { Badge, Modal } from "./ui";

export function ImportModal({
  open,
  db,
  onClose,
  onImport,
}: {
  open: boolean;
  db: Database;
  onClose: () => void;
  onImport: (merged: Database, report: { addedHorses: number; addedEntries: number }) => void;
}) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");

  const reset = () => {
    setPreview(null);
    setError("");
    setFileName("");
  };

  const pickFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setBusy(true);
    setFileName(file.name);
    try {
      const incoming = await parseBackupFile(file);
      setPreview(buildImportPreview(incoming, db));
    } catch (e) {
      setError(e instanceof Error ? e.message : "文件解析失败");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  };

  const setChoice = (code: string, choice: ConflictChoice) =>
    setPreview((p) =>
      p ? { ...p, pairs: p.pairs.map((x) => (x.incoming.code === code ? { ...x, choice } : x)) } : p,
    );

  const doImport = () => {
    if (!preview) return;
    // 在内存中预演合并，用于统计
    const merged = applyImport(db, preview);
    const addedHorses = merged.horses.length - db.horses.length;
    const addedEntries = merged.entries.length - db.entries.length;
    onImport(merged, { addedHorses, addedEntries });
    reset();
  };

  return (
    <Modal
      open={open}
      title="导入旧备份"
      wide
      onClose={() => {
        reset();
        onClose();
      }}
      footer={
        preview ? (
          <>
            <span className="import-summary">
              新增马匹 {preview.newCount} 匹 · 同名冲突 {preview.conflictCount} 匹
            </span>
            <button onClick={() => { reset(); onClose(); }}>取消</button>
            <button className="primary" onClick={doImport}>
              按以上选择导入
            </button>
          </>
        ) : undefined
      }
    >
      <div className="import-drop">
        <input
          id="import-file"
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        <label htmlFor="import-file" className="import-pick">
          {busy ? "正在解析…" : fileName ? `已选择：${fileName}（点此重选）` : "选择备份 JSON 文件"}
        </label>
        <p className="import-tip">仅在当前浏览器数据中合并，不会覆盖任何内容；遇到同一匹马时由你逐匹决定。</p>
        {error && <p className="form-error">{error}</p>}
      </div>

      {preview && (
        <div className="import-list">
          {preview.pairs.map((p) => {
            const isNew = !p.existing;
            const existingCount = p.existing ? entriesOf(db, p.existing.id).length : 0;
            return (
              <div key={p.incoming.id} className={"import-row" + (p.existing ? " conflict" : "")}>
                <div className="import-row-head">
                  <b>{p.incoming.code}</b>
                  {p.incoming.name && <span className="muted">{p.incoming.name}</span>}
                  {isNew ? (
                    <Badge tone="ok">新马匹，直接加入</Badge>
                  ) : (
                    <Badge tone="warn">同编号已存在</Badge>
                  )}
                  <span className="muted import-counts">
                    {isNew
                      ? `备份含 ${p.entries.length} 条记录`
                      : `现有 ${existingCount} 条 · 备份 ${p.entries.length} 条`}
                  </span>
                </div>
                {p.existing && (
                  <div className="conflict-choice" role="radiogroup">
                    <label className={"choice" + (p.choice === "merge" ? " selected" : "")}>
                      <input
                        type="radio"
                        name={"choice-" + p.incoming.code}
                        checked={p.choice === "merge"}
                        onChange={() => setChoice(p.incoming.code, "merge")}
                      />
                      <span>
                        <b>并入历史</b>
                        <em>保留现有档案，把备份中的检查/换蹄记录按时间追加，自动去重</em>
                      </span>
                    </label>
                    <label className={"choice" + (p.choice === "keep" ? " selected" : "")}>
                      <input
                        type="radio"
                        name={"choice-" + p.incoming.code}
                        checked={p.choice === "keep"}
                        onChange={() => setChoice(p.incoming.code, "keep")}
                      />
                      <span>
                        <b>保留现有记录</b>
                        <em>跳过这匹马，备份中关于它的内容一律不导入</em>
                      </span>
                    </label>
                  </div>
                )}
              </div>
            );
          })}
          {preview.pairs.length === 0 && <p className="muted">备份中没有马匹数据。</p>}
        </div>
      )}
    </Modal>
  );
}
