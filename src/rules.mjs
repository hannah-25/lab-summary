const ABBR = new Map(Object.entries({
  "Protein, total": "Pro",
  Albumin: "Alb",
  BUN: "BUN",
  Creatinine: "Cr",
  Glucose: "Glu",
  "Bilirubin, total": "T-bil",
  "AST (GOT)": "OT",
  "ALT (GPT)": "PT",
  "GGT (γ-GTP)": "GGT",
  ALP: "ALP",
  "CK (Creatine kinase)": "CK",
  "ACP (Acid phosphatase)": "ACP",
  "Cholesterol,total": "TC",
  "Triglyceride (TG)": "TG",
  "Sodium (Na)": "Na",
  "Potassium (K)": "K",
  "Chloride (Cl)": "Cl",
  "CO2, Total": "CO2",
  "Cystatin-C": "CysC",
  "eGFR (CKD-EPI 2012)": "eGFR",
  "ADA (Adenosine deaminase)": "ADA",
  WBC: "WBC",
  RBC: "RBC",
  "Hemoglobin (Hb)": "Hb",
  "Hematocrit (Hct)": "Hct",
  Platelet: "PLT",
  "Absolute neutrophil count (ANC)": "ANC",
  "CRP (정량)": "CRP",
  Procalcitonin: "PCT",
  TSH: "TSH",
  "Free T4": "T4",
  "Free T3": "T3"
}));

const UA_ABBR = new Map(Object.entries({
  PH: "pH",
  Nitrite: "Nit",
  "S.G": "SG",
  Protein: "Pro",
  Glucose: "Glu",
  Ketone: "Ket",
  Bilirubin: "Bil",
  "Occult Blood": "OB",
  Urobilinogen: "Uro",
  "Leukocyte esterase": "LE",
  RBC: "uRBC",
  WBC: "uWBC",
  "E.P cells": "Epi",
  Casts: "Cast",
  Bacteria: "Bac",
  Crystals: "Cry",
  Others: "Other"
}));

const IGNORE = new Set([
  "MCV",
  "MCH",
  "MCHC",
  "Segmented neutrophil",
  "Band",
  "Lymphocyte",
  "Monocyte",
  "Eosinophil",
  "Basophil",
  "Differential count"
]);

const LAB_ORDER = [
  "WBC",
  "CRP (정량)",
  "Protein, total",
  "Albumin",
  "BUN",
  "Creatinine",
  "Glucose",
  "Bilirubin, total",
  "AST (GOT)",
  "ALT (GPT)",
  "GGT (γ-GTP)",
  "ALP",
  "CK (Creatine kinase)",
  "ACP (Acid phosphatase)",
  "Cholesterol,total",
  "Triglyceride (TG)",
  "Chloride (Cl)",
  "CO2, Total",
  "Cystatin-C",
  "eGFR (CKD-EPI 2012)",
  "ADA (Adenosine deaminase)",
  "RBC",
  "Hemoglobin (Hb)",
  "Hematocrit (Hct)",
  "Platelet",
  "Absolute neutrophil count (ANC)",
  "Procalcitonin",
  "TSH",
  "Free T4",
  "Free T3"
];

const UA_ORDER = [
  "PH",
  "Nitrite",
  "S.G",
  "Protein",
  "Glucose",
  "Ketone",
  "Bilirubin",
  "Occult Blood",
  "Urobilinogen",
  "Leukocyte esterase",
  "RBC",
  "WBC",
  "E.P cells",
  "Casts",
  "Bacteria",
  "Crystals",
  "Others"
];

function normalizeValue(value) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned || cleaned === "**") return "";
  if (/보고\s*예정|보고예정|^\d{2}\/\d{2}\s+\S+/.test(cleaned)) return "예정";
  if (/positive/i.test(cleaned)) return cleaned.replace(/positive/ig, "p");
  return cleaned;
}

function canonicalName(name) {
  const cleaned = String(name ?? "").trim();
  if (/^CRP\b/.test(cleaned)) return "CRP (정량)";
  return cleaned;
}

function normalizeFlag(flag) {
  const cleaned = String(flag ?? "").trim().toUpperCase();
  return cleaned === "H" || cleaned === "L" ? cleaned : "";
}

function normalizeDate(date) {
  const cleaned = String(date ?? "").replaceAll("-", "").trim();
  return /^\d{8}$/.test(cleaned) ? cleaned : "";
}

