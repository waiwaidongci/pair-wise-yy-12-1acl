// Node 冒烟测试：模拟 localStorage，验证 store 的日志/快照持久化与重放
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

// 极简 localStorage mock
class MemoryStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  get size() { return this.m.size; }
}

// 直接内联被测逻辑的最小验证：编译 store.ts 到临时 JS 再 require 比较复杂，
// 这里改为通过 ts transpile 后注入 globals 执行关键函数。
function loadTs(rel, globals) {
  const file = path.join(__dirname, rel);
  const src = fs.readFileSync(file, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: { module: "commonjs", target: "es2020" },
  }).outputText;
  const mod = { exports: {} };
  const fn = new Function(
    "exports", "require", "module", "__dirname",
    ...Object.keys(globals),
    out
  );
  fn(mod.exports, (name) => {
    if (name === "./utils") return globals.__utils;
    if (name === "./seed") return globals.__seed;
    return {};
  }, mod, __dirname, ...Object.values(globals));
  return mod.exports;
}

// 先编译 utils
const utilsSrc = fs.readFileSync(path.join(__dirname, "../src/lib/utils.ts"), "utf8");
const utilsOut = ts.transpileModule(utilsSrc, {
  compilerOptions: { module: "commonjs", target: "es2020" },
}).outputText;
const utilsMod = { exports: {} };
new Function("exports", "module", utilsOut)(utilsMod.exports, utilsMod);

// seed（依赖 types 的类型，transpile 后可忽略）
const seedSrc = fs.readFileSync(path.join(__dirname, "../src/lib/seed.ts"), "utf8");
const seedOut = ts.transpileModule(seedSrc, {
  compilerOptions: { module: "commonjs", target: "es2020", jsx: "react-jsx" },
}).outputText
  .replace(/require\("\.\.\/types"\)/g, "{}");
const seedMod = { exports: {} };
new Function("exports", "module", "require", seedOut)(
  seedMod.exports,
  seedMod,
  (name) => {
    if (name === "./utils" || name === "../lib/utils") return utilsMod.exports;
    return {};
  }
);

const storage = new MemoryStorage();
const localStorage = storage;

const storeMod = loadTs("../src/lib/store.ts", {
  localStorage,
  __utils: utilsMod.exports,
  __seed: seedMod.exports,
});

const assert = require("assert");

// 首次加载：seed 数据
let state = storeMod.store.getState();
assert(state.horses.length === 3, "seed 应有 3 匹马");
const beforeCount = state.horses.length;

// 零提交关页：示例档案已由构造函数写入快照，重开不丢、不重复
const justSeeded = loadTs("../src/lib/store.ts", {
  localStorage,
  __utils: utilsMod.exports,
  __seed: seedMod.exports,
});
assert(
  justSeeded.store.getState().horses.length === 3,
  "未做任何提交就重开，示例档案不能丢"
);

// 模拟“新增一匹马”提交
const h = {
  id: "h_test1", code: "HORSE-99", role: "运动马", createdAt: 123,
};
storeMod.actions.saveHorse(h);
assert(storeMod.store.getState().horses.length === beforeCount + 1);
assert(storage.getItem("farrier.journal.v1").includes("horse-upsert"), "日志应已落盘");
// 快照仅在 seed / 压缩时写入；此时 seed 时已落过快照
assert(storage.getItem("farrier.state.v1"), "seed 时的初始快照应存在");

// 模拟意外关页：重新构造 store（从 localStorage 恢复）
global.localStorage = storage;
const reloaded = loadTs("../src/lib/store.ts", {
  localStorage: storage,
  __utils: utilsMod.exports,
  __seed: seedMod.exports,
});
assert(
  reloaded.store.getState().horses.find((x) => x.id === "h_test1"),
  "重载后新提交的马必须还在"
);
assert(
  reloaded.store.getState().horses.length === beforeCount + 1,
  "重载后不应重复 seed"
);

