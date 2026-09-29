// jsdom 集成测试：加载真实构建产物，模拟蹄铁师完整操作流程
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(__dirname, "dist/index.html"), "utf8");
const bundleName = html.match(/src="\/?(assets\/[^"]+\.js)"/)[1];
const bundle = readFileSync(path.join(__dirname, "dist", bundleName), "utf8");

const results = [];
const ok = (name, cond) => results.push([name, !!cond]);

function makeDom(preloadStorage) {
  const dom = new JSDOM('<!doctype html><html lang="zh-CN"><body><div id="root"></div></body></html>', {
    url: "http://localhost:62011/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  window.scrollTo = () => {};
  if (preloadStorage) {
    for (const [k, v] of Object.entries(preloadStorage)) window.localStorage.setItem(k, v);
  }
  const errs = [];
  window.addEventListener("error", (e) => errs.push(e.message));
  window.eval(bundle);
  return { dom, window, errs };
}

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

const byText = (win, selector, text) =>
  [...win.document.querySelectorAll(selector)].find((el) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes(text)),
  );
const byDeepText = (win, selector, text) =>
  [...win.document.querySelectorAll(selector)].find((el) => el.textContent.includes(text));
const allText = (win, text) =>
  [...win.document.querySelectorAll("*")].filter((el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes(text)));
const click = (win, el) => {
  if (!el) { results.push(["[点击目标缺失]", false]); return; }
  el.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
};
const setValue = (win, el, val) => {
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
  desc.set.call(el, val);
  el.dispatchEvent(new win.Event("input", { bubbles: true }));
};
const setSelect = (win, el, val) => {
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
  desc.set.call(el, val);
  el.dispatchEvent(new win.Event("change", { bubbles: true }));
};
const setCheck = (win, el, val) => {
  el.checked = val;
  el.dispatchEvent(new win.Event("click", { bubbles: true }));
};
const setFileInput = (win, input, file) => {
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new win.Event("change", { bubbles: true }));
};

const BACKUP_31_88 = JSON.stringify({
  version: 1,
  horses: [
    { id: "bx31", code: "HORSE-31", name: "", breed: "", status: "运动马", owner: "", note: "", createdAt: 5 },
    { id: "b88", code: "HORSE-88", name: "备份新来的", breed: "", status: "休养马", owner: "", note: "", createdAt: 6 },
  ],
  entries: [
    { id: "x1", horseId: "bx31", date: "2026-01-10", gait: "正常", gaitNote: "", gaitAbnormal: false, hooves: hooves(), shoeChanges: [], nextReview: "", note: "备份A记录", photoData: "", photoCaption: "", farrier: "外场", createdAt: 555001 },
    { id: "x2", horseId: "bx31", date: "2026-02-10", gait: "跛行", gaitNote: "", gaitAbnormal: true, hooves: hooves({ LF: { shape: "", balance: "", issues: ["裂纹"], note: "" } }), shoeChanges: [{ hoof: "LF", oldShoe: "普通钢蹄铁", newShoe: "铝蹄铁", nails: "", reason: "备份里的换蹄" }], nextReview: "", note: "备份B记录", photoData: "", photoCaption: "", farrier: "外场", createdAt: 555002 },
    { id: "x3", horseId: "b88", date: "2026-03-10", gait: "正常", gaitNote: "", gaitAbnormal: false, hooves: hooves(), shoeChanges: [], nextReview: "", note: "新马记录", photoData: "", photoCaption: "", farrier: "外场", createdAt: 555003 },
  ],
});

function hooves(partial = {}) {
  const empty = () => ({ shape: "", balance: "", issues: [], note: "" });
  return { LF: { ...empty(), ...(partial.LF || {}) }, RF: empty(), LH: empty(), RH: empty() };
}

