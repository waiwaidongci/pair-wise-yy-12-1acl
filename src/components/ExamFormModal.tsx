import { useEffect, useMemo, useRef, useState } from "react";
import {
  HOOF_KEYS,
  HOOF_LABELS,
  SHAPE_OPTIONS,
  SHOE_OPTIONS,
  WEAR_OPTIONS,
  type Exam,
  type ExamDraft,
  type HoofDetails,
  type HoofKey,
  type Horse,
  type Photo,
} from "../types";
import { actions } from "../lib/store";
import {
  clearExamDraft,
  loadExamDraft,
  newExamDraft,
  saveExamDraft,
} from "../lib/drafts";
import { fileToPhoto } from "../lib/photo";
import { uid } from "../lib/utils";
import { Modal } from "./Modal";

/** 以上次检查为默认值：蹄形/蹄铁/钉位/磨耗沿用，异常步态重新判定 */
function prefillFrom(latest: Exam | undefined): ExamDraft {
  if (!latest) return newExamDraft();
  const hooves = { ...latest.hooves };
  for (const k of HOOF_KEYS) {
    hooves[k] = { ...hooves[k], abnormalGait: false, gaitNote: "" };
  }
  return newExamDraft({
    gaitSummary: latest.gaitSummary ?? "",
    hooves,
    nextRecheck: "",
  });
}

