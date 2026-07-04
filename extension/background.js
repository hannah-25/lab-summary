// 감시/알림 service worker.
import { runCheck, loadStore, saveStore } from "./lib/monitor.js";
import { collectBloodUa, ymd } from "./lib/lookup.js";
import { groupByPatient, uniqueRows, buildBloodUaReport, buildPatientView } from "./lib/report.js";
import { LoginRequiredError } from "./lib/srms.js";

const ALARM = "lab-poll";

// 감시 시간대: 매일 06:00 ~ 06:30, 10분 간격 → 06:00 / 06:10 / 06:20 / 06:30
const WINDOW_START_MIN = 6 * 60;      // 06:00
const WINDOW_END_MIN = 6 * 60 + 30;   // 06:30
const STEP_MIN = 10;

const SLOTS = [];
for (let m = WINDOW_START_MIN; m <= WINDOW_END_MIN; m += STEP_MIN) SLOTS.push(m);

// 현재 시각 이후의 다음 슬롯 시각(ms). 오늘 남은 슬롯이 없으면 내일 첫 슬롯.
function nextFireTime(now = Date.now()) {
  const base = new Date(now);
  for (const mins of SLOTS) {
    const t = new Date(base);
    t.setHours(0, mins, 0, 0);
    if (t.getTime() > now) return t.getTime();
  }
  const t = new Date(base);
  t.setDate(t.getDate() + 1);
  t.setHours(0, SLOTS[0], 0, 0);
  return t.getTime();
}

function scheduleNext() {
  const when = nextFireTime();
  chrome.alarms.create(ALARM, { when });
}

// --- 알람 등록 (다음 슬롯 1개만 예약하고, 발화 때마다 재예약) ---
chrome.runtime.onInstalled.addListener(scheduleNext);
chrome.runtime.onStartup.addListener(scheduleNext);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM) return;
  checkAndNotify().finally(scheduleNext);
});

// --- 배지 ---
async function setBadge(count) {
  await chrome.action.setBadgeBackgroundColor({ color: "#d9534f" });
  await chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
}

// --- 알림 발행 ---
function notify(result) {
  const lines = result.items.slice(0, 4).map((i) => `• ${i.name}: ${i.result}`);
  if (result.items.length > 4) lines.push(`…외 ${result.items.length - 4}건`);
  chrome.notifications.create(`lab-${result.patientName}-${result.at}`, {
    type: "basic",
    iconUrl: "icon128.png",
    title: `새 검사결과 · ${result.patientName}`,
    message: lines.join("\n"),
    priority: 2
  });
}

// --- 점검 실행 + 알림 ---
async function checkAndNotify() {
  const res = await runCheck();
  if (res.status === "ok" && res.newResults.length) {
    for (const r of res.newResults) notify(r);
    const store = await loadStore();
    const unread = (store.unread || 0) + res.newResults.reduce((n, r) => n + r.items.length, 0);
    await saveStore({ unread });
    await setBadge(unread);
  } else if (res.status === "login-required") {
    chrome.notifications.create("lab-login", {
      type: "basic",
      iconUrl: "icon128.png",
      title: "SRMS 로그인 필요",
      message: "감시를 계속하려면 SRMS 에 다시 로그인하세요.",
      priority: 1
    });
  }
  return res;
}

// --- 혈액/UA 온디맨드 조회 (여러 명 한 번에) ---
async function runBloodLookup(names, days = 60) {
  console.log("[LabMonitor] bloodLookup 시작:", names, `${days}일`);
  const store = await loadStore();
  if (!store.templates?.list) return { status: "no-template", reports: [], failures: [] };
  if (!store.templates?.detail) console.log("[LabMonitor] 경고: 상세(detail) 양식 미수집 — SRMS 검사결과 상세를 한 번 열어야 함");

  const toDate = ymd(new Date());
  const from = new Date();
  from.setDate(from.getDate() - days);
  const fromDate = ymd(from);

  const allRows = [];
  const failures = [];
  try {
    for (const name of names) {
      const { rows, found } = await collectBloodUa(store.templates, name, { fromDate, toDate });
      console.log(`[LabMonitor]  ${name}: found=${found}, rows=${rows.length}`);
      if (!found) failures.push(name);
      allRows.push(...rows);
    }
  } catch (error) {
    console.log("[LabMonitor] bloodLookup 예외:", error);
    if (error instanceof LoginRequiredError) return { status: "login-required", reports: [], failures };
    return { status: "error", reports: [], failures, error: error.message };
  }

  const rows = uniqueRows(allRows);
  const reports = [];
  const views = [];
  for (const [, patientRows] of groupByPatient(rows)) {
    reports.push(buildBloodUaReport(patientRows));
    views.push(buildPatientView(patientRows));
  }
  console.log(`[LabMonitor] bloodLookup 완료: reports=${reports.length}, failures=${failures.length}`);
  return { status: "ok", reports, views, failures };
}

