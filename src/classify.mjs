const BLOOD_SAMPLES = /serum|plasma|edta|whole\s*blood|w\/b|blood/i;
const SPUTUM_WORDS = /sputum|객담|afb|mycobacter|mtb|결핵/i;
const STOOL_WORDS = /stool|feces|faeces|대변|c\.\s*difficile|clostridioides/i;
const VRE_WORDS = /\b(?:vre|cre)\b|vancomycin.?resistant|carbapenem.?resistant|rectal\s*swab|enterococcus/i;
const BLOOD_CULTURE_WORDS = /blood\s*culture|혈액배양/i;

export function classifyRow(row) {
  const text = [row.name, row.sample, row.parent, row.remark].filter(Boolean).join(" ");
  if (VRE_WORDS.test(text)) return "vre";
  if (SPUTUM_WORDS.test(text)) return "sputum";
  if (STOOL_WORDS.test(text)) return "stool";
  if (BLOOD_CULTURE_WORDS.test(text)) return "bloodCulture";
  if (/urine|뇨|소변/i.test(text)) return "urine";
  if (BLOOD_SAMPLES.test(text)) return "blood";
  return "unclassified";
}

export function classifyRows(rows) {
  const groups = {
    blood: [],
    urine: [],
    sputum: [],
    stool: [],
    vre: [],
    bloodCulture: [],
    unclassified: []
  };
  for (const row of rows) groups[classifyRow(row)].push(row);
  return groups;
}

function clean(value) {
  return String(value ?? "").trim();
}

function displayDate(row) {
  const date = clean(row.date || row.accessionDate).replaceAll("-", "");
  return /^\d{8}$/.test(date)
    ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
    : "-";
}

function pendingDate(row) {
  const match = clean(row.result).match(/(\d{2})\/(\d{2})\s*보고예정/);
  if (!match) return "";
  const base = clean(row.date || row.accessionDate).replaceAll("-", "");
  const year = /^\d{8}$/.test(base) ? base.slice(0, 4) : "";
  return `${year ? `${year}-` : ""}${match[1]}-${match[2]} 예정`;
}

function verdict(result) {
  const cleaned = clean(result);
  if (/보고예정/.test(cleaned)) return "보고예정";
  if (/no growth/i.test(cleaned)) return "No growth";
  if (/negative/i.test(cleaned) && cleaned.length < 100) return "Negative";
  if (/positive/i.test(cleaned) && cleaned.length < 100) return "Positive";
  return cleaned || "결과 대기";
}

function latestNDatesRows(rows, n) {
  const dates = [...new Set(
    rows.map((row) => clean(row.date || row.accessionDate).replaceAll("-", ""))
      .filter((date) => /^\d{8}$/.test(date))
  )].sort().reverse().slice(0, n);
  if (!dates.length) return rows;
  const dateSet = new Set(dates);
  return rows.filter((row) => dateSet.has(clean(row.date || row.accessionDate).replaceAll("-", "")));
}

function latestRows(rows) {
  return latestNDatesRows(rows, 1);
}

export function formatMicroSection(label, rows, { maxDates = 1 } = {}) {
  const filtered = latestNDatesRows(rows, maxDates).filter((row) => clean(row.result) !== "**");
  if (!filtered.length) return `${label} :`;
  const items = filtered.map((row) =>
    `  [${displayDate(row)}] ${clean(row.name)}: ${clean(row.result) || "결과 대기"}`
  );
  return `${label} :\n${items.join("\n")}`;
}

export function microItems(rows, { maxDates = 1 } = {}) {
  return latestNDatesRows(rows, maxDates)
    .filter((row) => clean(row.result) !== "**")
    .map((row) => ({
      date: pendingDate(row) || displayDate(row),
      name: clean(row.name),
      result: verdict(row.result)
    }));
}
