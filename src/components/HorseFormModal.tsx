import { useState } from "react";
import {
  HORSE_ROLES,
  type Horse,
} from "../types";
import { actions } from "../lib/store";
import { uid } from "../lib/utils";
import { Modal } from "./Modal";

export function HorseFormModal({
  horse,
  existingCodes,
  onClose,
  onSaved,
}: {
  horse?: Horse;
  existingCodes: string[];
  onClose: () => void;
  onSaved: (h: Horse) => void;
}) {
  const editing = !!horse;
  const [code, setCode] = useState(horse?.code ?? "");
  const [name, setName] = useState(horse?.name ?? "");
  const [role, setRole] = useState<Horse["role"]>(horse?.role ?? "运动马");
  const [breed, setBreed] = useState(horse?.breed ?? "");
  const [notes, setNotes] = useState(horse?.notes ?? "");
  const [error, setError] = useState("");

  const submit = () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("请填写马匹编号");
      return;
    }
    const duplicated = existingCodes.some(
      (c) => c.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicated) {
      setError(`编号 ${trimmed} 已存在，请更换或直接打开该档案`);
      return;
    }
    const saved: Horse = {
      id: horse?.id ?? uid("h"),
      code: trimmed,
      name: name.trim() || undefined,
      role,
      breed: breed.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: horse?.createdAt ?? Date.now(),
    };
    actions.saveHorse(saved);
    onSaved(saved);
  };

  return (
    <Modal
      title={editing ? "编辑马匹档案" : "新建马匹档案"}
      subtitle={
        editing
          ? `档案编号 ${horse!.code}，修改即时保存`
          : "先建档，再做左右前后蹄检查与换蹄登记"
      }
      onClose={onClose}
    >
      <div className="form-stack">
        <div className="field-grid">
          <label>
            <span>马匹编号 *</span>
            <input
              value={code}
              placeholder="如 HORSE-38"
              disabled={editing}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label>
            <span>马名</span>
            <input
              value={name}
              placeholder="选填"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            <span>用途分类</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Horse["role"])}
            >
              {HORSE_ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            <span>品种</span>
            <input
              value={breed}
              placeholder="如 荷兰温血"
              onChange={(e) => setBreed(e.target.value)}
            />
          </label>
        </div>
        <label>
          <span>档案备注</span>
          <textarea
            rows={3}
            value={notes}
            placeholder="跛足史、蹄质特点、注意事项…"
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button onClick={onClose}>取消</button>
          <button className="primary" onClick={submit}>
            {editing ? "保存修改" : "建立档案"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
