// buildPatientView(뷰어 구조체) 가 CLI 와 동일한지 검증. (node.exe extension/verify-view.mjs)
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractLabRows } from "./lib/extract.js";
import { groupByPatient, uniqueRows, buildPatientView } from "./lib/report.js";
import { buildPatientView as cliBuildPatientView } from "../src/report.mjs";

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

let pass = 0, fail = 0, shown = false;
for (const [key, patientRows] of groupByPatient(rows)) {
  const ext = buildPatientView(patientRows);
  const cli = cliBuildPatientView(patientRows, { mode: "blood" });
  // CLI blood 모드는 micro 섹션을 비움 → 비교 시 lab/ua/dates 핵심 필드만 대조
  const same = ext.lab === cli.lab && ext.ua === cli.ua
    && ext.recentDate === cli.recentDate && ext.previousDate === cli.previousDate
    && ext.name === cli.name && ext.chartNo === cli.chartNo;
  (same ? pass++ : fail++);
  console.log(`  ${same ? "PASS" : "FAIL"}  ${key} (${ext.name})`);
  if (!same) {
    console.log("    ext:", JSON.stringify({ lab: ext.lab, ua: ext.ua, r: ext.recentDate, p: ext.previousDate }));
    console.log("    cli:", JSON.stringify({ lab: cli.lab, ua: cli.ua, r: cli.recentDate, p: cli.previousDate }));
  } else if (!shown && ext.lab) {
    console.log("    구조 예시:", JSON.stringify({
      name: ext.name, chartNo: ext.chartNo, recentDate: ext.recentDate, previousDate: ext.previousDate,
      lab: ext.lab.split("\n")[0], sputum: ext.sputum.length, unclassified: ext.unclassified.length
    }));
    shown = true;
  }
}
console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
