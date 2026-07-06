// classify.mjs 에서 이식 (무수정). 행을 blood/urine/sputum/stool/vre/bloodCulture/unclassified 로 분류.
const BLOOD_SAMPLES = /serum|plasma|edta|whole\s*blood|w\/b|blood/i;
const SPUTUM_WORDS = /sputum|객담|afb|mycobacter|mtb|결핵/i;
const STOOL_WORDS = /stool|feces|faeces|대변|c\.\s*difficile|clostridioides/i;
const VRE_WORDS = /\b(?:vre|cre)\b|vancomycin.?resistant|carbapenem.?resistant|rectal\s*swab|enterococcus/i;
const BLOOD_CULTURE_WORDS = /blood\s*culture|혈액배양/i;

export function classifyRow(row) {
  const text = [row.name, row.sample, row.parent, row.remark].filter(Boolean).join(" ");
  const sample = String(row.sample || "");
  if (VRE_WORDS.test(text)) return "vre";
  if (SPUTUM_WORDS.test(text)) return "sputum";
  if (STOOL_WORDS.test(text)) return "stool";
  if (BLOOD_CULTURE_WORDS.test(text)) return "bloodCulture";
  if (/urine|뇨|소변/i.test(sample)) return "urine";
  if (BLOOD_SAMPLES.test(sample)) return "blood";
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

function accessionDisplayDate(row) {
  const date = clean(row.accessionDate || row.date).replaceAll("-", "");
  return /^\d{8}$/.test(date)
    ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
    : "-";
}

function reportDateLabel(row) {
  const pendingMatch = clean(row.result).match(/(\d{2})\/(\d{2})\s*보고예정/);
  if (pendingMatch) return `(${Number(pendingMatch[1])}/${Number(pendingMatch[2])} 보고예정)`;
  const reportDate = clean(row.date).replaceAll("-", "");
  if (/^\d{8}$/.test(reportDate)) {
    return `(${Number(reportDate.slice(4, 6))}/${Number(reportDate.slice(6, 8))} 보고)`;
  }
  return "";
}

function reportDisplayDate(row) {
  const pendingMatch = clean(row.result).match(/(\d{2})\/(\d{2})\s*보고예정/);
  if (pendingMatch) return `${Number(pendingMatch[1])}/${Number(pendingMatch[2])} 보고예정`;
  const reportDate = clean(row.date).replaceAll("-", "");
  if (/^\d{8}$/.test(reportDate)) {
    return `${reportDate.slice(0, 4)}-${reportDate.slice(4, 6)}-${reportDate.slice(6, 8)}`;
  }
  return "-";
}

export function verdict(result) {
  const cleaned = clean(result);
  if (/보고예정/.test(cleaned)) return "보고예정";
  if (/no growth/i.test(cleaned)) return "No growth";
  if (/negative/i.test(cleaned) && cleaned.length < 100) return "Negative";
  if (/positive/i.test(cleaned) && cleaned.length < 100) return "Positive";
  return cleaned || "결과 대기";
}

// 혈액/UA 를 제외한 "기타검사" 행만 남긴다.
export function otherTestRows(rows) {
  const groups = classifyRows(rows);
  return [
    ...groups.sputum,
    ...groups.stool,
    ...groups.vre,
    ...groups.bloodCulture,
    ...groups.unclassified
  ].filter((row) => clean(row.result) !== "**");
}

// 알림/팝업용 간결 항목 리스트.
export function summarizeRows(rows) {
  return otherTestRows(rows).map((row) => {
    const reportLabel = reportDateLabel(row);
    const accDate = accessionDisplayDate(row);
    return {
      date: reportLabel ? `${accDate} ${reportLabel}` : accDate,
      performedDate: accDate,
      checkedDate: reportDisplayDate(row),
      name: clean(row.name),
      sample: clean(row.sample),
      result: verdict(row.result)
    };
  });
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

// 미생물 섹션(Sputum/Stool/VRE/Blood culture)용 항목 리스트. (classify.mjs 이식)
export function microItems(rows, { maxDates = 1 } = {}) {
  return latestNDatesRows(rows, maxDates)
    .filter((row) => clean(row.result) !== "**")
    .map((row) => {
      const reportLabel = reportDateLabel(row);
      const accDate = accessionDisplayDate(row);
      return {
        date: reportLabel ? `${accDate} ${reportLabel}` : accDate,
        name: clean(row.name),
        result: verdict(row.result)
      };
    });
}
