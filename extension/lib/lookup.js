// 혈액/UA 온디맨드 조회 (capture.mjs 의 collectPatient blood 경로를 fetch 로 이식).
import { searchPatient, fetchDetail, DETAIL_URL } from "./srms.js";
import { extractLabRows } from "./extract.js";
import { classifyRows } from "./classify.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

// 환자 1명의 혈액/UA 행을 수집한다. 최근 접수부터 혈액 접수 2건까지 (혈액배양 날짜 건너뜀).
export async function collectBloodUa(templates, name, { fromDate, toDate }) {
  const listTemplate = {
    ...templates.list,
    I_FDT: fromDate,
    I_TDT: toDate,
    I_CNT: "1000",
    I_ICNT: "1000"
  };
  const { rows: searchRows } = await searchPatient(listTemplate, name);
  if (!searchRows.length) return { rows: [], found: false };

  const sorted = [...searchRows].sort((a, b) =>
    String(b.DAT || "").localeCompare(String(a.DAT || ""))
  );

  const collected = [];
  const foundBlood = new Set();
  let lastCollectedDate = null;

  for (const resultRow of sorted) {
    // 혈액 접수 2건을 모았고, 같은 날짜도 아니면 종료 (continueSameDate 동작)
    if (foundBlood.size >= 2 && resultRow.DAT !== lastCollectedDate) break;

    // 접수 검체가 혈액/UA 와 무관하면 건너뜀
    const etcinf = String(resultRow.ETCINF || "");
    if (etcinf && !/serum|edta|urine/i.test(etcinf)) continue;

    try {
      const payload = await fetchDetail(templates.detail, resultRow);
      const groups = classifyRows(extractLabRows(payload, DETAIL_URL));
      if (groups.bloodCulture.length) continue; // 혈액배양 포함 날짜는 제외
      if (groups.blood.length) foundBlood.add(String(resultRow.JNO));
      collected.push(...groups.blood, ...groups.urine, ...groups.unclassified);
      lastCollectedDate = resultRow.DAT;
    } catch (error) {
      if (error.name === "LoginRequiredError") throw error;
      // 개별 상세 실패는 건너뜀
    }
    await sleep(300);
  }

  return { rows: collected, found: true };
}
