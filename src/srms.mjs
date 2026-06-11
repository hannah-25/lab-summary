import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractLabRows } from "./extract.mjs";
import { classifyRows } from "./classify.mjs";
import { buildPatientReport, buildPatientView, groupByPatient } from "./report.mjs";
import { openViewer } from "./html.mjs";

export const DATA_DIR = join(process.env.LOCALAPPDATA || ".", "TrinityLabSummary");
export const PROFILE_DIR = join(DATA_DIR, "srms-profile");
export const RAW_DIR = join(DATA_DIR, "raw");
export const OUTPUT_DIR = join(DATA_DIR, "output");
export const LIST_URL = "https://srms.seegenemedical.com/rstUserList.do";
export const DETAIL_URL = "https://srms.seegenemedical.com/rstUserDtl.do";

export function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function scalarForm(object) {
  return Object.fromEntries(
    Object.entries(object || {})
      .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
      .map(([key, value]) => [key, String(value)])
  );
}

export function safeName(value) {
  return String(value || "unknown").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

export function ymd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function parseYmd(value) {
  const cleaned = String(value || "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(cleaned)) return "";
  const year = Number(cleaned.slice(0, 4));
  const month = Number(cleaned.slice(4, 6));
  const day = Number(cleaned.slice(6, 8));
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? cleaned : "";
}

export function uniqueRows(rows) {
  return [...new Map(rows.map((row) => [
    [row.patientJno, row.chartNo, row.name, row.result, row.flag, row.date, row.sample, row.parent].join("|"),
    row
  ])).values()];
}

export function searchVariants(name) {
  const withoutSuffix = name.replace(/\d+$/, "");
  return withoutSuffix && withoutSuffix !== name ? [name, withoutSuffix] : [name];
}

export async function postJson(request, url, form) {
  const response = await request.post(url, { form });
  if (!response.ok()) throw new Error(`${response.status()} ${response.statusText()}`);
  const payload = await response.json().catch(() => null);
  if (!payload) throw new Error("JSON 응답이 아닙니다. 로그인 세션을 확인하세요.");
  return payload;
}

export async function searchPatient(request, listTemplate, name) {
  for (const keyword of searchVariants(name)) {
    const payload = await postJson(request, LIST_URL, { ...listTemplate, I_NAM: keyword });
    const rows = (payload.resultList || []).filter((row) => String(row.NAM || "").trim() === name);
    if (rows.length) return { rows, payload, keyword };
  }
  return { rows: [], payload: null, keyword: name };
}

export async function fetchDetail(request, detailTemplate, resultRow) {
  const form = {
    ...(detailTemplate || {}),
    I_JNO: String(resultRow.JNO || ""),
    I_DTLJNO: String(resultRow.JNO || ""),
    I_DAT: String(resultRow.DAT || ""),
    I_DTLDAT: String(resultRow.DAT || ""),
    I_CHN: String(resultRow.CHN || "")
  };
  return postJson(request, DETAIL_URL, form);
}

export async function saveOutputs(rows, failures, runId, mode) {
  const reports = [];
  const views = [];
  for (const [key, patientRows] of groupByPatient(rows)) {
    const report = buildPatientReport(patientRows, { mode });
    reports.push(report);
    views.push(buildPatientView(patientRows, { mode }));
    await writeFile(join(OUTPUT_DIR, `${safeName(key)}-${runId}.txt`), report, "utf8");
  }
  const combinedPath = join(OUTPUT_DIR, `all-${runId}.txt`);
  const viewerPath = join(OUTPUT_DIR, `viewer-${runId}.json`);
  const failurePath = join(OUTPUT_DIR, `failures-${runId}.json`);
  const viewerData = { generatedAt: new Date().toISOString(), patients: views };
  await writeFile(combinedPath, reports.join("\n\n--------------------\n\n"), "utf8");
  await writeFile(viewerPath, JSON.stringify(viewerData, null, 2), "utf8");
  await writeFile(failurePath, JSON.stringify(failures, null, 2), "utf8");
  await openViewer(viewerData, viewerPath);
  return { combinedPath, viewerPath, failurePath };
}

/**
 * 환자 1명의 상세 결과를 수집한다.
 * @param {skipBloodCulture} 혈액배양 포함 날짜 건너뜀 (capture 전용)
 * @param {continueSameDate} satisfied 후에도 같은 날짜면 계속 수집 (capture 전용)
 * @returns {{ captured, rows, failures, detailTemplate }}
 */
export async function collectPatient(request, {
  listTemplate,
  detailTemplate,
  patientName,
  isMicro,
  skipBloodCulture = false,
  continueSameDate = false,
}) {
  const captured = [];
  const rows = [];
  const failures = [];

  const search = await searchPatient(request, listTemplate, patientName);
  captured.push({ url: LIST_URL, patientName, keyword: search.keyword, payload: search.payload });

  if (!search.rows.length) {
    failures.push({ patientName, stage: "search", message: "검색 결과 없음" });
    console.log("  검색 결과 없음");
    return { captured, rows, failures, detailTemplate };
  }

  const sortedRows = [...search.rows].sort((a, b) =>
    String(b.DAT || "").localeCompare(String(a.DAT || ""))
  );
  const foundBlood = new Set();
  const foundUrine = new Set();
  const foundVre = new Set();
  const foundSputum = new Set();
  const foundStool = new Set();
  const foundBloodCulture = new Set();
  let lastCollectedDate = null;
  console.log(`  상세 결과 ${sortedRows.length}건`);

  for (const [detailIndex, resultRow] of sortedRows.entries()) {
    const satisfied = isMicro
      ? foundVre.size >= 3 && foundSputum.size >= 1 && foundStool.size >= 1 && foundBloodCulture.size >= 1
      : foundBlood.size >= 2;
    if (satisfied) {
      if (!continueSameDate || resultRow.DAT !== lastCollectedDate) {
        console.log(`  → 나머지 ${sortedRows.length - detailIndex}건 건너뜀`);
        break;
      }
    }

    const etcinf = String(resultRow.ETCINF || "");
    if (etcinf) {
      const relevant = isMicro
        ? /sputum|stool|blood culture|rectal swab/i.test(etcinf)
        : /serum|edta|urine/i.test(etcinf);
      if (!relevant) {
        console.log(`  ${detailIndex + 1}/${sortedRows.length} 건너뜀 (${etcinf})`);
        continue;
      }
    }

    try {
      const payload = await fetchDetail(request, detailTemplate, resultRow);
      if (!detailTemplate && payload?.param_rstUserDtl) {
        detailTemplate = scalarForm(payload.param_rstUserDtl);
      }
      captured.push({ url: DETAIL_URL, patientName, resultRow, payload });
      const extracted = extractLabRows(payload, DETAIL_URL);
      const groups = classifyRows(extracted);
      const jno = String(resultRow.JNO);

      if (isMicro) {
        if (groups.vre.length > 0 && foundVre.size < 3) { foundVre.add(jno); rows.push(...groups.vre); }
        if (groups.sputum.length > 0 && foundSputum.size < 1) { foundSputum.add(jno); rows.push(...groups.sputum); }
        if (groups.stool.length > 0 && foundStool.size < 1) { foundStool.add(jno); rows.push(...groups.stool); }
        if (groups.bloodCulture.length > 0 && foundBloodCulture.size < 1) { foundBloodCulture.add(jno); rows.push(...groups.bloodCulture); }
        rows.push(...groups.unclassified);
      } else {
        if (skipBloodCulture && groups.bloodCulture.length > 0) {
          console.log(`  ${detailIndex + 1}/${sortedRows.length} 건너뜀 (혈액배양 포함)`);
          continue;
        }
        if (groups.blood.length > 0) foundBlood.add(jno);
        if (groups.urine.length > 0) foundUrine.add(jno);
        rows.push(...groups.blood, ...groups.urine, ...groups.unclassified);
        lastCollectedDate = resultRow.DAT;
      }
      console.log(`  ${detailIndex + 1}/${sortedRows.length} 완료`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      failures.push({ patientName, stage: "detail", jno: resultRow.JNO, message: error.message });
      console.log(`  ${detailIndex + 1}/${sortedRows.length} 실패: ${error.message}`);
    }
  }

  return { captured, rows, failures, detailTemplate };
}
