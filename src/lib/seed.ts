import {
  type AppState,
  type Exam,
  type HoofMap,
  type Horse,
  type ShoeChange,
} from "../types";
import { addDays, today, uid } from "./utils";

function hoof(
  partial: Partial<HoofMap[keyof HoofMap]>
): HoofMap[keyof HoofMap] {
  return {
    shape: "正常",
    shoeType: "普通钢蹄铁",
    nailPositions: "外侧3钉",
    wear: "正常",
    abnormalGait: false,
    gaitNote: "",
    note: "",
    ...partial,
  };
}

/** 首次打开时铺一批示例档案，让流程一目了然；之后永不重复插入 */
export function buildSeed(): AppState {
  const t = today();
  const oldDate = addDays(t, -40);
  const midDate = addDays(t, -20);

  const h1: Horse = {
    id: uid("h"),
    code: "HORSE-18",
    name: "疾风",
    role: "运动马",
    breed: "荷兰温血",
    notes: "场地障碍，右前蹄重点观察",
    createdAt: Date.now() - 86400000 * 60,
  };
  const h2: Horse = {
    id: uid("h"),
    code: "HORSE-27",
    name: "青峦",
    role: "运动马",
    breed: "盎格鲁-阿拉伯",
    notes: "后蹄角质偏干，裂纹观察中",
    createdAt: Date.now() - 86400000 * 50,
  };
  const h3: Horse = {
    id: uid("h"),
    code: "HORSE-31",
    name: "小步",
    role: "休养马",
    breed: "国产改良马",
    notes: "步态轻微不稳，需教练复核",
    createdAt: Date.now() - 86400000 * 30,
  };

  // HORSE-18：两次检查，可看到右前蹄磨耗变化与蹄铁更换
  const e1old: Exam = {
    id: uid("e"),
    horseId: h1.id,
    date: oldDate,
    gaitSummary: "右前肢运步略紧",
    hooves: {
      LF: hoof({}),
      RF: hoof({ wear: "轻微磨耗", nailPositions: "外侧2钉" }),
      LH: hoof({}),
      RH: hoof({}),
    },
    photos: [],
    nextRecheck: addDays(oldDate, 14),
    note: "初检建档",
    createdAt: Date.now() - 86400000 * 40,
  };
  const e1new: Exam = {
    id: uid("e"),
    horseId: h1.id,
    date: midDate,
    gaitSummary: "运步改善，持续观察右前",
    hooves: {
      LF: hoof({}),
      RF: hoof({
        wear: "外侧偏磨",
        shoeType: "铝蹄铁",
        nailPositions: "外侧3钉",
        note: "外侧支加垫",
      }),
      LH: hoof({}),
      RH: hoof({}),
    },
    photos: [],
    nextRecheck: addDays(t, 5),
    note: "右前换铝蹄铁，14 天后复查",
    createdAt: Date.now() - 86400000 * 20,
  };
  const s1: ShoeChange = {
    id: uid("s"),
    horseId: h1.id,
    date: midDate,
    hoof: "RF",
    fromShoe: "普通钢蹄铁",
    toShoe: "铝蹄铁",
    reason: "步态矫正",
    nailPositions: "外侧3钉",
    note: "右前蹄外侧磨耗，减轻负重",
    createdAt: Date.now() - 86400000 * 20 + 1,
  };

  // HORSE-27：后蹄裂纹，复查已过期
  const e2: Exam = {
    id: uid("e"),
    horseId: h2.id,
    date: addDays(t, -18),
    gaitSummary: "直线运动正常",
    hooves: {
      LF: hoof({}),
      RF: hoof({}),
      LH: hoof({
        shape: "裂纹",
        shoeType: "加护蹄垫",
        note: "蹄壁纵向裂纹约 1.5cm",
      }),
      RH: hoof({ shape: "角质脆弱" }),
    },
    photos: [],
    nextRecheck: addDays(t, -4),
    note: "拍照归档，裂纹加护",
    createdAt: Date.now() - 86400000 * 18,
  };
  const s2: ShoeChange = {
    id: uid("s"),
    horseId: h2.id,
    date: addDays(t, -18),
    hoof: "LH",
    fromShoe: "普通钢蹄铁",
    toShoe: "加护蹄垫",
    reason: "裂纹加护",
    nailPositions: "内侧2钉",
    createdAt: Date.now() - 86400000 * 18 + 1,
  };

  // HORSE-31：异常步态，今天到期复查
  const e3: Exam = {
    id: uid("e"),
    horseId: h3.id,
    date: addDays(t, -14),
    gaitSummary: "快步轻微不稳",
    hooves: {
      LF: hoof({ abnormalGait: true, gaitNote: "落地期偏短" }),
      RF: hoof({ abnormalGait: true, gaitNote: "轻微点头" }),
      LH: hoof({}),
      RH: hoof({}),
    },
    photos: [],
    nextRecheck: t,
    note: "已标记，需教练复核",
    createdAt: Date.now() - 86400000 * 14,
  };

  return {
    horses: [h1, h2, h3],
    exams: [e1old, e1new, e2, e3],
    shoeChanges: [s1, s2],
  };
}
