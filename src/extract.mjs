function asText(value) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function walk(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (!value || typeof value !== "object") return;
  visit(value);
  for (const child of Object.values(value)) walk(child, visit);
}

function findPatientMeta(payload) {
  let meta = null;
  walk(payload, (object) => {
    if (meta) return;
    if (object.JNO && (object.NAM || object.CHN || object.JN)) {
      meta = {
        jno: asText(object.JNO),
        name: asText(object.NAM),
        chartNo: asText(object.CHN),
        birthNo: asText(object.JN),
        accessionDate: asText(object.DAT)
      };
    }
  });
  return meta;
}

function cleanNarrative(value, testName = "") {
  const lines = asText(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u3000/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !/결\s*과\s*보\s*고/.test(line))
    .filter((line) => !/^<\s*Remark\s*>$/i.test(line))
    .filter((line) => !/(최종보고일|중간보고일)\s*\d{8}/.test(line))
    .filter((line) => !testName || !line.includes(testName));
  return lines.join(" / ");
}

function findNarratives(payload) {
  const byName = new Map();
  const byCode = new Map();
  walk(payload, (object) => {
    if (!object.CRST) return;
    const result = cleanNarrative(object.CRST, asText(object.CFEN));
    if (!result) return;
    if (object.CFEN) byName.set(asText(object.CFEN), result);
    if (object.CGCD) byCode.set(asText(object.CGCD), result);
  });
  return { byName, byCode };
}

export function extractLabRows(payload, sourceUrl = "") {
  const rows = [];
  const patient = findPatientMeta(payload);
  const narratives = findNarratives(payload);

  function appendRow(object, parent = "") {
    if (!object.O_GCDN || object.O_CHR === undefined) return null;
    const row = {
      patientJno: patient?.jno || asText(object.JNO),
      patientName: patient?.name || asText(object.NAM),
      chartNo: patient?.chartNo || asText(object.CHN),
      accessionDate: patient?.accessionDate || asText(object.DAT),
      code: asText(object.O_OCD || object.O_GCD),
      internalCode: asText(object.O_GCD),
      name: asText(object.O_GCDN),
      result: asText(object.O_CHR),
      reference: asText(object.O_REF || object.O_REF1),
      flag: asText(object.O_FLG || object.O_C07),
      date: asText(object.O_BDT),
      sample: asText(object.O_TNM),
      parent,
      remark: asText(object.O_REMK),
      sourceUrl
    };
    if (!row.result.trim()) {
      row.result = narratives.byName.get(row.name)
        || narratives.byCode.get(row.internalCode)
        || row.result;
    }
    rows.push(row);
    return row;
  }

  function extractNode(value) {
    if (Array.isArray(value)) {
      let activeParent = "";
      for (const item of value) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const row = appendRow(item, activeParent);
          if (row?.result === "**") {
            activeParent = row.name;
          }
          for (const child of Object.values(item)) extractNode(child);
        } else {
          extractNode(item);
        }
      }
      return;
    }
    if (!value || typeof value !== "object") return;
    appendRow(value);
    for (const child of Object.values(value)) extractNode(child);
  }

  extractNode(payload);
  return rows;
}