function valueWithFlag(row) {
  if (!row) return "";
  const value = normalizeValue(row.result);
  return value ? `${value}${normalizeFlag(row.flag)}` : "";
}

function formattedResult(row) {
  if (!row) return "()";
  return `(${normalizeValue(row.result)})${normalizeFlag(row.flag)}`;
}

function isUaParent(parent) {
  return parent === "Urine(10)" || parent === "Microscopic (Flow Cytometry)";
}

function indexRows(rows) {
  const lab = new Map();
  const ua = new Map();

  for (const original of rows) {
    const row = { ...original, name: canonicalName(original.name) };
    if (row.result === "**" || IGNORE.has(row.name)) continue;
    const isBloodSample = /serum|plasma|edta/i.test(row.sample || "");
    if (!isBloodSample && (isUaParent(row.parent) || /urine|뇨|소변/i.test(row.sample || ""))) {
      if (UA_ABBR.has(row.name)) ua.set(row.name, row);
      continue;
    }
    if (ABBR.has(row.name)) lab.set(row.name, row);
  }
  return { lab, ua };
}

function isPending(row) {
  return normalizeValue(row?.result) === "예정";
}

function hasFlag(row) {
  return normalizeFlag(row?.flag) !== "";
}

function numericValue(value) {
  const match = String(value ?? "").replace(",", "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

function simpleRange(reference) {
  const cleaned = String(reference ?? "")
    .replace(/[＜≤]/g, "<")
    .replace(/[＞≥]/g, ">")
    .replace(/\s+/g, " ");
  const between = cleaned.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
  if (between) return { min: Number(between[1]), max: Number(between[2]) };
  const upper = cleaned.match(/<\s*(-?\d+(?:\.\d+)?)/);
  if (upper) return { max: Number(upper[1]) };
  const lower = cleaned.match(/>\s*(-?\d+(?:\.\d+)?)/);
  if (lower) return { min: Number(lower[1]) };
  return null;
}

function isUaAbnormal(row) {
  if (!row) return false;
  if (hasFlag(row)) return true;
  const value = normalizeValue(row.result);
  if (!value || value === "예정") return false;

  const lowValue = value.toLowerCase();
  const lowRef = String(row.reference ?? "").trim().toLowerCase();
  if (["negative", "normal", "not found"].includes(lowRef)) return lowValue !== lowRef;

  const range = simpleRange(row.reference);
  const number = numericValue(value);
  if (!range || !Number.isFinite(number)) return false;
  return (range.min !== undefined && number < range.min)
    || (range.max !== undefined && number > range.max);
}

function shouldShowLab(name, recentRow, previousRow) {
  if (name === "WBC" || name === "CRP (정량)") return true;
  if (name === "Glucose") {
    const recentValue = numericValue(recentRow?.result);
    const previousValue = numericValue(previousRow?.result);
    return (Number.isFinite(recentValue) && recentValue > 150)
      || (Number.isFinite(previousValue) && previousValue > 150);
  }
  return hasFlag(recentRow) || hasFlag(previousRow)
    || (isPending(recentRow) && hasFlag(previousRow));
}

function formatPair(label, recentRow, previousRow) {
  return `${label}${formattedResult(recentRow)}<-${formattedResult(previousRow)}`;
}

function formatCombined(label, firstName, secondName, recent, previous) {
  return `${label}(${valueWithFlag(recent.lab.get(firstName))}/${valueWithFlag(recent.lab.get(secondName))})`
    + `<-(${valueWithFlag(previous.lab.get(firstName))}/${valueWithFlag(previous.lab.get(secondName))})`;
}

function shouldShowCombined(firstName, secondName, recent, previous) {
  return shouldShowLab(firstName, recent.lab.get(firstName), previous.lab.get(firstName))
    || shouldShowLab(secondName, recent.lab.get(secondName), previous.lab.get(secondName));
}

function sortByOrder(names, order) {
  const orderMap = new Map(order.map((name, index) => [name, index]));
  return names.sort((a, b) => (orderMap.get(a) ?? 999) - (orderMap.get(b) ?? 999)
    || a.localeCompare(b));
}

function wrapItems(prefix, items) {
  if (!items.length) return `${prefix} :`;
  const indent = " ".repeat(prefix.length + 3);
  const columns = 3;
  const gap = 4;
  const widths = Array.from({ length: columns }, (_, column) => Math.max(
    ...items
      .filter((_, index) => index % columns === column)
      .map((item) => item.length),
    0
  ));
  const lines = [];
  for (let index = 0; index < items.length; index += columns) {
    const line = items.slice(index, index + columns)
      .map((item, offset) => {
        const column = index + offset;
        return offset < columns - 1
          ? item.padEnd(widths[column % columns] + gap, " ")
          : item;
      })
      .join("")
      .trimEnd();
    lines.push(index === 0 ? `${prefix} : ${line}` : `${indent}${line}`);
  }
  return lines.join("\n");
}

function displayLabel(name, recentRow) {
  const label = ABBR.get(name) || name;
  if (name !== "Albumin") return label;
  const recentValue = numericValue(recentRow?.result);
  return Number.isFinite(recentValue) && recentValue >= 2 && recentValue < 3
    ? `★${label}`
    : label;
}

export function buildBloodSummary(previousRows, recentRows) {
  const previous = indexRows(previousRows);
  const recent = indexRows(recentRows);
  const labItems = [
    formatPair("WBC", recent.lab.get("WBC"), previous.lab.get("WBC")),
    formatPair("CRP", recent.lab.get("CRP (정량)"), previous.lab.get("CRP (정량)")),
    formatCombined("Na/K", "Sodium (Na)", "Potassium (K)", recent, previous)
  ];

  if (shouldShowCombined("BUN", "Creatinine", recent, previous)) {
    labItems.push(formatCombined("BUN/Cr", "BUN", "Creatinine", recent, previous));
  }
  if (shouldShowCombined("AST (GOT)", "ALT (GPT)", recent, previous)) {
    labItems.push(formatCombined("OT/PT", "AST (GOT)", "ALT (GPT)", recent, previous));
  }

  const names = new Set([...previous.lab.keys(), ...recent.lab.keys()]);
  for (const name of [
    "WBC", "CRP (정량)", "Sodium (Na)", "Potassium (K)",
    "BUN", "Creatinine", "AST (GOT)", "ALT (GPT)"
  ]) names.delete(name);

  for (const name of sortByOrder([...names], LAB_ORDER)) {
    const recentRow = recent.lab.get(name);
    const previousRow = previous.lab.get(name);
    if (!shouldShowLab(name, recentRow, previousRow)) continue;
    labItems.push(formatPair(displayLabel(name, recentRow), recentRow, previousRow));
  }

  return wrapItems("Lab 결과", labItems);
}

export function buildUaSummary(previousRows, recentRows) {
  const previous = indexRows(previousRows);
  const recent = indexRows(recentRows);
  const uaItems = [];
  const uaNames = sortByOrder([...new Set([...previous.ua.keys(), ...recent.ua.keys()])], UA_ORDER);
  for (const name of uaNames) {
    const recentRow = recent.ua.get(name);
    const previousRow = previous.ua.get(name);
    if (!isUaAbnormal(recentRow) && !isUaAbnormal(previousRow)) continue;
    uaItems.push(formatPair(UA_ABBR.get(name) || name, recentRow, previousRow));
  }

  if (!uaItems.length && uaNames.length > 0) return "UA 결과 : Normal";
  return wrapItems("UA 결과", uaItems);
}

export function splitRecentAndPrevious(rows) {
  const accessions = new Map();
  for (const row of rows) {
    const key = normalizeDate(row.accessionDate) || normalizeDate(row.date) || row.patientJno;
    if (!key) continue;
    if (!accessions.has(key)) accessions.set(key, []);
    accessions.get(key).push(row);
  }
  const sorted = [...accessions.entries()].sort(([, rowsA], [, rowsB]) => {
    const dateA = normalizeDate(rowsA[0]?.accessionDate)
      || rowsA.map((row) => normalizeDate(row.date)).filter(Boolean).sort().reverse()[0]
      || "";
    const dateB = normalizeDate(rowsB[0]?.accessionDate)
      || rowsB.map((row) => normalizeDate(row.date)).filter(Boolean).sort().reverse()[0]
      || "";
    return dateB.localeCompare(dateA);
  });
  const recentRows = sorted[0]?.[1] ?? [];
  const previousRows = sorted[1]?.[1] ?? [];
  return {
    recentDate: normalizeDate(recentRows[0]?.accessionDate)
      || recentRows.map((row) => normalizeDate(row.date)).filter(Boolean).sort().reverse()[0]
      || "",
    previousDate: normalizeDate(previousRows[0]?.accessionDate)
      || previousRows.map((row) => normalizeDate(row.date)).filter(Boolean).sort().reverse()[0]
      || "",
    recentRows,
    previousRows
  };
}