// ============ 场景 1：首次打开 → 检查 → 实时对比 → 提交落盘 ============
{
  const { window, errs } = makeDom();
  await tick(60);

  const metric = [...window.document.querySelectorAll(".metrics strong")].map((e) => e.textContent);
  ok("指标渲染（4 项）", metric.length === 4 && metric[3] === "3");
  ok("复查提醒出现逾期的 HORSE-18", !!byDeepText(window, ".reminder-card", "HORSE-18"));

  // 打开 HORSE-31
  click(window, byDeepText(window, ".horse-item", "HORSE-31"));
  await tick();
  ok("进入详情看到时间线标题", !!byText(window, "h2", "修蹄记录时间线"));
  ok("当前蹄铁区域存在", !!byDeepText(window, ".shoe-now", "当前蹄铁"));

  click(window, byText(window, "button", "+ 今日检查 / 换蹄"));
  await tick();

  // 左前：蹄形从“偏陡”改为“良好”，问题“蹄形不良”应被视为消除
  const cards = [...window.document.querySelectorAll(".hoof-card")];
  const lf = cards.find((c) => c.textContent.includes("左前蹄"));
  const lfShape = lf.querySelector("select");
  setSelect(window, lfShape, "良好");
  await tick();
  const issueChip = [...lf.querySelectorAll(".chip")].find((c) => c.textContent.includes("蹄形不良"));
  click(window, issueChip); // on
  await tick(10);
  click(window, issueChip); // off → issues 为空，相对上次=消除
  await tick(20);
  const lfText = lf.textContent;
  ok("实时对比：蹄形 偏陡→良好", lfText.includes("蹄形 偏陡 → 良好"));
  ok("实时对比：消除 蹄形不良", lfText.includes("消除：蹄形不良"));
  ok("变化卡片高亮", lf.classList.contains("changed"));

  // 右前登记换蹄
  const rf = cards.find((c) => c.textContent.includes("右前蹄"));
  click(window, [...rf.querySelectorAll("button")].find((b) => b.textContent.includes("此蹄更换蹄铁")));
  await tick();
  const rfSelects = [...rf.querySelectorAll("select")];
  setSelect(window, rfSelects[rfSelects.length - 1], "铝蹄铁");
  const nailsInput = rf.querySelector("input[placeholder='如 外7内6']");
  setValue(window, nailsInput, "外7内6");
  await tick(20);
  ok("换蹄登记区出现新蹄铁选择", rf.textContent.includes("登记换蹄"));

  // 步态：上次“运步不稳” → 本次“正常”，顶部出现步态变化
  const gaitPanel = [...window.document.querySelectorAll(".subpanel")].find((p) => p.textContent.includes("步态检查"));
  setSelect(window, gaitPanel.querySelector("select"), "正常");
  await tick(20);
  ok("实时对比：步态 运步不稳→正常", gaitPanel.textContent.includes("运步不稳 → 正常"));

  // 复查 +14 天
  click(window, byDeepText(window, "button", "+14 天"));
  await tick(700); // 等草稿防抖

  // 草稿已自动写入 localStorage（意外关页保护）
  const draft = JSON.parse(window.localStorage.getItem("farrier.draft.v1.h31"));
  ok("填写中草稿已自动保存", !!draft && !!draft.form.nextReview);

  // 提交
  click(window, byText(window, "button", "提交记录"));
  await tick(50);
  ok("提交成功提示", allText(window, "检查记录已提交").length > 0);
  ok("提交后草稿清除", window.localStorage.getItem("farrier.draft.v1.h31") === null);

  // 正式数据落盘
  const db = JSON.parse(window.localStorage.getItem("farrier.db.v1"));
  const h31entries = db.entries.filter((e) => e.horseId === "h31");
  ok("正式数据已写入 localStorage", h31entries.length === 2);
  const newest = h31entries.sort((a, b) => b.createdAt - a.createdAt)[0];
  ok("提交内容含换蹄追溯信息", newest.shoeChanges[0]?.newShoe === "铝蹄铁" && newest.shoeChanges[0].nails === "外7内6");
  ok("提交内容含复查日期", !!newest.nextReview);

  // 历史时间线展开新记录
  await tick();
  const firstCard = window.document.querySelector(".timeline .entry-card");
  click(window, firstCard.querySelector(".entry-head"));
  await tick();
  const body = firstCard.textContent;
  ok("历史可追溯：展示新换的铝蹄铁", body.includes("铝蹄铁"));
  ok("最新变化摘要横幅存在", !!window.document.querySelector(".latest-change"));
  ok("当前蹄铁更新为铝蹄铁", window.document.querySelector(".shoe-now").textContent.includes("铝蹄铁"));

  // ============ 场景 2：模拟关页重开（新页面实例从存储恢复） ============
  const storage = {
    "farrier.db.v1": window.localStorage.getItem("farrier.db.v1"),
  };
  {
    const { window: w2 } = makeDom(storage);
    await tick(60);
    click(w2, byDeepText(w2, ".horse-item", "HORSE-31"));
    await tick();
    ok("重开页面后提交的记录仍在", w2.document.querySelectorAll(".entry-card").length === 2);
  }

  // ============ 场景 3：填一半关页 → 草稿恢复 ============
  {
    // 先在窗口里制造一份草稿
    click(window, byText(window, "button", "+ 今日检查 / 换蹄"));
    await tick();
    const cards2 = [...window.document.querySelectorAll(".hoof-card")];
    const lf2 = cards2.find((c) => c.textContent.includes("左前蹄"));
    setSelect(window, lf2.querySelector("select"), "扁平");
    setValue(window, window.document.querySelector("input[placeholder='签名']"), "临时蹄铁师");
    await tick(700);

    const storage2 = {
      "farrier.db.v1": window.localStorage.getItem("farrier.db.v1"),
      "farrier.draft.v1.h31": window.localStorage.getItem("farrier.draft.v1.h31"),
    };
    const { window: w3 } = makeDom(storage2);
    await tick(60);
    click(w3, byDeepText(w3, ".horse-item", "HORSE-31"));
    await tick();
    click(w3, byText(w3, "button", "+ 今日检查 / 换蹄"));
    await tick(40);
    ok("重开后出现草稿恢复横幅", !!byDeepText(w3, ".draft-banner", "已恢复"));
    const restored = w3.document.querySelector("input[placeholder='签名']").value;
    ok("草稿字段被恢复（签名）", restored === "临时蹄铁师");
    // 丢弃草稿
    click(w3, byText(w3, ".draft-banner button", "丢弃草稿"));
    await tick(20);
    ok("丢弃后签名清空", w3.document.querySelector("input[placeholder='签名']").value === "");
    ok("丢弃后 localStorage 草稿删除", w3.localStorage.getItem("farrier.draft.v1.h31") === null);
  }

  // 主窗口从“新增表单”退回视图，避免影响后续导入场景
  click(window, byText(window, ".form-foot button", "取消"));
  await tick(20);

  // ============ 场景 4：导入备份，冲突时“保留现有” ============
  {
    click(window, byText(window, "button", "导入备份"));
    await tick(30);
    const file = new window.File([BACKUP_31_88], "backup.json", { type: "application/json" });
    setFileInput(window, window.document.querySelector("#import-file"), file);
    await tick(60);

    const conflictRows = [...window.document.querySelectorAll(".import-row.conflict")];
    ok("导入预览识别同编号冲突", conflictRows.length === 1 && conflictRows[0].textContent.includes("HORSE-31"));
    ok("导入预览识别新马匹 HORSE-88", !!byDeepText(window, ".import-row", "HORSE-88"));

    // 选择“保留现有记录”（点击 label，React 才能收到 onChange）
    const keepRadio = [...conflictRows[0].querySelectorAll("input[type=radio]")][1];
    click(window, keepRadio.closest("label"));
    await tick(20);
    click(window, byText(window, ".modal-foot button", "按以上选择导入"));
    await tick(40);
    ok("导入完成提示", allText(window, "导入完成").length > 0);

    // HORSE-31 仍只有 2 条
    click(window, byDeepText(window, ".horse-item", "HORSE-31"));
    await tick();
    ok("保留现有：HORSE-31 记录数不变=2", window.document.querySelectorAll(".entry-card").length === 2);
    // HORSE-88 作为新马进入
    ok("新马 HORSE-88 已加入列表", !!byDeepText(window, ".horse-item", "HORSE-88"));
    click(window, byDeepText(window, ".horse-item", "HORSE-88"));
    await tick();
    ok("HORSE-88 带来 1 条历史", window.document.querySelectorAll(".entry-card").length === 1);
  }

  // ============ 场景 5：再次导入同一备份，冲突时“并入历史” ============
  {
    click(window, byText(window, "button", "导入备份"));
    await tick(30);
    const file = new window.File([JSON.stringify({
      version: 1,
      horses: [{ id: "bx31", code: "HORSE-31", name: "", breed: "", status: "运动马", owner: "", note: "", createdAt: 5 }],
      entries: [
        { id: "x1", horseId: "bx31", date: "2026-01-10", gait: "正常", gaitNote: "", gaitAbnormal: false, hooves: hooves(), shoeChanges: [], nextReview: "", note: "备份A记录", photoData: "", photoCaption: "", farrier: "外场", createdAt: 555001 },
        { id: "x2", horseId: "bx31", date: "2026-02-10", gait: "跛行", gaitNote: "", gaitAbnormal: true, hooves: hooves({ LF: { shape: "", balance: "", issues: ["裂纹"], note: "" } }), shoeChanges: [{ hoof: "LF", oldShoe: "普通钢蹄铁", newShoe: "铝蹄铁", nails: "", reason: "备份里的换蹄" }], nextReview: "", note: "备份B记录", photoData: "", photoCaption: "", farrier: "外场", createdAt: 555002 },
      ],
    })], "backup2.json", { type: "application/json" });
    setFileInput(window, window.document.querySelector("#import-file"), file);
    await tick(60);
    // 默认即“并入历史”，直接导入
    click(window, byText(window, ".modal-foot button", "按以上选择导入"));
    await tick(40);

    click(window, byDeepText(window, ".horse-item", "HORSE-31"));
    await tick();
    const dates = [...window.document.querySelectorAll(".entry-card .entry-date b")].map((e) => e.textContent);
    ok("并入历史：HORSE-31 记录数=4 (实际日期: " + dates.join(",") + ")", window.document.querySelectorAll(".entry-card").length === 4);

    // 并入的换蹄记录可追溯
    const card = [...window.document.querySelectorAll(".entry-card")].find((c) => c.textContent.includes("2026-02-10"));
    if (card) {
      click(window, card.querySelector(".entry-head"));
      await tick();
      ok("并入记录可追溯旧→新蹄铁", card.textContent.includes("普通钢蹄铁") && card.textContent.includes("铝蹄铁"));
    } else {
      ok("并入记录可追溯旧→新蹄铁（卡片缺失）", false);
    }

    // 重复并入应去重
    click(window, byText(window, "button", "导入备份"));
    await tick(30);
    const f2 = new window.File([JSON.stringify({
      version: 1,
      horses: [{ id: "bx31", code: "HORSE-31", name: "", breed: "", status: "运动马", owner: "", note: "", createdAt: 5 }],
      entries: [
        { id: "x1", horseId: "bx31", date: "2026-01-10", gait: "正常", gaitNote: "", gaitAbnormal: false, hooves: hooves(), shoeChanges: [], nextReview: "", note: "备份A记录", photoData: "", photoCaption: "", farrier: "外场", createdAt: 555001 },
        { id: "x2", horseId: "bx31", date: "2026-02-10", gait: "跛行", gaitNote: "", gaitAbnormal: true, hooves: hooves(), shoeChanges: [], nextReview: "", note: "备份B记录", photoData: "", photoCaption: "", farrier: "外场", createdAt: 555002 },
      ],
    })], "backup3.json", { type: "application/json" });
    setFileInput(window, window.document.querySelector("#import-file"), f2);
    await tick(60);
    click(window, byText(window, ".modal-foot button", "按以上选择导入"));
    await tick(40);
    click(window, byDeepText(window, ".horse-item", "HORSE-31"));
    await tick();
    ok("重复并入自动去重：仍为 4 条", window.document.querySelectorAll(".entry-card").length === 4);

    // 最终落盘校验
    const finalDb = JSON.parse(window.localStorage.getItem("farrier.db.v1"));
    ok("最终持久化：4 匹马（含新马）", finalDb.horses.length === 4);
  }

  ok("全过程无页面 JS 错误", errs.length === 0);
  if (errs.length) console.log("ERRORS:", errs);
}

let fail = 0;
for (const [name, passed] of results) {
  console.log((passed ? "PASS" : "FAIL") + "  " + name);
  if (!passed) fail++;
}
console.log(`\n${results.length - fail}/${results.length} passed`);
process.exit(fail ? 1 : 0);
