import { buildBloodSummary, buildUaSummary, splitRecentAndPrevious } from "./rules.mjs";
import { classifyRows, formatMicroSection, microItems } from "./classify.mjs";

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

export function buildPatientReport(rows) {
  const groups = classifyRows(rows);
  const blood = splitRecentAndPrevious(groups.blood);
  const urine = splitRecentAndPrevious(groups.urine);
  const identity = rows.find((row) => row.patientName || row.patientJno) ?? {};
  const title = [identity.patientName, identity.chartNo && `(${identity.chartNo})`]
    .filter(Boolean)
    .join(" ");

  const sections = [
    title || "환자 미확인",
    blood.recentDate || blood.previousDate
      ? `검사일 : ${blood.recentDate || "-"} <- ${blood.previousDate || "-"}`
      : "",
    buildBloodSummary(blood.previousRows, blood.recentRows),
    buildUaSummary(urine.previousRows, urine.recentRows),
    formatMicroSection("Sputum", groups.sputum),
    formatMicroSection("Stool", groups.stool),
    formatMicroSection("VRE/CRE", groups.vre),
    formatMicroSection("Blood culture", groups.bloodCulture)
  ];

  if (groups.unclassified.length) {
    sections.push(`미분류 : ${groups.unclassified.map((row) => `${row.name}: ${row.result}`).join("    ")}`);
  }
  return sections.filter(Boolean).join("\n\n");
}

export function buildPatientView(rows) {
  const groups = classifyRows(rows);
  const blood = splitRecentAndPrevious(groups.blood);
  const urine = splitRecentAndPrevious(groups.urine);
  const identity = rows.find((row) => row.patientName || row.chartNo) ?? {};
  return {
    id: identity.chartNo || identity.patientJno || identity.patientName || "unknown",
    name: identity.patientName || "환자 미확인",
    chartNo: identity.chartNo || "",
    recentDate: blood.recentDate,
    previousDate: blood.previousDate,
    lab: groups.blood.length ? buildBloodSummary(blood.previousRows, blood.recentRows) : "",
    ua: groups.urine.length ? buildUaSummary(urine.previousRows, urine.recentRows) : "",
    sputum: microItems(groups.sputum),
    stool: microItems(groups.stool),
    vreCre: microItems(groups.vre),
    bloodCulture: microItems(groups.bloodCulture),
    unclassified: groups.unclassified.map((row) => ({
      date: row.date || row.accessionDate || "",
      name: row.name,
      result: row.result
    }))
  };
}
