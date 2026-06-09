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

export function buildPatientReport(rows, { mode = "blood" } = {}) {
  const groups = classifyRows(rows);
  const identity = rows.find((row) => row.patientName || row.patientJno) ?? {};
  const title = [identity.patientName, identity.chartNo && `(${identity.chartNo})`]
    .filter(Boolean)
    .join(" ");

  const sections = [title || "환자 미확인"];

  if (mode !== "micro") {
    const blood = splitRecentAndPrevious(groups.blood);
    const urine = splitRecentAndPrevious(groups.urine);
    if (blood.recentDate || blood.previousDate) {
      sections.push(`검사일 : ${blood.recentDate || "-"} <- ${blood.previousDate || "-"}`);
    }
    sections.push(buildBloodSummary(blood.previousRows, blood.recentRows));
    sections.push(buildUaSummary(urine.previousRows, urine.recentRows));
  }

  if (mode !== "blood") {
    sections.push(formatMicroSection("Sputum", groups.sputum));
    sections.push(formatMicroSection("Stool", groups.stool));
    sections.push(formatMicroSection("VRE/CRE", groups.vre, { maxDates: 3 }));
    sections.push(formatMicroSection("Blood culture", groups.bloodCulture));
  }

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

export function buildPatientView(rows, { mode = "blood" } = {}) {
  const groups = classifyRows(rows);
  const identity = rows.find((row) => row.patientName || row.chartNo) ?? {};
  const view = {
    id: identity.chartNo || identity.patientJno || identity.patientName || "unknown",
    name: identity.patientName || "환자 미확인",
    chartNo: identity.chartNo || "",
    recentDate: "",
    previousDate: "",
    isNewToday: false,
    lab: "",
    ua: "",
    sputum: [],
    stool: [],
    vreCre: [],
    bloodCulture: [],
    unclassified: groups.unclassified.map((row) => ({
      date: row.date || row.accessionDate || "",
      name: row.name,
      result: row.result
    }))
  };

  if (mode !== "micro") {
    const blood = splitRecentAndPrevious(groups.blood);
    const urine = splitRecentAndPrevious(groups.urine);
    view.recentDate = blood.recentDate;
    view.previousDate = blood.previousDate;
    view.isNewToday = blood.recentDate === yesterday();
    view.lab = groups.blood.length ? buildBloodSummary(blood.previousRows, blood.recentRows) : "";
    view.ua = groups.urine.length ? buildUaSummary(urine.previousRows, urine.recentRows) : "";
  }

  if (mode !== "blood") {
    view.sputum = microItems(groups.sputum);
    view.stool = microItems(groups.stool);
    view.vreCre = microItems(groups.vre, { maxDates: 3 });
    view.bloodCulture = microItems(groups.bloodCulture);
  }

  return view;
}
