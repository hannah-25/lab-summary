// 혈액/UA 포맷 패리티 검증: 익스텐션 buildBloodUaReport 와 CLI buildPatientReport(blood) 가
// 동일 입력에 대해 같은 출력을 내는지 확인. (node.exe extension/verify-blood.mjs)
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractLabRows } from "./lib/extract.js";
import { groupByPatient, uniqueRows, buildBloodUaReport } from "./lib/report.js";
import { buildPatientReport } from "../src/report.mjs";

const RAW = join(process.env.LOCALAPPDATA, "TrinityLabSummary", "raw");
const files = [
  "batch-2026-06-11T03-53-47-358Z.json",
  "capture-2026-06-11T05-49-52-419Z.json",
  "capture-2026-06-12T06-26-56-423Z.json"
];

const allRows = [];
for (const f of files) {
  const data = JSON.parse(await readFile(join(RAW, f), "utf8"));
  for (const e of data) {
    if (!e.url.includes("rstUserDtl")) continue;
    allRows.push(...extractLabRows(e.payload, e.url));
  }
}
const rows = uniqueRows(allRows);
console.log(`추출 행 ${rows.length}개, 환자 ${groupByPatient(rows).size}명\n`);

let pass = 0, fail = 0;
let shownSample = false;
for (const [key, patientRows] of groupByPatient(rows)) {
  const ext = buildBloodUaReport(patientRows);
  const cli = buildPatientReport(patientRows, { mode: "blood" });
  const same = ext === cli;
  (same ? pass++ : fail++);
  console.log(`  ${same ? "PASS" : "FAIL"}  ${key}`);
  if (!same) {
    console.log("    --- 익스텐션 ---\n" + ext);
    console.log("    --- CLI ---\n" + cli);
  } else if (!shownSample) {
    console.log("    예시 출력:\n" + ext.split("\n").map((l) => "      " + l).join("\n"));
    shownSample = true;
  }
}
console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
