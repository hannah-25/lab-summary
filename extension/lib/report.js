// report.mjs 의 혈액/UA 부분을 이식. (미생물 분기는 감시 기능에서 별도 처리하므로 제외)
import {
  buildBloodSummary, buildUaSummary, splitRecentAndPrevious,
  buildBloodSummaryRecent, buildUaSummaryRecent
} from "./rules.js";
import { classifyRows, microItems } from "./classify.js";

function patientKey(row) {
  return row.chartNo || row.patientName || row.patientJno || "unknown";
}

export function groupByPatient(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = patientKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

export function uniqueRows(rows) {
  return [...new Map(rows.map((row) => [
    [row.patientJno, row.chartNo, row.name, row.result, row.flag, row.date, row.sample, row.parent].join("|"),
    row
  ])).values()];
}

// 환자 1명의 혈액/UA 텍스트 요약 (buildPatientReport 의 blood 모드와 동일 출력).
export function buildBloodUaReport(rows) {
  const groups = classifyRows(rows);
  const identity = rows.find((row) => row.patientName || row.patientJno) ?? {};
  const title = [identity.patientName, identity.chartNo && `(${identity.chartNo})`]
    .filter(Boolean)
    .join(" ");

  const sections = [title || "환자 미확인"];
  const blood = splitRecentAndPrevious(groups.blood);
  const urine = splitRecentAndPrevious(groups.urine);
  if (blood.recentDate || blood.previousDate) {
    sections.push(`검사일 : ${blood.recentDate || "-"} <- ${blood.previousDate || "-"}`);
  }
  sections.push(buildBloodSummary(blood.previousRows, blood.recentRows));
  sections.push(buildUaSummary(urine.previousRows, urine.recentRows));
  if (groups.unclassified.length) {
    sections.push(`미분류 : ${groups.unclassified.map((row) => `${row.name}: ${row.result}`).join("    ")}`);
  }
  return sections.filter(Boolean).join("\n\n");
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

// 뷰어(viewer.html)용 환자 구조체. (report.mjs buildPatientView 의 blood 모드 이식)
export function buildPatientView(rows) {
  const groups = classifyRows(rows);
  const identity = rows.find((row) => row.patientName || row.chartNo) ?? {};
  const blood = splitRecentAndPrevious(groups.blood);
  const urine = splitRecentAndPrevious(groups.urine);
  return {
    id: identity.chartNo || identity.patientJno || identity.patientName || "unknown",
    name: identity.patientName || "환자 미확인",
    chartNo: identity.chartNo || "",
    recentDate: blood.recentDate,
    previousDate: blood.previousDate,
    isNewToday: blood.recentDate === yesterday(),
    lab: groups.blood.length ? buildBloodSummary(blood.previousRows, blood.recentRows) : "",
    ua: groups.urine.length ? buildUaSummary(urine.previousRows, urine.recentRows) : "",
    labRecent: groups.blood.length ? buildBloodSummaryRecent(blood.recentRows) : "",
    uaRecent: groups.urine.length ? buildUaSummaryRecent(urine.recentRows) : "",
    sputum: microItems(groups.sputum),
    stool: microItems(groups.stool),
    vreCre: microItems(groups.vre, { maxDates: 3 }),
    bloodCulture: microItems(groups.bloodCulture),
    unclassified: groups.unclassified.map((row) => ({
      date: row.date || row.accessionDate || "",
      name: row.name,
      result: row.result
    }))
  };
}
