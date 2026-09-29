import { useCallback, useRef, useState } from "react";
import "./styles.css";
import {
  type Exam,
  type Horse,
  type ShoeChange,
} from "./types";
import { actions } from "./lib/store";
import { useAppState } from "./lib/selectors";
import {
  downloadBackup,
  parseBackupText,
  type ParsedBackup,
} from "./lib/backup";
import { Dashboard } from "./components/Dashboard";
import { HorseDetail } from "./components/HorseDetail";
import { HorseFormModal } from "./components/HorseFormModal";
import { ExamFormModal } from "./components/ExamFormModal";
import { ShoeFormModal } from "./components/ShoeFormModal";
import { ImportModal } from "./components/ImportModal";
import { Modal } from "./components/Modal";
import { ToastStack, type ToastData, type ToastKind } from "./components/Toast";
import { latestExam } from "./lib/selectors";

type View = { name: "dashboard" } | { name: "horse"; id: string };

export default function App() {
  const state = useAppState();
  const [view, setView] = useState<View>({ name: "dashboard" });
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const toastId = useRef(0);

  const [horseFormFor, setHorseFormFor] = useState<
    { mode: "create" } | { mode: "edit"; horse: Horse } | undefined
  >(undefined);
  const [examHorse, setExamHorse] = useState<Horse | undefined>(undefined);
  const [shoeHorse, setShoeHorse] = useState<Horse | undefined>(undefined);
  const [importData, setImportData] = useState<ParsedBackup | undefined>(
    undefined
  );
  const [picker, setPicker] = useState<"exam" | "shoe" | undefined>(undefined);
  const [highlightExamId, setHighlightExamId] = useState<string | undefined>(
    undefined
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((kind: ToastKind, message: string) => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((t) => [...t, { id, kind, message }]);
  }, []);
  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const currentHorse =
    view.name === "horse"
      ? state.horses.find((h) => h.id === view.id)
      : undefined;

  const openHorse = (id: string) => {
    setView({ name: "horse", id });
    setHighlightExamId(undefined);
  };

  const startExam = (horse: Horse) => {
    setExamHorse(horse);
    setHighlightExamId(undefined);
  };

  const handleExport = () => {
    if (state.horses.length === 0) {
      notify("info", "当前没有档案可导出");
      return;
    }
    downloadBackup(state);
    notify(
      "success",
      `已导出 ${state.horses.length} 匹马的完整备份（JSON 文件）`
    );
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseBackupText(text);
      if (
        parsed.horses.length === 0 &&
        parsed.exams.length === 0 &&
        parsed.shoeChanges.length === 0
      ) {
        notify("error", "备份文件中没有任何档案数据");
        return;
      }
      setImportData(parsed);
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "备份读取失败");
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView({ name: "dashboard" })}>
          <span className="brand-mark">蹄</span>
          <span>
            <b>马术蹄铁修整档案</b>
            <small>数据仅保存在当前浏览器</small>
          </span>
        </button>
        <div className="top-actions">
          <button onClick={handleExport}>导出备份</button>
          <button onClick={() => fileRef.current?.click()}>导入旧备份</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <main className="app">
        {view.name === "dashboard" && (
          <Dashboard
            state={state}
            onOpenHorse={openHorse}
            onNewHorse={() => setHorseFormFor({ mode: "create" })}
            onNewCheck={() => setPicker("exam")}
          />
        )}
        {view.name === "horse" && currentHorse && (
          <HorseDetail
            state={state}
            horse={currentHorse}
            onBack={() => setView({ name: "dashboard" })}
            onNewExam={() => startExam(currentHorse)}
            onNewShoe={() => setShoeHorse(currentHorse)}
            onEditHorse={() =>
              setHorseFormFor({ mode: "edit", horse: currentHorse })
            }
            onDeleteHorse={() => {
              actions.deleteHorse(currentHorse.id);
              notify("info", `已删除档案 ${currentHorse.code} 及其全部历史`);
              setView({ name: "dashboard" });
            }}
            onDeleteExam={(id) => actions.deleteExam(id)}
            onDeleteShoe={(id) => actions.deleteShoe(id)}
            notify={notify}
            highlightExamId={highlightExamId}
          />
        )}
        {view.name === "horse" && !currentHorse && (
          <div className="panel missing">
            <p>该马匹档案不存在或已被删除。</p>
            <button className="primary" onClick={() => setView({ name: "dashboard" })}>
              返回列表
            </button>
          </div>
        )}
      </main>

      <footer className="footnote">
        所有档案、四蹄检查、换蹄历史与复查提醒均存于本机浏览器（localStorage
        事件日志），提交即落盘；清理浏览器数据前请先导出备份。
      </footer>

      {/* 弹窗区 */}
      {horseFormFor?.mode === "create" && (
        <HorseFormModal
          existingCodes={state.horses.map((h) => h.code)}
          onClose={() => setHorseFormFor(undefined)}
          onSaved={(h) => {
            setHorseFormFor(undefined);
            notify("success", `已建立档案 ${h.code}`);
            openHorse(h.id);
          }}
        />
      )}
      {horseFormFor?.mode === "edit" && (
        <HorseFormModal
          horse={horseFormFor.horse}
          existingCodes={state.horses
            .filter((h) => h.id !== horseFormFor.horse.id)
            .map((h) => h.code)}
          onClose={() => setHorseFormFor(undefined)}
          onSaved={(h) => {
            setHorseFormFor(undefined);
            notify("success", `档案 ${h.code} 已更新`);
          }}
        />
      )}

      {examHorse && (
        <ExamFormModal
          horse={examHorse}
          latest={latestExam(state, examHorse.id)}
          onClose={() => setExamHorse(undefined)}
          notify={notify}
          onSaved={(exam: Exam) => {
            setExamHorse(undefined);
            openHorse(exam.horseId);
            setHighlightExamId(exam.id);
          }}
        />
      )}

      {shoeHorse && (
        <ShoeFormModal
          horse={shoeHorse}
          onClose={() => setShoeHorse(undefined)}
          notify={notify}
          onSaved={(change: ShoeChange) => {
            setShoeHorse(undefined);
            openHorse(change.horseId);
          }}
        />
      )}

      {importData && (
        <ImportModal
          current={state}
          parsed={importData}
          onClose={() => setImportData(undefined)}
          onDone={() => setImportData(undefined)}
          notify={notify}
        />
      )}

      {picker && (
        <HorsePicker
          title={picker === "exam" ? "选择要检查的马匹" : "选择换蹄的马匹"}
          state={state}
          onClose={() => setPicker(undefined)}
          onPick={(h) => {
            setPicker(undefined);
            if (picker === "exam") {
              openHorse(h.id);
              startExam(h);
            } else {
              openHorse(h.id);
              setShoeHorse(h);
            }
          }}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

function HorsePicker({
  title,
  state,
  onPick,
  onClose,
}: {
  title: string;
  state: ReturnType<typeof useAppState>;
  onPick: (h: Horse) => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} subtitle="先选马，再填写对应的检查或换蹄记录" onClose={onClose}>
      {state.horses.length === 0 ? (
        <p className="empty-tip">还没有马匹档案，请先建立档案。</p>
      ) : (
        <div className="picker-list">
          {state.horses.map((h) => {
            const exam = latestExam(state, h.id);
            return (
              <button key={h.id} className="picker-row" onClick={() => onPick(h)}>
                <b>{h.code}</b>
                <span>{h.name || "—"}</span>
                <span className="muted">{h.role}</span>
                <span className="muted">
                  {exam ? `最近检查 ${exam.date}` : "尚未检查"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
