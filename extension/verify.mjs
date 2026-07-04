// 실제 SRMS raw 응답으로 익스텐션 라이브러리 로직을 검증한다. (node.exe extension/verify.mjs)
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractLabRows } from "./lib/extract.js";
import { classifyRows, summarizeRows, otherTestRows } from "./lib/classify.js";
import { hasResult } from "./lib/srms.js";

const RAW = join(process.env.LOCALAPPDATA, "TrinityLabSummary", "raw");
const files = [
  "batch-2026-06-11T03-53-47-358Z.json",
  "capture-2026-06-11T05-49-52-419Z.json",
  "capture-2026-06-12T06-26-56-423Z.json"
];

let pass = 0, fail = 0;
const check = (name, cond) => { (cond ? pass++ : fail++); console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`); };

console.log("=== 1. 상세 응답 추출 → 혈액/UA 제외 필터 ===");
let bloodUaOnlyChecked = false;
let otherChecked = false;
for (const f of files) {
  const data = JSON.parse(await readFile(join(RAW, f), "utf8"));
  for (const e of data) {
    if (!e.url.includes("rstUserDtl")) continue;
    const rows = extractLabRows(e.payload, e.url);
    if (!rows.length) continue;
    const g = classifyRows(rows);
    const others = otherTestRows(rows);
    const etc = e.resultRow?.ETCINF || "";

    // 기타검사(객담/대변/VRE/배양)가 포함된 상세는 summarize 결과가 비지 않아야 함
    if (/sputum|stool|blood culture|rectal swab/i.test(etc)) {
      const s = summarizeRows(rows);
      if (!otherChecked) {
        check(`기타검사(${etc}) → 요약 항목 추출됨 (${s.length}건)`, s.length > 0);
        console.log("      예:", JSON.stringify(s.slice(0, 2)));
        otherChecked = true;
      }
    }

    // 혈액/UA 만 있는 상세(Serum/Urine 등, 배양 아님)는 summarize 결과가 비어야 함
    if (/serum|urine|edta/i.test(etc) && !/sputum|stool|culture|swab/i.test(etc)) {
      if (!bloodUaOnlyChecked && (g.blood.length || g.urine.length)) {
        check(`혈액/UA 전용(${etc}) → 기타 필터 후 ${others.length}건 (blood ${g.blood.length}, urine ${g.urine.length})`,
          others.length === 0);
        bloodUaOnlyChecked = true;
      }
    }
  }
}

console.log("\n=== 2. STS 상태 판정 (hasResult) ===");
check("STS=1(검사중) → 결과없음", hasResult({ STS: "1" }) === false);
check("STS=2(완료) → 결과있음", hasResult({ STS: "2" }) === true);
check("STS=4(중간보고) → 결과있음", hasResult({ STS: "4" }) === true);

console.log("\n=== 3. 신규 판정 전이 (isNewResult 사양) ===");
// monitor.js 의 isNewResult 사양을 복제해 검증
function isNewResult(prev, row) {
  if (!hasResult(row)) return false;
  const now = String(row.STS);
  if (prev === undefined) return false;
  if (prev === "2") return false;
  return prev !== now;
}
check("최초관찰(baseline) → 알림 안함", isNewResult(undefined, { STS: "2" }) === false);
check("검사중→완료 → 알림", isNewResult("1", { STS: "2" }) === true);
check("검사중→중간보고 → 알림", isNewResult("1", { STS: "4" }) === true);
check("중간보고→완료 → 알림", isNewResult("4", { STS: "2" }) === true);
check("완료 유지 → 알림 안함", isNewResult("2", { STS: "2" }) === false);
check("중간보고 유지 → 알림 안함", isNewResult("4", { STS: "4" }) === false);
check("검사중 유지 → 알림 안함", isNewResult("1", { STS: "1" }) === false);

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
