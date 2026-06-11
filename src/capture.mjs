import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  DATA_DIR, PROFILE_DIR, RAW_DIR,
  timestamp, scalarForm, ymd, parseYmd, uniqueRows,
  saveOutputs, collectPatient
} from "./srms.mjs";

const isMicro = process.argv.includes("--micro");

await mkdir(RAW_DIR, { recursive: true });
await mkdir(join(DATA_DIR, "output"), { recursive: true });

const rl = createInterface({ input, output });

const nameInput = await rl.question("환자 이름 (여러 명은 쉼표로 구분): ");
const patientNames = [...new Set(
  nameInput.split(",").map((n) => n.trim()).filter(Boolean)
)];
if (!patientNames.length) {
  rl.close();
  throw new Error("환자 이름을 입력하세요.");
}

const defaultTo = new Date();
const defaultFrom = new Date(defaultTo);
defaultFrom.setDate(defaultFrom.getDate() - (isMicro ? 30 : 60));
const fromAnswer = await rl.question(`조회 시작일 [${ymd(defaultFrom)}]: `);
const fromDate = parseYmd(fromAnswer) || ymd(defaultFrom);
const toDate = ymd(defaultTo);

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: "chrome",
  headless: false,
  viewport: null
});
const page = context.pages()[0] ?? await context.newPage();

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

await page.goto("https://srms.seegenemedical.com/main.do");
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
      const result = await collectPatient(context.request, {
        listTemplate: templateWithDates,
        detailTemplate,
        patientName,
        isMicro,
        skipBloodCulture: true,
        continueSameDate: true,
      });
      if (!detailTemplate && result.detailTemplate) detailTemplate = result.detailTemplate;
      captured.push(...result.captured);
      collectedRows.push(...result.rows);
      failures.push(...result.failures);
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
console.log(`${(await import("./report.mjs")).groupByPatient(rows).size}명, ${rows.length}개 검사 결과 저장 완료`);
if (failures.length) console.log(`실패 ${failures.length}건 → ${paths.failurePath}`);
console.log(paths.viewerPath);