// 模拟提交检查
const exam = {
  id: "e1", horseId: h.id, date: "2026-09-29",
  hooves: {
    LF: { shape: "正常", shoeType: "普通钢蹄铁", nailPositions: "", wear: "正常", abnormalGait: false },
    RF: { shape: "正常", shoeType: "普通钢蹄铁", nailPositions: "", wear: "正常", abnormalGait: true, gaitNote: "点头" },
    LH: { shape: "正常", shoeType: "普通钢蹄铁", nailPositions: "", wear: "正常", abnormalGait: false },
    RH: { shape: "正常", shoeType: "普通钢蹄铁", nailPositions: "", wear: "正常", abnormalGait: false },
  },
  photos: [], createdAt: 1,
};
reloaded.actions.saveExam(exam);
const reloaded2 = loadTs("../src/lib/store.ts", {
  localStorage: storage,
  __utils: utilsMod.exports,
  __seed: seedMod.exports,
});
assert(reloaded2.store.getState().exams.find((e) => e.id === "e1"), "检查记录重载后仍在");

// 日志容量：压缩逻辑（触发 >=100 事件）
for (let i = 0; i < 105; i++) {
  reloaded2.actions.saveHorse({ id: "h_bulk_" + i, code: "BULK-" + i, role: "运动马", createdAt: i });
}
const journalAfter = JSON.parse(storage.getItem("farrier.journal.v1"));
// 2 个初始事件 + 105 个新事件：达到 100 时压缩一次，之后剩 7 个事件
assert(Array.isArray(journalAfter), "日志应为数组");
assert(journalAfter.length < 100, `压缩后日志应小于阈值，实际 ${journalAfter.length}`);
assert(
  !journalAfter.some((e) => e.event.type === "exam-add"),
  "压缩后旧事件（检查记录）应已并入快照、不在日志里"
);
const snap = JSON.parse(storage.getItem("farrier.state.v1"));
// 压缩点把当时已累积的事件并入快照：BULK-97 是第 100 条事件（seq 99）
assert(snap.state.horses.find((x) => x.code === "BULK-97"), "快相应包含压缩点最后并入的数据");
assert(!snap.state.horses.find((x) => x.code === "BULK-104"), "压缩后提交的数据应在日志而非旧快照里");
assert(snap.state.horses.find((x) => x.code === "HORSE-99"), "快相应包含压缩前较早的数据");
assert(snap.state.exams.find((e) => e.id === "e1"), "快相应包含压缩前的检查记录");

// 压缩后再恢复
const reloaded3 = loadTs("../src/lib/store.ts", {
  localStorage: storage,
  __utils: utilsMod.exports,
  __seed: seedMod.exports,
});
assert(reloaded3.store.getState().horses.find((x) => x.code === "BULK-104"), "压缩+重载后数据完整");
assert(reloaded3.store.getState().exams.find((e) => e.id === "e1"), "压缩+重载后检查记录完整");

// 存储写满：commit 必须抛错且状态/日志保持可用
const failStorage = new MemoryStorage();
failStorage.setItem = function () {
  const err = new Error("QuotaExceededError");
  err.name = "QuotaExceededError";
  throw err;
};
const failStore = loadTs("../src/lib/store.ts", {
  localStorage: failStorage,
  __utils: utilsMod.exports,
  __seed: seedMod.exports,
});
let threw = false;
try {
  failStore.actions.saveHorse({ id: "hx", code: "X", role: "运动马", createdAt: 1 });
} catch (e) { threw = true; }
assert(threw, "空间不足时必须抛错，不能假报成功");

// bulk-import 幂等：重复导入同样 id 不产生重复
const payload = {
  horses: [{ id: "imp1", code: "IMP-1", role: "休养马", createdAt: 1 }],
  exams: [], shoeChanges: [],
};
reloaded3.actions.bulkImport(payload);
const n1 = reloaded3.store.getState().horses.length;
reloaded3.actions.bulkImport(payload);
const n2 = reloaded3.store.getState().horses.length;
assert(n1 === n2, "bulk-import 同 id 幂等");

console.log("全部持久化断言通过 ✓");
