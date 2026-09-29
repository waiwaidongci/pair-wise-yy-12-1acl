import { useEffect, useRef, useState } from "react";
import {
  HOOF_KEYS,
  HOOF_LABELS,
  SHOE_OPTIONS,
  SHOE_REASONS,
  type Horse,
  type ShoeChange,
  type ShoeDraft,
  type ShoeTarget,
} from "../types";
import { actions } from "../lib/store";
import {
  clearShoeDraft,
  loadShoeDraft,
  newShoeDraft,
  saveShoeDraft,
} from "../lib/drafts";
import { uid } from "../lib/utils";
import { Modal } from "./Modal";

export function ShoeFormModal({
  horse,
  onClose,
  onSaved,
  notify,
}: {
  horse: Horse;
  onClose: () => void;
  onSaved: (change: ShoeChange) => void;
  notify: (kind: "success" | "error" | "info", msg: string) => void;
}) {
  const [draft, setDraft] = useState<ShoeDraft>(() => newShoeDraft());
  const [dirty, setDirty] = useState(false);
  const [restored, setRestored] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const stored = loadShoeDraft(horse.id);
    if (stored) {
      setDraft(stored);
      setRestored(true);
    }
  }, [horse.id]);

  useEffect(() => {
    if (!dirty) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      saveShoeDraft(horse.id, draft);
    }, 500);
    return () => window.clearTimeout(timer.current);
  }, [draft, dirty, horse.id]);

  const patch = (p: Partial<ShoeDraft>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, ...p }));
  };

  const submit = () => {
    if (!draft.date) {
      notify("error", "请选择更换日期");
      return;
    }
    if (!draft.toShoe.trim()) {
      notify("error", "请填写更换后的蹄铁类型");
      return;
    }
    const change: ShoeChange = {
      id: uid("s"),
      horseId: horse.id,
      date: draft.date,
      hoof: draft.hoof,
      fromShoe: draft.fromShoe.trim() || undefined,
      toShoe: draft.toShoe.trim(),
      reason: draft.reason.trim() || undefined,
      nailPositions: draft.nailPositions.trim() || undefined,
      note: draft.note.trim() || undefined,
      createdAt: Date.now(),
    };
    try {
      actions.saveShoe(change);
    } catch (e) {
      notify(
        "error",
        e instanceof Error
          ? e.message
          : "保存失败，内容仍保留在表单中，请重试"
      );
      return;
    }
    clearShoeDraft(horse.id);
    notify("success", `已登记 ${horse.code} 的蹄铁更换，可在历史中追溯`);
    onSaved(change);
  };

  const discard = () => {
    clearShoeDraft(horse.id);
    setDraft(newShoeDraft());
    setDirty(false);
    setRestored(false);
  };

  return (
    <Modal
      title={`蹄铁更换登记 · ${horse.code}${horse.name ? " " + horse.name : ""}`}
      subtitle="每次换蹄都单独入账，形成可追溯的更换历史"
      onClose={onClose}
    >
      {restored && (
        <div className="draft-banner">
          <span>恢复了一份未提交的换蹄登记草稿（关页前已自动暂存）</span>
          <button className="btn-mini" onClick={discard}>
            放弃草稿
          </button>
        </div>
      )}
      <div className="form-stack">
        <div className="field-grid">
          <label>
            <span>更换日期 *</span>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => patch({ date: e.target.value })}
            />
          </label>
          <label>
            <span>更换蹄位</span>
            <select
              value={draft.hoof}
              onChange={(e) =>
                patch({ hoof: e.target.value as ShoeTarget })
              }
            >
              <option value="ALL">四蹄整体更换</option>
              {HOOF_KEYS.map((k) => (
                <option key={k} value={k}>
                  {HOOF_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>原蹄铁类型</span>
            <input
              list="shoe-options"
              value={draft.fromShoe}
              placeholder="如 普通钢蹄铁"
              onChange={(e) =>
                patch({ fromShoe: e.target.value })
              }
            />
          </label>
          <label>
            <span>更换为 *</span>
            <input
              list="shoe-options"
              value={draft.toShoe}
              onChange={(e) => patch({ toShoe: e.target.value })}
            />
          </label>
          <label>
            <span>更换原因</span>
            <input
              list="shoe-reasons"
              value={draft.reason}
              onChange={(e) => patch({ reason: e.target.value })}
            />
          </label>
          <label>
            <span>钉位</span>
            <input
              value={draft.nailPositions}
              placeholder="如 外侧3钉"
              onChange={(e) =>
                patch({ nailPositions: e.target.value })
              }
            />
          </label>
        </div>
        <label>
          <span>备注</span>
          <textarea
            rows={2}
            value={draft.note}
            placeholder="磨耗情况、矫正思路、注意事项…"
            onChange={(e) => patch({ note: e.target.value })}
          />
        </label>
        <datalist id="shoe-options">
          {SHOE_OPTIONS.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
        <datalist id="shoe-reasons">
          {SHOE_REASONS.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={submit}>
            登记更换并写入历史
          </button>
        </div>
      </div>
    </Modal>
  );
}
