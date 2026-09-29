import { useEffect, useMemo, useRef, useState } from "react";
import {
  BALANCE_OPTIONS,
  GAIT_OPTIONS,
  HOOF_ISSUE_OPTIONS,
  HOOF_LABEL,
  HOOF_SHAPE_OPTIONS,
  HOOVES,
  SHOE_TYPE_OPTIONS,
  addDays,
  diffEntries,
  emptyHoofMap,
  today,
  uid,
  type Hoof,
  type HoofState,
  type Horse,
  type ShoeChange,
  type WorkEntry,
} from "../lib/domain";
import { clearDraft, loadDraft, saveDraft, type Draft } from "../lib/storage";
import { readPhotoFile } from "../lib/photo";
import { Badge } from "./ui";

export interface WorkFormState {
  date: string;
  gait: string;
  gaitNote: string;
  gaitAbnormal: boolean;
  hooves: Record<Hoof, HoofState>;
  shoeChanges: ShoeChange[];
  nextReview: string;
  note: string;
  photoData: string;
  photoCaption: string;
  farrier: string;
}

export function blankForm(): WorkFormState {
  return {
    date: today(),
    gait: "",
    gaitNote: "",
    gaitAbnormal: false,
    hooves: emptyHoofMap(),
    shoeChanges: [],
    nextReview: "",
    note: "",
    photoData: "",
    photoCaption: "",
    farrier: "",
  };
}

export function formToEntry(s: WorkFormState, horseId: string): WorkEntry {
  return {
    id: uid("ent"),
    horseId,
    date: s.date,
    gait: s.gait,
    gaitNote: s.gaitNote,
    gaitAbnormal: s.gaitAbnormal || (!!s.gait && s.gait !== "正常"),
    hooves: s.hooves,
    shoeChanges: s.shoeChanges,
    nextReview: s.nextReview,
    note: s.note,
    photoData: s.photoData,
    photoCaption: s.photoCaption,
    farrier: s.farrier,
    createdAt: Date.now(),
  };
}

function isMeaningful(s: WorkFormState): boolean {
  return (
    !!s.gait ||
    !!s.gaitNote ||
    !!s.note ||
    !!s.farrier ||
    !!s.photoData ||
    s.shoeChanges.length > 0 ||
    HOOVES.some((h) => s.hooves[h].shape || s.hooves[h].balance || s.hooves[h].issues.length > 0 || s.hooves[h].note)
  );
}

