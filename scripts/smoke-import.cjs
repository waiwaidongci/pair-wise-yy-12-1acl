// 备份导入冲突处理冒烟测试
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const assert = require("assert");

function loadTsModule(rel, requireMap = {}) {
  const file = path.join(__dirname, rel);
  const src = fs.readFileSync(file, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: { module: "commonjs", target: "es2020" },
  }).outputText;
  const mod = { exports: {} };
  const req = (name) => {
    if (requireMap[name]) return requireMap[name];
    throw new Error("unexpected require " + name);
  };
  new Function("exports", "require", "module", out)(mod.exports, req, mod);
  return mod.exports;
}

let counter = 0;
const backup = loadTsModule("../src/lib/backup.ts", {
  "./selectors": {
    findHorseByCode: (state, code) =>
      state.horses.find(
        (h) => h.code.trim().toLowerCase() === code.trim().toLowerCase()
      ),
  },
  "./utils": {
    uid: (p) => `${p}_${++counter}`,
    toDateStr: () => "2026-09-29",
  },
});

// 现有档案：HORSE-18 已有 1 条检查
const current = {
  horses: [{ id: "h18", code: "HORSE-18", name: "疾风", role: "运动马", createdAt: 1 }],
  exams: [
    {
      id: "curE",
      horseId: "h18",
      date: "2026-08-01",
      gaitSummary: "",
      note: "",
      hooves: { LF: { a: 1 }, RF: {}, LH: {}, RH: {} },
      photos: [],
      createdAt: 1,
    },
  ],
  shoeChanges: [],
};

// 旧备份：同编号 HORSE-18（备份内 id 为旧 id）+ 全新 HORSE-50
const parsed = {
  horses: [
    { id: "old18", code: "horse-18", name: "旧备份里的名字", role: "运动马", createdAt: 2 },
    { id: "old50", code: "HORSE-50", name: "新马", role: "休养马", createdAt: 3 },
  ],
  exams: [
    // 属于旧 HORSE-18 的两条历史
    {
      id: "oldE1", horseId: "old18", date: "2026-07-01",
      gaitSummary: "", note: "", hooves: {}, photos: [], createdAt: 2,
    },
    {
      id: "oldE2", horseId: "old18", date: "2026-07-15",
      gaitSummary: "", note: "", hooves: {}, photos: [], createdAt: 3,
    },
    // 新马的检查
    {
      id: "oldE3", horseId: "old50", date: "2026-07-20",
      gaitSummary: "", note: "", hooves: {}, photos: [], createdAt: 4,
    },
  ],
  shoeChanges: [
    {
      id: "oldS1", horseId: "old18", date: "2026-07-01",
      hoof: "RF", fromShoe: "钢", toShoe: "铝", createdAt: 2,
    },
  ],
  exportedAt: "2026-09-01T00:00:00.000Z",
};

// 场景一：同编号选择“并入历史”
{
  const plan = backup.analyzeImport(current, parsed);
  assert.strictEqual(plan.conflicts.length, 1, "HORSE-18 应识别为冲突");
  assert.strictEqual(plan.newHorses.length, 1, "HORSE-50 应识别为新马");
  assert.strictEqual(plan.conflicts[0].choice, "merge", "默认并入历史");
  assert.strictEqual(plan.conflicts[0].examCount, 2, "冲突行显示备份内检查数");
  assert.strictEqual(plan.conflicts[0].shoeCount, 1);

  const payload = backup.buildImportPayload(current, plan);
  // 并入：旧马 id 不新增（horses 里只有新马）
  assert.strictEqual(payload.horses.length, 1);
  assert.strictEqual(payload.horses[0].code, "HORSE-50");
  assert.notStrictEqual(payload.horses[0].id, "old50", "新马应分配新 id");

  // HORSE-18 的 2 条检查挂到现有 h18，HORSE-50 的 1 条挂到新 id
  const for18 = payload.exams.filter((e) => e.horseId === "h18");
  assert.strictEqual(for18.length, 2, "旧检查应挂到现有马 h18");
  const for50 = payload.exams.filter((e) => e.horseId === payload.horses[0].id);
  assert.strictEqual(for50.length, 1);
  assert.ok(payload.exams.every((e) => e.id !== "oldE1"), "所有导入检查重新分配 id");
  assert.strictEqual(
    payload.shoeChanges[0].horseId, "h18", "换蹄历史挂到现有马"
  );
}

// 场景二：同编号选择“保留现有记录”
{
  const plan = backup.analyzeImport(current, parsed);
  plan.conflicts[0].choice = "keep";
  const payload = backup.buildImportPayload(current, plan);
  assert.strictEqual(payload.horses.length, 1, "只导入新马");
  assert.strictEqual(
    payload.exams.filter((e) => e.horseId === "h18").length,
    0,
    "保留现有时跳过该马全部检查"
  );
  assert.strictEqual(
    payload.shoeChanges.filter((s) => s.horseId === "h18").length,
    0,
    "保留现有时跳过该马换蹄历史"
  );
  assert.strictEqual(payload.exams.length, 1, "仅保留新马的检查");
}

// 场景三：重复并入同样的备份两次 -> 第二次全部去重
{
  const plan1 = backup.analyzeImport(current, parsed);
  const p1 = backup.buildImportPayload(current, plan1);
  // 模拟第一次导入后的 current（把 payload 合入）
  const after1 = {
    horses: [...current.horses, ...p1.horses],
    exams: [...current.exams, ...p1.exams],
    shoeChanges: [...current.shoeChanges, ...p1.shoeChanges],
  };
  // 第二次导入：HORSE-50 也成了“现有同编号”
  const plan2 = backup.analyzeImport(after1, parsed);
  assert.strictEqual(plan2.conflicts.length, 2, "两匹马都冲突");
  plan2.conflicts.forEach((c) => (c.choice = "merge"));
  const p2 = backup.buildImportPayload(after1, plan2);
  assert.strictEqual(p2.exams.length, 0, "重复检查应全部去重");
  assert.strictEqual(p2.shoeChanges.length, 0, "重复换蹄应全部去重");
  assert.strictEqual(p2.horses.length, 0, "无新马");
}

// 格式校验
assert.throws(
  () => backup.parseBackupText("{bad json"),
  /不是有效的 JSON/
);
assert.throws(
  () => backup.parseBackupText(JSON.stringify({ hello: 1 })),
  /无法识别的备份格式/
);
const parsedOk = backup.parseBackupText(
  JSON.stringify({
    format: "farrier-backup",
    version: 1,
    exportedAt: "2026-09-01",
    state: {
      horses: [{ id: "x", code: "X", role: "运动马", createdAt: 1 }],
      exams: [],
      shoeChanges: [],
    },
  })
);
assert.strictEqual(parsedOk.horses.length, 1);

console.log("备份导入冲突逻辑全部断言通过 ✓");