// 뷰어(viewer.html)를 독립 팝업 창으로 연다. 이미 열려 있으면 포커스만(데이터는 storage 변경으로 갱신).
async function openViewerWindow() {
  const url = chrome.runtime.getURL("viewer.html");
  const { viewerWindowId } = await chrome.storage.local.get("viewerWindowId");
  if (viewerWindowId != null) {
    try {
      await chrome.windows.get(viewerWindowId);
      await chrome.windows.update(viewerWindowId, { focused: true });
      return; // 창이 살아있음 — 데이터는 storage.onChanged 로 갱신
    } catch {
      // 창이 닫혔으면 새로 생성
    }
  }
  const win = await chrome.windows.create({ url, type: "popup", width: 1200, height: 900 });
  await chrome.storage.local.set({ viewerWindowId: win.id });
}

// 알림 클릭 → SRMS 탭 열기/포커스
chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.query({ url: "https://srms.seegenemedical.com/*" }, (tabs) => {
    if (tabs.length) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: "https://srms.seegenemedical.com/main.do" });
    }
  });
});

// 메시지 종류별 처리. 항상 응답 객체를 반환한다(예외는 리스너에서 잡아 error 응답으로).
async function handleMessage(msg) {
  switch (msg.type) {
    case "template": {
      const store = await loadStore();
      const templates = { ...(store.templates || {}) };
      if (msg.kind === "list") templates.list = msg.template;
      if (msg.kind === "detail") templates.detail = msg.template;
      await saveStore({ templates });
      return { ok: true };
    }
    case "checkNow":
      return checkAndNotify();
    case "bloodLookup": {
      const res = await runBloodLookup(msg.names || [], msg.days || 60);
      res.reqId = msg.reqId || null;
      res.at = Date.now();
      await saveStore({ lastLookup: res }); // 응답 유실 대비 복구용 (팝업이 폴링으로 회수)
      // 조회 성공 시 뷰어 데이터 저장 + 새 창 자동 오픈
      if (res.status === "ok" && res.views?.length) {
        await saveStore({ lastLookupView: { generatedAt: new Date().toISOString(), patients: res.views } });
        await openViewerWindow();
      }
      return res;
    }
    case "openViewer":
      await openViewerWindow();
      return { ok: true };
    case "getStore":
      return loadStore();
    case "clearUnread":
      await saveStore({ unread: 0 });
      await setBadge(0);
      return { ok: true };
    case "addPatient": {
      const store = await loadStore();
      const name = String(msg.name || "").trim();
      const watchlist = store.watchlist.includes(name) || !name
        ? store.watchlist
        : [...store.watchlist, name];
      await saveStore({ watchlist });
      return { ok: true, watchlist };
    }
    case "removePatient": {
      const store = await loadStore();
      const watchlist = store.watchlist.filter((n) => n !== msg.name);
      const seen = { ...store.seen };
      delete seen[msg.name];
      await saveStore({ watchlist, seen });
      return { ok: true, watchlist };
    }
    default:
      return { ok: false, error: "unknown message" };
  }
}

// --- 메시지 핸들러 (content script / popup) ---
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(
    (res) => sendResponse(res),
    (err) => sendResponse({ ok: false, status: "error", error: err?.message || String(err) })
  );
  return true; // 비동기 응답
});
