// 감시 핵심 로직: STS 상태 diff 로 신규 결과를 찾아 요약한다.
import { extractLabRows } from "./extract.js";
import { otherTestRows, summarizeRows } from "./classify.js";
import { buildPatientView } from "./report.js";
import { searchPatient, fetchDetail, hasResult, DETAIL_URL, LoginRequiredError } from "./srms.js";

const STORE_DEFAULTS = {
  templates: null,      // { list, detail }
  watchlist: [],        // [name, ...]
  seen: {},             // { [name]: { [JNO]: STS } }
  notifications: [],    // 최근 신규 결과 (팝업 표시용)
  lastCheck: null,      // { at, ok, error }
  unread: 0,            // 미확인 알림 개수 (배지)
  lastLookup: null,     // 마지막 혈액/UA 조회 결과 (응답 유실 복구용)
  lastOtherLookup: null, // 마지막 기타검사 조회 결과
  lastLookupView: null  // 뷰어(viewer.html)용 구조화 데이터
};

export async function loadStore() {
  const data = await chrome.storage.local.get(STORE_DEFAULTS);
  return { ...STORE_DEFAULTS, ...data };
}

export async function saveStore(patch) {
  await chrome.storage.local.set(patch);
}

// 감시 조회 기간. AFB 배양은 최종 보고까지 6~8주 걸리므로 넉넉히 잡는다.
const WATCH_DAYS = 60;
// 감시 중인 환자에게 처음 보이는 접수라도 이 기간 안에 접수됐으면 새 결과로 알린다
// (점검 사이에 바로 완료된 접수 등). 그보다 오래된 접수는 기준값으로만 기록한다.
// ponytail: 고정 일수 기준. 크롬을 이보다 오래 꺼두면 그 사이 완료된 접수는 알리지 않는다.
const NEW_JNO_DAYS = 7;

// prev(이전 STS) → row.STS 전이가 "새로 알릴 결과" 인지 판정.
// prev === undefined 는 이 환자 감시 중 처음 보는 접수. recentSince(YYYYMMDD) 이후 접수만 알린다.
export function isNewResult(prev, row, recentSince) {
  if (!hasResult(row)) return false;
  if (prev === undefined) {
    const dat = String(row.DAT || "").replace(/\D/g, "").slice(0, 8);
    return /^\d{8}$/.test(dat) && dat >= recentSince;
  }
  if (prev === "2") return false;       // 이미 완료 상태였음
  return prev !== String(row.STS);      // 1→2, 1→4, 4→2 등
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return ymd(d);
}

// 캡처한 목록 양식의 조회 기간(I_FDT/I_TDT)은 캡처 시점에 고정돼 있으므로 오늘 기준으로 덮어쓴다.
function listTemplateFor(list, days) {
  return { ...list, I_FDT: daysAgo(days), I_TDT: daysAgo(0), I_CNT: "1000", I_ICNT: "1000" };
}

function sortNewest(rows) {
  return [...rows].sort((a, b) => String(b.DAT || "").localeCompare(String(a.DAT || "")));
}

function isOtherTestRow(resultRow) {
  const etcinf = String(resultRow.ETCINF || "");
  return !etcinf || /sputum|stool|blood culture|rectal swab|vre|cre/i.test(etcinf);
}

async function fetchOtherRows(detailTemplate, resultRow) {
  const payload = await fetchDetail(detailTemplate, resultRow);
  return otherTestRows(extractLabRows(payload, DETAIL_URL));
}

async function collectRecentOtherRows(detailTemplate, rows, limit = 3) {
  const collected = [];
  const found = new Set();
  for (const row of sortNewest(rows)) {
    if (found.size >= limit) break;
    if (!hasResult(row) || !isOtherTestRow(row)) continue;
    try {
      const otherRows = await fetchOtherRows(detailTemplate, row);
      if (otherRows.length) {
        found.add(String(row.JNO));
        collected.push(...otherRows);
      }
    } catch (error) {
      if (error instanceof LoginRequiredError) throw error;
    }
    await sleep(300);
  }
  return collected;
}

