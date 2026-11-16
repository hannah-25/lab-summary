// 실제 SRMS raw 응답으로 익스텐션 라이브러리 로직을 검증한다. (node.exe extension/verify.mjs)
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractLabRows } from "./lib/extract.js";
import { classifyRows, summarizeRows, otherTestRows } from "./lib/classify.js";
import { hasResult } from "./lib/srms.js";
import { buildBloodUaReport, buildPatientView } from "./lib/report.js";
import { isNewResult, runCheck } from "./lib/monitor.js";
import { ymd } from "./lib/lookup.js";

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

console.log("\n=== 3. 신규 판정 전이 (monitor.isNewResult) ===");
{
  const SINCE = "20261110";
  const r = (STS, DAT = "20261115") => ({ STS, DAT });
  check("검사중→완료 → 알림", isNewResult("1", r("2"), SINCE) === true);
  check("검사중→중간보고 → 알림", isNewResult("1", r("4"), SINCE) === true);
  check("중간보고→완료 → 알림", isNewResult("4", r("2"), SINCE) === true);
  check("완료 유지 → 알림 안함", isNewResult("2", r("2"), SINCE) === false);
  check("중간보고 유지 → 알림 안함", isNewResult("4", r("4"), SINCE) === false);
  check("검사중 유지 → 알림 안함", isNewResult("1", r("1"), SINCE) === false);
  check("처음 보는 접수 · 최근 접수 · 완료 → 알림", isNewResult(undefined, r("2"), SINCE) === true);
  check("처음 보는 접수 · 오래된 접수 → 알림 안함 (기준값)", isNewResult(undefined, r("2", "20261001"), SINCE) === false);
  check("처음 보는 접수 · 검사중 → 알림 안함", isNewResult(undefined, r("1"), SINCE) === false);
  check("처음 보는 접수 · 접수일 없음 → 알림 안함", isNewResult(undefined, { STS: "2" }, SINCE) === false);
}

console.log("\n=== 4. 혈액/UA 검사일 분리 표시 ===");
{
  const r = (dat, name, result, sample) => ({
    patientName: "테스트", chartNo: "C1", accessionDate: dat, name, result, sample, flag: "", reference: "Negative"
  });
  // 11/15 혈액+UA, 11/12 UA만, 11/10 혈액만 → 혈액과 UA 의 이전 검사일이 다르다
  const rows = [
    r("20261115", "WBC", "12.3", "EDTA W/B"), r("20261115", "Protein", "1+", "Random Urine"),
    r("20261112", "Protein", "2+", "Random Urine"), r("20261110", "WBC", "9.8", "EDTA W/B")
  ];
  const text = buildBloodUaReport(rows);
  check("팝업 텍스트: 혈액 검사일", text.includes("혈액 검사일 : 20261115 <- 20261110\nLab 결과"));
  check("팝업 텍스트: UA 검사일 따로", text.includes("UA 검사일 : 20261115 <- 20261112\nUA 결과"));
  const v = buildPatientView(rows);
  check("뷰어 데이터: 혈액/UA 날짜 분리", v.labPreviousDate === "20261110" && v.uaPreviousDate === "20261112");
}

console.log("\n=== 5. runCheck: 조회 기간 · 오류 시 알림 보존 (chrome/fetch 가짜) ===");
{
  let mem = {};
  globalThis.chrome = { storage: { local: {
    get: async (defaults) => structuredClone({ ...defaults, ...mem }),
    set: async (patch) => { Object.assign(mem, structuredClone(patch)); }
  } } };
  const listBodies = [];
  const listRows = {};          // 이름 → 목록 행
  const detailFails = new Set(); // 상세 조회가 500 을 내는 JNO
  let loginFailFor = null;       // 목록 조회 시 로그인 페이지를 돌려줄 이름
  globalThis.fetch = async (url, { body }) => {
    const form = Object.fromEntries(new URLSearchParams(body));
    if (url.includes("rstUserList")) {
      listBodies.push(form);
      if (form.I_NAM === loginFailFor) return new Response("<html>login</html>");
      return Response.json({ resultList: listRows[form.I_NAM] || [] });
    }
    if (detailFails.has(form.I_JNO)) return new Response("err", { status: 500 });
    return Response.json({
      meta: { JNO: form.I_JNO, NAM: "x", CHN: "C1", DAT: form.I_DAT },
      list: [{ O_GCDN: "일반세균배양", O_CHR: "No growth", O_TNM: "Sputum", O_BDT: form.I_DAT }]
    });
  };
  const daysBack = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
  const row = (NAM, JNO, STS, DAT = daysBack(0)) => ({ NAM, JNO, STS, DAT, CHN: "C1" });

  mem = {
    templates: { list: { I_FDT: "20200101", I_TDT: "20200101" }, detail: {} },
    watchlist: ["환자가", "환자나"],
    seen: { 환자가: { 1: "1" }, 환자나: {} }
  };
  listRows["환자가"] = [row("환자가", "1", "2")];

  // A. 환자가 결과 감지 후 환자나 조회에서 세션 만료 → 환자가 상태가 저장되면 안 됨
  loginFailFor = "환자나";
  let res = await runCheck();
  check("양식의 고정 기간 대신 오늘 기준 60일로 조회",
    listBodies[0].I_FDT === daysBack(60) && listBodies[0].I_TDT === daysBack(0));
  check("세션 만료 → login-required, 감지한 접수 상태 저장 안 함",
    res.status === "login-required" && mem.seen.환자가["1"] === "1");

  // B. 상세 조회 500 → 알림 없음, 상태 되돌림
  loginFailFor = null;
  detailFails.add("1");
  res = await runCheck();
  check("상세 조회 실패 → 알림 없음, 상태 되돌림", res.newResults.length === 0 && mem.seen.환자가["1"] === "1");

  // C. 복구 후 → 알림
  detailFails.clear();
  res = await runCheck();
  check("오류 복구 후 다음 점검에서 알림", res.newResults.length === 1 && mem.seen.환자가["1"] === "2");

  // D. 감시 중인 환자에게 새 접수가 바로 완료 상태로 등장 (오래된 접수는 기준값)
  listRows["환자나"] = [row("환자나", "5", "2"), row("환자나", "6", "2", daysBack(30))];
  res = await runCheck();
  const targets = res.newResults.flatMap((r) => r.detailTargets.map((t) => t.jno));
  check("새 접수(최근)만 알림, 30일 전 접수는 기준값", targets.join(",") === "5" && mem.seen.환자나["6"] === "2");
}

console.log(`\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
