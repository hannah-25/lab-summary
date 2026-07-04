// 감시 핵심 로직: STS 상태 diff 로 신규 결과를 찾아 요약한다.
import { extractLabRows } from "./extract.js";
import { summarizeRows } from "./classify.js";
import { searchPatient, fetchDetail, hasResult, DETAIL_URL, LoginRequiredError } from "./srms.js";

const STORE_DEFAULTS = {
  templates: null,      // { list, detail }
  watchlist: [],        // [name, ...]
  seen: {},             // { [name]: { [JNO]: STS } }
  notifications: [],    // 최근 신규 결과 (팝업 표시용)
  lastCheck: null,      // { at, ok, error }
  unread: 0,            // 미확인 알림 개수 (배지)
  lastLookup: null,     // 마지막 혈액/UA 조회 결과 (응답 유실 복구용)
  lastLookupView: null  // 뷰어(viewer.html)용 구조화 데이터
};

export async function loadStore() {
  const data = await chrome.storage.local.get(STORE_DEFAULTS);
  return { ...STORE_DEFAULTS, ...data };
}

export async function saveStore(patch) {
  await chrome.storage.local.set(patch);
}

// prev(이전 STS) → now(현재 STS) 전이가 "새로 알릴 결과" 인지 판정.
// 최초 관찰(prev === undefined)은 baseline 으로 처리하고 알리지 않는다.
function isNewResult(prev, row) {
  if (!hasResult(row)) return false;
  const now = String(row.STS);
  if (prev === undefined) return false; // baseline
  if (prev === "2") return false;       // 이미 완료 상태였음
  return prev !== now;                  // 1→2, 1→4, 4→2 등
}

/**
 * 감시 대상 환자들을 1회 점검한다.
 * @returns {{ status, checked, newResults, error }}
 *   status: "ok" | "no-template" | "login-required" | "empty"
 *   newResults: [{ patientName, chartNo, items: [{date,name,sample,result}] }]
 */
export async function runCheck() {
  const store = await loadStore();
  if (!store.templates?.list) {
    return { status: "no-template", checked: 0, newResults: [] };
  }
  if (!store.watchlist.length) {
    return { status: "empty", checked: 0, newResults: [] };
  }

  const seen = { ...store.seen };
  const newResults = [];

  try {
    for (const name of store.watchlist) {
      const { rows } = await searchPatient(store.templates.list, name);
      const patientSeen = { ...(seen[name] || {}) };
      const firstTime = seen[name] === undefined;
      const candidates = [];

      for (const row of rows) {
        const jno = String(row.JNO);
        const prev = firstTime ? undefined : patientSeen[jno];
        if (isNewResult(prev, row)) candidates.push(row);
        patientSeen[jno] = String(row.STS);
      }
      seen[name] = patientSeen;

      // baseline(첫 관찰) 이면 상태만 기록하고 알리지 않는다.
      if (firstTime || !candidates.length) continue;

      const items = [];
      let chartNo = "";
      for (const row of candidates) {
        try {
          const payload = await fetchDetail(store.templates.detail, row);
          const extracted = extractLabRows(payload, DETAIL_URL);
          const summary = summarizeRows(extracted); // 혈액/UA 제외됨
          if (summary.length) {
            items.push(...summary);
            chartNo = chartNo || String(row.CHN || "");
          }
        } catch (error) {
          if (error instanceof LoginRequiredError) throw error;
          // 개별 상세 실패는 건너뜀
        }
        await new Promise((r) => setTimeout(r, 300));
      }

      if (items.length) newResults.push({ patientName: name, chartNo, items });
    }
  } catch (error) {
    await saveStore({ seen, lastCheck: { at: Date.now(), ok: false, error: "login-required" } });
    if (error instanceof LoginRequiredError) {
      return { status: "login-required", checked: 0, newResults: [] };
    }
    return { status: "error", checked: 0, newResults: [], error: error.message };
  }

  // 신규 결과를 알림 기록에 누적 (최근 50건 유지)
  const stamped = newResults.map((r) => ({ ...r, at: Date.now() }));
  const notifications = [...stamped, ...store.notifications].slice(0, 50);

  await saveStore({
    seen,
    notifications,
    lastCheck: { at: Date.now(), ok: true, error: null }
  });

  return { status: "ok", checked: store.watchlist.length, newResults: stamped };
}