export async function collectRecentOtherViews(templates, names, limit = 3, days = 30) {
  if (!templates?.list) return { status: "no-template", views: [], failures: [] };
  const listTemplate = listTemplateFor(templates.list, days);
  const views = [];
  const failures = [];
  try {
    for (const name of names) {
      const { rows, keyword } = await searchPatient(listTemplate, name);
      if (!rows.length) {
        failures.push(name);
        continue;
      }
      const viewRows = await collectRecentOtherRows(templates.detail, rows, limit);
      if (!viewRows.length) {
        failures.push(name);
        continue;
      }
      const view = buildPatientView(viewRows, { includeOtherDates: true, otherMaxDates: limit });
      view.lookupKeyword = keyword;
      views.push(view);
    }
  } catch (error) {
    if (error instanceof LoginRequiredError) return { status: "login-required", views, failures };
    return { status: "error", views, failures, error: error.message };
  }
  return { status: "ok", views, failures };
}

/**
 * 감시 대상 환자들을 1회 점검한다.
 * @returns {{ status, checked, newResults, error }}
 *   status: "ok" | "no-template" | "login-required" | "empty"
 *   newResults: [{ patientName, chartNo, items: [{date,name,sample,result}], view }]
 */
export async function runCheck() {
  const store = await loadStore();
  if (!store.templates?.list) {
    return { status: "no-template", checked: 0, newResults: [] };
  }
  if (!store.watchlist.length) {
    return { status: "empty", checked: 0, newResults: [] };
  }

  const listTemplate = listTemplateFor(store.templates.list, WATCH_DAYS);
  const recentSince = daysAgo(NEW_JNO_DAYS);
  const seen = { ...store.seen };
  const newResults = [];

  try {
    for (const name of store.watchlist) {
      const { rows } = await searchPatient(listTemplate, name);
      const firstTime = seen[name] === undefined;
      const before = seen[name] || {};
      const patientSeen = { ...before };
      const candidates = [];

      for (const row of rows) {
        const jno = String(row.JNO);
        if (!firstTime && isNewResult(before[jno], row, recentSince)) candidates.push(row);
        patientSeen[jno] = String(row.STS);
      }
      seen[name] = patientSeen;

      // baseline(첫 관찰) 이면 상태만 기록하고 알리지 않는다.
      if (firstTime || !candidates.length) continue;

      const items = [];
      let chartNo = "";
      const detailTargets = [];
      for (const row of candidates) {
        try {
          const otherRows = await fetchOtherRows(store.templates.detail, row);
          const summary = summarizeRows(otherRows); // 혈액/UA 제외됨
          if (summary.length) {
            items.push(...summary);
            chartNo = chartNo || String(row.CHN || "");
            detailTargets.push({
              dat: String(row.DAT || ""),
              jno: String(row.JNO || ""),
              chn: String(row.CHN || ""),
              hos: String(row.HOS || "")
            });
          }
        } catch (error) {
          if (error instanceof LoginRequiredError) throw error;
          // 개별 상세 실패: 이 접수의 상태를 되돌려 다음 점검에서 다시 감지되게 한다.
          const jno = String(row.JNO);
          if (before[jno] === undefined) delete patientSeen[jno];
          else patientSeen[jno] = before[jno];
        }
        await sleep(300);
      }

      if (items.length) {
        const viewRows = await collectRecentOtherRows(store.templates.detail, rows, 3);
        const view = buildPatientView(viewRows, { includeOtherDates: true, otherMaxDates: 3 });
        view.isNewToday = true;
        newResults.push({ patientName: name, chartNo, items, view, detailTargets });
      }
    }
  } catch (error) {
    // seen 은 저장하지 않는다: 이번 점검에서 감지했지만 알리지 못한 결과를 다음 점검에서 다시 잡기 위해.
    await saveStore({ lastCheck: { at: Date.now(), ok: false, error: "login-required" } });
    if (error instanceof LoginRequiredError) {
      return { status: "login-required", checked: 0, newResults: [] };
    }
    return { status: "error", checked: 0, newResults: [], error: error.message };
  }

  // 마지막 점검에서 새로 감지된 결과만 팝업에 표시한다.
  const stamped = newResults.map((r) => ({ ...r, at: Date.now() }));
  const notificationRows = stamped;

  await saveStore({
    seen,
    notifications: notificationRows,
    lastCheck: { at: Date.now(), ok: true, error: null }
  });

  return { status: "ok", checked: store.watchlist.length, newResults: stamped };
}
