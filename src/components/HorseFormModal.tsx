import { useState } from "react";
import type { Horse, HorseStatus } from "../lib/domain";
import { HORSE_STATUS_OPTIONS, uid } from "../lib/domain";
import { Field, Modal } from "./ui";

export interface HorseFormValue {
  code: string;
  name: string;
  breed: string;
  status: HorseStatus;
  owner: string;
  note: string;
}

export function HorseFormModal({
  open,
  existing,
  codeExists,
  onClose,
  onSave,
}: {
  open: boolean;
  existing?: Horse;
  codeExists: (code: string, exceptId?: string) => boolean;
  onClose: () => void;
  onSave: (horse: Horse) => void;
}) {
  const [v, setV] = useState<HorseFormValue>(() => ({
    code: existing?.code ?? "",
    name: existing?.name ?? "",
    breed: existing?.breed ?? "",
    status: existing?.status ?? "运动马",
    owner: existing?.owner ?? "",
    note: existing?.note ?? "",
  }));
  const [error, setError] = useState("");

  const set = (k: keyof HorseFormValue, val: string) => {
    setV((s) => ({ ...s, [k]: val }));
    setError("");
  };

  const submit = () => {
    const code = v.code.trim();
    if (!code) {
      setError("请填写马匹编号");
      return;
    }
    if (codeExists(code, existing?.id)) {
      setError(`编号 ${code} 已存在，请直接打开该马档案`);
      return;
    }
    onSave({
      id: existing?.id ?? uid("horse"),
      code,
      name: v.name.trim(),
      breed: v.breed.trim(),
      status: v.status,
      owner: v.owner.trim(),
      note: v.note.trim(),
      createdAt: existing?.createdAt ?? Date.now(),
    });
  };

  return (
    <Modal
      open={open}
      title={existing ? "编辑马匹档案" : "新建马匹档案"}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={submit}>
            保存档案
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="马匹编号" hint="唯一，如 HORSE-18">
          <input
            value={v.code}
            placeholder="HORSE-XX"
            disabled={!!existing}
            onChange={(e) => set("code", e.target.value)}
          />
        </Field>
        <Field label="马名">
          <input value={v.name} placeholder="选填" onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="品种">
          <input value={v.breed} placeholder="如 荷兰温血马" onChange={(e) => set("breed", e.target.value)} />
        </Field>
        <Field label="状态">
          <select value={v.status} onChange={(e) => set("status", e.target.value)}>
            {HORSE_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="负责人 / 马主">
          <input value={v.owner} placeholder="选填" onChange={(e) => set("owner", e.target.value)} />
        </Field>
        <Field label="档案备注" className="full">
          <textarea rows={2} value={v.note} placeholder="旧伤、性情、长期注意事项…" onChange={(e) => set("note", e.target.value)} />
        </Field>
      </div>
      {error && <p className="form-error">{error}</p>}
    </Modal>
  );
}
