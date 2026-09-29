import {
  HOOF_KEYS,
  HOOF_LABELS,
  type HoofDetails,
  type HoofKey,
  type HoofMap,
} from "../types";

export type ChangeKind = "better" | "worse" | "neutral";

export interface FieldChange {
  field: string;
  before: string;
  after: string;
  kind: ChangeKind;
}

export type GaitChange = "new" | "persist" | "resolved" | "none";

export interface HoofChange {
  hoof: HoofKey;
  label: string;
  fields: FieldChange[];
  gait: GaitChange;
}

const BAD_VALUES = ["裂纹", "崩损", "感染迹象", "白线异常", "过度磨耗"];
const GOOD_VALUES = ["正常"];

/**
 * 评估字段变化方向：
 * 含“裂纹/崩损/感染/过度磨耗”视为变差，恢复到“正常”视为好转。
 */
function classify(before: string, after: string): ChangeKind {
  if (before === after) return "neutral";
  const wasBad = BAD_VALUES.some((v) => before.includes(v));
  const nowBad = BAD_VALUES.some((v) => after.includes(v));
  const nowGood = GOOD_VALUES.some((v) => after.includes(v));
  if (wasBad && nowGood && !nowBad) return "better";
  if (!wasBad && nowBad) return "worse";
  return "neutral";
}

const TEXT_FIELDS: { key: keyof HoofDetails; label: string }[] = [
  { key: "shape", label: "蹄形评估" },
  { key: "shoeType", label: "蹄铁类型" },
  { key: "wear", label: "磨耗情况" },
  { key: "nailPositions", label: "钉位" },
];

const txt = (v: unknown) => (v ?? "").toString().trim();

function gaitOf(before: HoofDetails, after: HoofDetails): GaitChange {
  if (before.abnormalGait && after.abnormalGait) return "persist";
  if (!before.abnormalGait && after.abnormalGait) return "new";
  if (before.abnormalGait && !after.abnormalGait) return "resolved";
  return "none";
}

/** 与上一次检查逐蹄逐字段对比 */
export function compareExams(
  before: HoofMap | undefined,
  after: HoofMap
): HoofChange[] {
  return HOOF_KEYS.map((h): HoofChange => {
    const a = after[h];
    // 首次检查：字段以“首次记录”为基线展示
    if (!before) {
      const fields: FieldChange[] = [
        {
          field: "蹄形评估",
          before: "首次记录",
          after: txt(a.shape) || "—",
          kind: classify("正常", a.shape),
        },
        {
          field: "蹄铁类型",
          before: "首次记录",
          after: txt(a.shoeType) || "—",
          kind: "neutral",
        },
      ];
      if (txt(a.wear) && a.wear !== "正常") {
        fields.push({
          field: "磨耗情况",
          before: "首次记录",
          after: a.wear,
          kind: classify("正常", a.wear),
        });
      }
      return {
        hoof: h,
        label: HOOF_LABELS[h],
        fields,
        gait: a.abnormalGait ? "new" : "none",
      };
    }

    const b = before[h];
    const fields: FieldChange[] = [];
    for (const f of TEXT_FIELDS) {
      const pv = txt(b[f.key]);
      const nv = txt(a[f.key]);
      if (pv !== nv) {
        fields.push({
          field: f.label,
          before: pv || "（空）",
          after: nv || "（空）",
          // 蹄铁与钉位属于操作记录，只展示变化，不判好坏
          kind:
            f.key === "shoeType" || f.key === "nailPositions"
              ? "neutral"
              : classify(pv, nv),
        });
      }
    }
    if (txt(b.note) !== txt(a.note)) {
      fields.push({
        field: "备注",
        before: txt(b.note) || "（空）",
        after: txt(a.note) || "（空）",
        kind: "neutral",
      });
    }
    return {
      hoof: h,
      label: HOOF_LABELS[h],
      fields,
      gait: gaitOf(b, a),
    };
  });
}

export function hasAbnormalGait(hooves: HoofMap): boolean {
  return HOOF_KEYS.some((h) => hooves[h].abnormalGait);
}
