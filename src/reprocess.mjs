import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractLabRows } from "./extract.mjs";
import { buildPatientReport, buildPatientView, groupByPatient } from "./report.mjs";
import { openViewer } from "./html.mjs";

const DATA_DIR = join(process.env.LOCALAPPDATA || ".", "TrinityLabSummary");
const RAW_DIR = join(DATA_DIR, "raw");
const OUTPUT_DIR = join(DATA_DIR, "output");

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safeName(value) {
  return String(value || "unknown").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

const files = (await readdir(RAW_DIR))
  .filter((file) => file.startsWith("capture-") && file.endsWith(".json"))
  .sort()
  .reverse();

if (!files.length) {
  throw new Error("재처리할 캡처 파일이 없습니다.");
}

const captured = JSON.parse(await readFile(join(RAW_DIR, files[0]), "utf8"));
const rows = captured.flatMap((entry) => extractLabRows(entry.payload, entry.url));
const uniqueRows = [...new Map(rows.map((row) => [
  [
    row.patientJno,
    row.chartNo,
    row.name,
    row.result,
    row.flag,
    row.date,
    row.sample,
    row.parent
  ].join("|"),
  row
])).values()];

await mkdir(OUTPUT_DIR, { recursive: true });
const runId = timestamp();
const reports = [];
const views = [];
for (const [key, patientRows] of groupByPatient(uniqueRows)) {
  const report = buildPatientReport(patientRows);
  reports.push(report);
  views.push(buildPatientView(patientRows));
  await writeFile(join(OUTPUT_DIR, `${safeName(key)}-${runId}.txt`), report, "utf8");
}

const outputPath = join(OUTPUT_DIR, `all-${runId}.txt`);
await writeFile(outputPath, reports.join("\n\n--------------------\n\n"), "utf8");
const viewerPath = join(OUTPUT_DIR, `viewer-${runId}.json`);
const viewerData = { generatedAt: new Date().toISOString(), patients: views };
await writeFile(viewerPath, JSON.stringify(viewerData, null, 2), "utf8");
await openViewer(viewerData, viewerPath);
console.log(`${groupByPatient(uniqueRows).size}명, ${uniqueRows.length}개 검사 결과를 재처리했습니다.`);
console.log(outputPath);
console.log(viewerPath);