export function WorkForm({
  horse,
  prevEntry,
  currentShoes,
  onCancel,
  onSubmit,
}: {
  horse: Horse;
  prevEntry?: WorkEntry;
  currentShoes: Partial<Record<Hoof, ShoeChange>>;
  onCancel: () => void;
  onSubmit: (entry: WorkEntry) => void;
}) {
  const [draft] = useState<Draft | null>(() => loadDraft(horse.id));
  const [state, setState] = useState<WorkFormState>(() =>
    draft ? { ...blankForm(), ...(draft.form as Partial<WorkFormState>) } : blankForm(),
  );
  const [showRestored, setShowRestored] = useState(!!draft);
  const [error, setError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const meaningful = isMeaningful(state);

  // 草稿自动保存（防抖），意外关页后可恢复
  useEffect(() => {
    window.clearTimeout(saveTimer.current);
    if (!meaningful) return;
    saveTimer.current = window.setTimeout(() => saveDraft(horse.id, state), 500);
    return () => window.clearTimeout(saveTimer.current);
  }, [state, horse.id, meaningful]);

  // 有未保存内容时，关页给出提醒
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (meaningful) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [meaningful]);

  const patch = (p: Partial<WorkFormState>) => setState((s) => ({ ...s, ...p }));

  const patchHoof = (hoof: Hoof, p: Partial<HoofState>) =>
    setState((s) => ({ ...s, hooves: { ...s.hooves, [hoof]: { ...s.hooves[hoof], ...p } } }));

  const toggleIssue = (hoof: Hoof, issue: string) =>
    setState((s) => {
      const cur = s.hooves[hoof].issues;
      const issues = cur.includes(issue) ? cur.filter((i) => i !== issue) : [...cur, issue];
      return { ...s, hooves: { ...s.hooves, [hoof]: { ...s.hooves[hoof], issues } } };
    });

  const addShoeChange = (hoof: Hoof) => {
    const exist = state.shoeChanges.find((c) => c.hoof === hoof);
    if (exist) return;
    setState((s) => ({
      ...s,
      shoeChanges: [
        ...s.shoeChanges,
        { hoof, oldShoe: currentShoes[hoof]?.newShoe ?? "", newShoe: "", nails: "", reason: "" },
      ],
    }));
  };

  const patchChange = (hoof: Hoof, p: Partial<ShoeChange>) =>
    setState((s) => ({
      ...s,
      shoeChanges: s.shoeChanges.map((c) => (c.hoof === hoof ? { ...c, ...p } : c)),
    }));

  const removeChange = (hoof: Hoof) =>
    setState((s) => ({ ...s, shoeChanges: s.shoeChanges.filter((c) => c.hoof !== hoof) }));

  const onPhoto = async (file?: File) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await readPhotoFile(file);
      patch({ photoData: dataUrl });
    } catch {
      setError("照片读取失败，请换一张试试");
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // 用当前表单内容与上次记录实时对比
  const diff = useMemo(() => {
    const candidate = formToEntry(state, horse.id);
    return diffEntries(prevEntry, candidate);
  }, [state, prevEntry, horse.id]);

  const submit = () => {
    if (!state.date) {
      setError("请选择修蹄日期");
      return;
    }
    if (!isMeaningful(state)) {
      setError("请至少填写步态或一蹄的检查内容后再提交");
      return;
    }
    const badChange = state.shoeChanges.find((c) => !c.newShoe);
    if (badChange) {
      setError(`请补全${HOOF_LABEL[badChange.hoof]}的新蹄铁类型`);
      return;
    }
    clearDraft(horse.id);
    onSubmit(formToEntry(state, horse.id));
  };

  return (
    <div className="work-form">
      {showRestored && draft && (
        <div className="draft-banner">
          <span>
            已恢复 {new Date(draft.savedAt).toLocaleString("zh-CN", { hour12: false })} 未提交的草稿
          </span>
          <span className="draft-actions">
            <button
              onClick={() => {
                setState(blankForm());
                clearDraft(horse.id);
                setShowRestored(false);
              }}
            >
              丢弃草稿
            </button>
            <button className="primary" onClick={() => setShowRestored(false)}>
              继续填写
            </button>
          </span>
        </div>
      )}

      <div className="form-grid">
        <label className="field">
          <span className="field-label">修蹄日期</span>
          <input type="date" value={state.date} onChange={(e) => patch({ date: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">蹄铁师</span>
          <input value={state.farrier} placeholder="签名" onChange={(e) => patch({ farrier: e.target.value })} />
        </label>
      </div>

      {/* 步态 */}
      <section className="subpanel">
        <div className="subpanel-head">
          <h4>步态检查</h4>
          {diff.gaitChanged ? (
            <Badge tone="warn">
              步态变化：{diff.gaitChanged.from} → {diff.gaitChanged.to}
            </Badge>
          ) : prevEntry?.gait ? (
            <Badge tone="muted">上次：{prevEntry.gait}</Badge>
          ) : null}
        </div>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">本次步态</span>
            <select value={state.gait} onChange={(e) => patch({ gait: e.target.value })}>
              <option value="">请选择</option>
              {GAIT_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">步态描述 / 异常表现</span>
            <input value={state.gaitNote} placeholder="如：硬地右转时点头" onChange={(e) => patch({ gaitNote: e.target.value })} />
          </label>
        </div>
        <label className="check-line">
          <input
            type="checkbox"
            checked={state.gaitAbnormal}
            onChange={(e) => patch({ gaitAbnormal: e.target.checked })}
          />
          <span>标记为异常步态（选非“正常”时会自动标记，可手动覆盖）</span>
        </label>
      </section>

      {/* 四蹄检查 */}
      <section className="subpanel">
        <div className="subpanel-head">
          <h4>左右前后蹄检查</h4>
          <span className="subpanel-tip">填到哪项就与上次记录对比哪项，变化即时显示在卡片上</span>
        </div>
        <div className="hoof-grid">
          {HOOVES.map((hoof) => {
            const h = state.hooves[hoof];
            const ph = prevEntry?.hooves[hoof];
            const d = diff.perHoof[hoof];
            const change = state.shoeChanges.find((c) => c.hoof === hoof);
            const wearing = currentShoes[hoof]?.newShoe;
            return (
              <article key={hoof} className={"hoof-card" + (d.hasChange ? " changed" : "")}>
                <header>
                  <div className="hoof-title">
                    {HOOF_LABEL[hoof]}
                    {wearing && <Badge tone="info">现穿：{wearing}</Badge>}
                  </div>
                  {ph && (
                    <div className="hoof-prev">
                      上次：{[ph.shape, ph.balance, ...ph.issues].filter(Boolean).join("、") || "无记录"}
                    </div>
                  )}
                </header>

                {d.hasChange && (
                  <ul className="diff-list">
                    {d.shapeChanged && (
                      <li className="diff-chg">蹄形 {d.shapeChanged.from} → {d.shapeChanged.to}</li>
                    )}
                    {d.addedIssues.map((i) => (
                      <li key="a" className="diff-new">新增：{i}</li>
                    ))}
                    {d.resolvedIssues.map((i) => (
                      <li key="r" className="diff-ok">消除：{i}</li>
                    ))}
                    {d.shoeChanged && (
                      <li className="diff-chg">换蹄 {d.shoeChanged.from} → {d.shoeChanged.to}</li>
                    )}
                  </ul>
                )}

                <div className="hoof-fields">
                  <label className="field">
                    <span className="field-label">蹄形评估</span>
                    <select value={h.shape} onChange={(e) => patchHoof(hoof, { shape: e.target.value })}>
                      <option value="">未评估</option>
                      {HOOF_SHAPE_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">均衡度</span>
                    <select value={h.balance} onChange={(e) => patchHoof(hoof, { balance: e.target.value })}>
                      <option value="">未评估</option>
                      {BALANCE_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="issue-chips">
                  {HOOF_ISSUE_OPTIONS.map((issue) => (
                    <button
                      type="button"
                      key={issue}
                      className={"chip" + (h.issues.includes(issue) ? " on" : "")}
                      onClick={() => toggleIssue(hoof, issue)}
                    >
                      {issue}
                    </button>
                  ))}
                </div>
                <input
                  className="hoof-note"
                  placeholder="该蹄备注（裂纹位置、处理手法…）"
                  value={h.note}
                  onChange={(e) => patchHoof(hoof, { note: e.target.value })}
                />

                {change ? (
                  <div className="shoe-edit">
                    <div className="shoe-edit-head">
                      <b>登记换蹄</b>
                      <button type="button" className="link-danger" onClick={() => removeChange(hoof)}>
                        撤销
                      </button>
                    </div>
                    <div className="shoe-row">
                      <label className="field">
                        <span className="field-label">旧蹄铁</span>
                        <input value={change.oldShoe} placeholder="原蹄铁类型" onChange={(e) => patchChange(hoof, { oldShoe: e.target.value })} />
                      </label>
                      <label className="field">
                        <span className="field-label">新蹄铁</span>
                        <select value={change.newShoe} onChange={(e) => patchChange(hoof, { newShoe: e.target.value })}>
                          <option value="">请选择</option>
                          {SHOE_TYPE_OPTIONS.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="field">
                      <span className="field-label">钉位</span>
                      <input value={change.nails} placeholder="如 外7内6" onChange={(e) => patchChange(hoof, { nails: e.target.value })} />
                    </label>
                    <label className="field">
                      <span className="field-label">更换原因</span>
                      <input value={change.reason} placeholder="如 磨损超限 / 矫正需要" onChange={(e) => patchChange(hoof, { reason: e.target.value })} />
                    </label>
                  </div>
                ) : (
                  <button type="button" className="add-shoe" onClick={() => addShoeChange(hoof)}>
                    + 此蹄更换蹄铁
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* 复查 + 照片 + 备注 */}
      <section className="subpanel">
        <div className="subpanel-head">
          <h4>复查提醒与备注</h4>
        </div>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">下次复查日期</span>
            <input type="date" value={state.nextReview} onChange={(e) => patch({ nextReview: e.target.value })} />
          </label>
          <div className="quick-days">
            <span className="field-label">快捷</span>
            <div>
              {[7, 14, 30].map((d) => (
                <button key={d} type="button" onClick={() => patch({ nextReview: addDays(state.date || today(), d) })}>
                  +{d} 天
                </button>
              ))}
              <button type="button" onClick={() => patch({ nextReview: "" })}>
                清除
              </button>
            </div>
          </div>
        </div>
        <label className="field">
          <span className="field-label">总体备注</span>
          <textarea rows={2} value={state.note} placeholder="本次处理总结、给教练的建议…" onChange={(e) => patch({ note: e.target.value })} />
        </label>

        <div className="photo-box">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onPhoto(e.target.files?.[0])}
          />
          {state.photoData ? (
            <div className="photo-preview">
              <img src={state.photoData} alt="蹄部照片" />
              <div className="photo-side">
                <input
                  placeholder="照片说明（如 右前裂纹近照）"
                  value={state.photoCaption}
                  onChange={(e) => patch({ photoCaption: e.target.value })}
                />
                <div className="photo-actions">
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={photoBusy}>
                    {photoBusy ? "处理中…" : "更换照片"}
                  </button>
                  <button type="button" className="link-danger" onClick={() => patch({ photoData: "", photoCaption: "" })}>
                    删除
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button type="button" className="photo-add" onClick={() => fileRef.current?.click()} disabled={photoBusy}>
              {photoBusy ? "处理中…" : "📷 添加蹄部照片（自动压缩后存入本机）"}
            </button>
          )}
        </div>
      </section>

      {error && <p className="form-error">{error}</p>}
      <div className="form-foot">
        <span className="save-hint">提交后立即写入当前浏览器，意外关闭页面也不会丢失</span>
        <div>
          <button onClick={onCancel}>取消</button>
          <button className="primary" onClick={submit}>
            提交记录
          </button>
        </div>
      </div>
    </div>
  );
}