export function ExamFormModal({
  horse,
  latest,
  onClose,
  onSaved,
  notify,
}: {
  horse: Horse;
  latest: Exam | undefined;
  onClose: () => void;
  onSaved: (exam: Exam) => void;
  notify: (kind: "success" | "error" | "info", msg: string) => void;
}) {
  const initial = useMemo(() => prefillFrom(latest), [latest]);
  const [draft, setDraft] = useState<ExamDraft>(initial);
  const [dirty, setDirty] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"saved" | "pending" | "full">(
    "saved"
  );
  const [restored, setRestored] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);

  // 挂载时恢复未提交草稿
  useEffect(() => {
    const stored = loadExamDraft(horse.id);
    if (stored && stored.date) {
      setDraft(stored);
      setRestored(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 草稿自动暂存（仅在用户真正操作过之后，防抖 500ms）
  useEffect(() => {
    if (!dirty) return;
    setDraftStatus("pending");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const ok = saveExamDraft(horse.id, draft);
      setDraftStatus(ok ? "saved" : "full");
    }, 500);
    return () => window.clearTimeout(timer.current);
  }, [draft, dirty, horse.id]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const setHoof = (k: HoofKey, patch: Partial<HoofDetails>) => {
    setDirty(true);
    setDraft((d) => ({
      ...d,
      hooves: { ...d.hooves, [k]: { ...d.hooves[k], ...patch } },
    }));
  };

  const patch = (p: Partial<ExamDraft>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, ...p }));
  };

  const pickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const photos: Photo[] = [];
      for (const file of Array.from(files)) {
        photos.push(await fileToPhoto(file));
      }
      setDirty(true);
      setDraft((d) => ({ ...d, photos: [...d.photos, ...photos] }));
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "照片处理失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const discardDraft = () => {
    clearExamDraft(horse.id);
    setDraft(prefillFrom(latest));
    setDirty(false);
    setRestored(false);
    notify("info", "已放弃未提交草稿");
  };

  const submit = () => {
    if (!draft.date) {
      notify("error", "请选择检查日期");
      return;
    }
    const exam: Exam = {
      id: uid("e"),
      horseId: horse.id,
      date: draft.date,
      gaitSummary: draft.gaitSummary.trim() || undefined,
      hooves: draft.hooves,
      photos: draft.photos,
      nextRecheck: draft.nextRecheck || undefined,
      note: draft.note.trim() || undefined,
      createdAt: Date.now(),
    };
    let result: { photosDropped: boolean };
    try {
      result = actions.saveExam(exam);
    } catch (e) {
      notify(
        "error",
        e instanceof Error
          ? e.message
          : "保存失败，内容仍保留在表单中，请重试"
      );
      return;
    }
    clearExamDraft(horse.id);
    if (result.photosDropped) {
      notify(
        "error",
        `${horse.code} 的检查与四蹄记录已保存；因浏览器空间不足，本次照片未能存入，请尽快导出备份归档照片。`
      );
    } else {
      notify("success", `${horse.code} 的检查已提交并保存到本机浏览器`);
    }
    onSaved(exam);
  };

  return (
    <Modal
      title={`四蹄检查 · ${horse.code}${horse.name ? " " + horse.name : ""}`}
      subtitle="逐蹄记录蹄形、蹄铁、钉位、磨耗与步态；提交后立刻显示与上次检查的对比"
      onClose={onClose}
      wide
    >
      {restored && (
        <div className="draft-banner">
          <span>
            恢复了 {draft.date} 一份未提交的检查草稿（上次意外关页前已自动暂存）
          </span>
          <button className="btn-mini" onClick={discardDraft}>
            放弃草稿
          </button>
        </div>
      )}

      <div className="exam-meta">
        <label>
          <span>检查日期 *</span>
          <input
            type="date"
            value={draft.date}
            onChange={(e) => patch({ date: e.target.value })}
          />
        </label>
        <label>
          <span>下次复查日期</span>
          <input
            type="date"
            value={draft.nextRecheck}
            onChange={(e) =>
              patch({ nextRecheck: e.target.value })
            }
          />
        </label>
        <label className="grow">
          <span>整体步态概述</span>
          <input
            value={draft.gaitSummary}
            placeholder="如 直线运步正常、右前略紧"
            onChange={(e) =>
              patch({ gaitSummary: e.target.value })
            }
          />
        </label>
      </div>

      <div className="hoof-grid">
        {HOOF_KEYS.map((k) => (
          <HoofCard
            key={k}
            hoofKey={k}
            value={draft.hooves[k]}
            onChange={(hoofPatch) => setHoof(k, hoofPatch)}
          />
        ))}
      </div>

      <div className="photo-block">
        <div className="photo-head">
          <span className="block-label">检查照片与备注</span>
          <button
            className="btn-mini"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "处理中…" : "添加照片"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => pickFiles(e.target.files)}
          />
        </div>
        {draft.photos.length > 0 && (
          <div className="photo-thumbs">
            {draft.photos.map((p) => (
              <div className="photo-thumb" key={p.id}>
                <img src={p.dataUrl} alt={p.caption ?? "检查照片"} />
                <input
                  placeholder="照片说明（选填）"
                  value={p.caption ?? ""}
                  onChange={(e) => {
                    setDirty(true);
                    setDraft((d) => ({
                      ...d,
                      photos: d.photos.map((x) =>
                        x.id === p.id
                          ? { ...x, caption: e.target.value }
                          : x
                      ),
                    }));
                  }}
                />
                <button
                  className="photo-del"
                  onClick={() => {
                    setDirty(true);
                    setDraft((d) => ({
                      ...d,
                      photos: d.photos.filter((x) => x.id !== p.id),
                    }));
                  }}
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
        <textarea
          rows={2}
          placeholder="本次检查总体备注…"
          value={draft.note}
          onChange={(e) => patch({ note: e.target.value })}
        />
      </div>

      <div className="modal-actions">
        <span className="draft-state">
          {!dirty
            ? "填写内容会自动暂存，意外关页可恢复"
            : draftStatus === "pending"
              ? "草稿暂存中…"
              : draftStatus === "full"
                ? "空间不足，草稿未能暂存（提交仍会尝试保存）"
                : "草稿已自动暂存，关页不丢"}
        </span>
        <button onClick={onClose}>取消</button>
        <button className="primary" onClick={submit}>
          提交检查并查看蹄况变化
        </button>
      </div>
    </Modal>
  );
}

function HoofCard({
  hoofKey,
  value,
  onChange,
}: {
  hoofKey: HoofKey;
  value: HoofDetails;
  onChange: (patch: Partial<HoofDetails>) => void;
}) {
  return (
    <section
      className={`hoof-card ${value.abnormalGait ? "hoof-warn" : ""}`}
    >
      <header>
        <h3>{HOOF_LABELS[hoofKey]}</h3>
        <label className="gait-check">
          <input
            type="checkbox"
            checked={value.abnormalGait}
            onChange={(e) =>
              onChange({ abnormalGait: e.target.checked })
            }
          />
          <span>异常步态</span>
        </label>
      </header>
      <label>
        <span>蹄形评估</span>
        <select
          value={value.shape}
          onChange={(e) => onChange({ shape: e.target.value })}
        >
          {SHAPE_OPTIONS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
      <label>
        <span>蹄铁类型</span>
        <select
          value={value.shoeType}
          onChange={(e) => onChange({ shoeType: e.target.value })}
        >
          {SHOE_OPTIONS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
      <label>
        <span>磨耗情况</span>
        <select
          value={value.wear}
          onChange={(e) => onChange({ wear: e.target.value })}
        >
          {WEAR_OPTIONS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </label>
      <label>
        <span>钉位</span>
        <input
          value={value.nailPositions}
          placeholder="如 外侧3钉"
          onChange={(e) => onChange({ nailPositions: e.target.value })}
        />
      </label>
      {value.abnormalGait && (
        <label>
          <span>步态说明</span>
          <input
            value={value.gaitNote ?? ""}
            placeholder="如 落地期偏短、点头"
            onChange={(e) => onChange({ gaitNote: e.target.value })}
          />
        </label>
      )}
      <label>
        <span>该蹄备注</span>
        <input
          value={value.note ?? ""}
          placeholder="裂纹长度、处理方式…"
          onChange={(e) => onChange({ note: e.target.value })}
        />
      </label>
    </section>
  );
}
