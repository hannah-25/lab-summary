import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { extractLabRows } from "./extract.mjs";
import { classifyRows } from "./classify.mjs";
import { buildPatientReport, buildPatientView, groupByPatient } from "./report.mjs";
import { openViewer } from "./html.mjs";

const isMicro = process.argv.includes("--micro");

const SRMS_URL = "https://srms.seegenemedical.com/main.do";
const LIST_URL = "https://srms.seegenemedical.com/rstUserList.do";
const DETAIL_URL = "https://srms.seegenemedical.com/rstUserDtl.do";
const DATA_DIR = join(process.env.LOCALAPPDATA || ".", "TrinityLabSummary");
const PROFILE_DIR = join(DATA_DIR, "srms-profile");
const RAW_DIR = join(DATA_DIR, "raw");
const OUTPUT_DIR = join(DATA_DIR, "output");

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeName(value) {
  return String(value || "unknown").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

function scalarForm(object) {
  return Object.fromEntries(
    Object.entries(object || {})
      .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
      .map(([key, value]) => [key, String(value)])
  );
}

function ymd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function parseYmd(value) {
  const cleaned = String(value || "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(cleaned)) return "";
  const year = Number(cleaned.slice(0, 4));
  const month = Number(cleaned.slice(4, 6));
  const day = Number(cleaned.slice(6, 8));
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? cleaned : "";
}

function uniqueRows(rows) {
  return [...new Map(rows.map((row) => [
    [row.patientJno, row.chartNo, row.name, row.result, row.flag, row.date, row.sample, row.parent].join("|"),
    row
  ])).values()];
}


function searchVariants(name) {
  const withoutSuffix = name.replace(/\d+$/, "");
  return withoutSuffix && withoutSuffix !== name ? [name, withoutSuffix] : [name];
}

async function postJson(request, url, form) {
  const response = await request.post(url, { form });
  if (!response.ok()) throw new Error(`${response.status()} ${response.statusText()}`);
  const payload = await response.json().catch(() => null);
  if (!payload) throw new Error("JSON 응답이 아닙니다. 로그인 세션을 확인하세요.");
  return payload;
}

async function searchPatient(request, listTemplate, name) {
  for (const keyword of searchVariants(name)) {
    const payload = await postJson(request, LIST_URL, { ...listTemplate, I_NAM: keyword });
    const rows = (payload.resultList || []).filter((row) => String(row.NAM || "").trim() === name);
    if (rows.length) return { rows, payload, keyword };
  }
  return { rows: [], payload: null, keyword: name };
}

async function fetchDetail(request, detailTemplate, resultRow) {
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

async function saveOutputs(rows, failures, runId, mode) {
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

await mkdir(RAW_DIR, { recursive: true });
await mkdir(OUTPUT_DIR, { recursive: true });

const rl = createInterface({ input, output });

// 환자 이름 입력
const nameInput = await rl.question("환자 이름 (여러 명은 쉼표로 구분): ");
const patientNames = [...new Set(
  nameInput.split(",").map((n) => n.trim()).filter(Boolean)
)];
if (!patientNames.length) {
  rl.close();
  throw new Error("환자 이름을 입력하세요.");
}

// 날짜 입력
const defaultTo = new Date();
const defaultFrom = new Date(defaultTo);
defaultFrom.setDate(defaultFrom.getDate() - (isMicro ? 30 : 60));
const fromAnswer = await rl.question(`조회 시작일 [${ymd(defaultFrom)}]: `);
const fromDate = parseYmd(fromAnswer) || ymd(defaultFrom);
const toDate = ymd(defaultTo);

// 브라우저 실행
const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chrome",
  headless: false,
  viewport: null
});
const page = context.pages()[0] ?? await context.newPage();

// 로그인 세션에서 API 양식 자동 수집
let listTemplate = null;
let detailTemplate = null;

context.on("response", async (response) => {
  try {
    const url = response.url();
    if (url.includes("/rstUserList.do") && !listTemplate) {
      const payload = await response.json().catch(() => null);
      if (payload && "resultList" in payload) {
        listTemplate = scalarForm(payload);
        console.log("  → 검색 양식 수집 완료");
      }
    }
    if (url.includes("/rstUserDtl.do") && !detailTemplate) {
      const payload = await response.json().catch(() => null);
      if (payload?.param_rstUserDtl) {
        detailTemplate = scalarForm(payload.param_rstUserDtl);
      }
    }
  } catch {
    // 무시
  }
});

await page.goto(SRMS_URL);
console.log("");
console.log("검사결과 목록 화면으로 이동하세요.");
console.log("(목록이 뜨면 양식이 자동 수집됩니다)");
console.log("");

await rl.question("이동 완료 후 Enter: ");
rl.close();

if (!listTemplate) {
  await context.close();
  throw new Error("검색 양식을 수집하지 못했습니다. 검사결과 목록 화면으로 이동했는지 확인하세요.");
}

const templateWithDates = {
  ...listTemplate,
  I_FDT: fromDate,
  I_TDT: toDate,
  I_CNT: "1000",
  I_ICNT: "1000"
};

console.log(`\n조회 기간: ${fromDate} ~ ${toDate}`);
console.log(`대상 환자: ${patientNames.join(", ")}\n`);

const captured = [];
const collectedRows = [];
const failures = [];

try {
  for (const [index, patientName] of patientNames.entries()) {
    console.log(`[${index + 1}/${patientNames.length}] ${patientName} 검색`);
    try {
      const search = await searchPatient(context.request, templateWithDates, patientName);
      captured.push({ url: LIST_URL, patientName, keyword: search.keyword, payload: search.payload });
      if (!search.rows.length) {
        failures.push({ patientName, stage: "search", message: "검색 결과 없음" });
        console.log("  검색 결과 없음");
        continue;
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
          if (isMicro || resultRow.DAT !== lastCollectedDate) {
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
          const payload = await fetchDetail(context.request, detailTemplate, resultRow);
          if (!detailTemplate && payload?.param_rstUserDtl) {
            detailTemplate = scalarForm(payload.param_rstUserDtl);
          }
          captured.push({ url: DETAIL_URL, patientName, resultRow, payload });
          const extracted = extractLabRows(payload, DETAIL_URL);
          const groups = classifyRows(extracted);
          const jno = String(resultRow.JNO);
          if (isMicro) {
            if (groups.vre.length > 0 && foundVre.size < 3) {
              foundVre.add(jno);
              collectedRows.push(...groups.vre);
            }
            if (groups.sputum.length > 0 && foundSputum.size < 1) {
              foundSputum.add(jno);
              collectedRows.push(...groups.sputum);
            }
            if (groups.stool.length > 0 && foundStool.size < 1) {
              foundStool.add(jno);
              collectedRows.push(...groups.stool);
            }
            if (groups.bloodCulture.length > 0 && foundBloodCulture.size < 1) {
              foundBloodCulture.add(jno);
              collectedRows.push(...groups.bloodCulture);
            }
            collectedRows.push(...groups.unclassified);
          } else {
            if (groups.bloodCulture.length > 0) {
              console.log(`  ${detailIndex + 1}/${sortedRows.length} 건너뜀 (혈액배양 포함)`);
              continue;
            }
            if (groups.blood.length > 0) foundBlood.add(jno);
            if (groups.urine.length > 0) foundUrine.add(jno);
            collectedRows.push(...groups.blood, ...groups.urine, ...groups.unclassified);
            lastCollectedDate = resultRow.DAT;
          }
          console.log(`  ${detailIndex + 1}/${sortedRows.length} 완료`);
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          failures.push({ patientName, stage: "detail", jno: resultRow.JNO, message: error.message });
          console.log(`  ${detailIndex + 1}/${sortedRows.length} 실패: ${error.message}`);
        }
      }
    } catch (error) {
      failures.push({ patientName, stage: "patient", message: error.message });
      console.log(`  실패: ${error.message}`);
    }
  }
} finally {
  await context.close();
}

const runId = timestamp();
await writeFile(join(RAW_DIR, `capture-${runId}.json`), JSON.stringify(captured, null, 2), "utf8");

const rows = uniqueRows(collectedRows);
const mode = isMicro ? "micro" : "blood";
const paths = await saveOutputs(rows, failures, runId, mode);

console.log("");
console.log(`${groupByPatient(rows).size}명, ${rows.length}개 검사 결과 저장 완료`);
if (failures.length) console.log(`실패 ${failures.length}건 → ${paths.failurePath}`);
console.log(paths.viewerPath);
