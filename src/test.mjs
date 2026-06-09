import assert from "node:assert/strict";
import { buildBloodSummary } from "./rules.mjs";
import { classifyRows } from "./classify.mjs";
import { extractLabRows } from "./extract.mjs";

const previous = [
  { name: "WBC", result: "8.51", flag: "", date: "20260605", sample: "EDTA W/B" },
  { name: "CRP (정량)", result: "24.2", flag: "H", date: "20260605", sample: "Serum" },
  { name: "Sodium (Na)", result: "139", flag: "", date: "20260605", sample: "Serum" },
  { name: "Potassium (K)", result: "3.3", flag: "L", date: "20260605", sample: "Serum" },
  { name: "BUN", result: "31", flag: "H", date: "20260605", sample: "Serum" },
  { name: "Creatinine", result: "0.82", flag: "", date: "20260605", sample: "Serum" },
  { name: "AST (GOT)", result: "16", flag: "", date: "20260605", sample: "Serum" },
  { name: "ALT (GPT)", result: "55", flag: "H", date: "20260605", sample: "Serum" }
];

const recent = [
  { name: "WBC", result: "6.52", flag: "", date: "20260608", sample: "EDTA W/B" },
  { name: "CRP (정량)", result: "0.3", flag: "", date: "20260608", sample: "Serum" },
  { name: "Sodium (Na)", result: "144", flag: "", date: "20260608", sample: "Serum" },
  { name: "Potassium (K)", result: "4.0", flag: "", date: "20260608", sample: "Serum" },
  { name: "BUN", result: "22", flag: "", date: "20260608", sample: "Serum" },
  { name: "Creatinine", result: "0.71", flag: "", date: "20260608", sample: "Serum" },
  { name: "AST (GOT)", result: "34", flag: "", date: "20260608", sample: "Serum" },
  { name: "ALT (GPT)", result: "20", flag: "", date: "20260608", sample: "Serum" }
];

const summary = buildBloodSummary(previous, recent);
assert.match(summary, /WBC\(6\.52\)<-\(8\.51\)/);
assert.match(summary, /BUN\/Cr\(22\/0\.71\)<-\(31H\/0\.82\)/);
assert.match(summary, /OT\/PT\(34\/20\)<-\(16\/55H\)/);

const classified = classifyRows([
  { name: "WBC", sample: "EDTA W/B" },
  { name: "WBC", sample: "Random Urine" },
  { name: "C. difficile toxin A & B", sample: "Stool" },
  { name: "VRE culture", sample: "Rectal swab" },
  { name: "CRE culture", sample: "Rectal swab" },
  { name: "AFB stain", sample: "Sputum" },
  { name: "혈액배양", sample: "Blood Culture" }
]);
assert.equal(classified.blood.length, 1);
assert.equal(classified.urine.length, 1);
assert.equal(classified.stool.length, 1);
assert.equal(classified.vre.length, 2);
assert.equal(classified.sputum.length, 1);
assert.equal(classified.bloodCulture.length, 1);

const rows = extractLabRows({
  rstUserDtl: [{ JNO: "7204111", NAM: "테스트환자" }],
  results: [{ O_GCDN: "WBC", O_CHR: "6.52", O_FLG: "", O_BDT: "20260608", O_TNM: "EDTA W/B" }]
}, "https://example.test/rstUserDtl.do");
assert.equal(rows[0].patientJno, "7204111");
assert.equal(rows[0].name, "WBC");

const cultureRows = extractLabRows({
  rstUserDtl: [{ JNO: "7204112", NAM: "테스트환자" }],
  rstUserMw118rms1: [{
    CFEN: "Sputum culture",
    CGCD: "31100",
    CRST: "최 종 결 과 보 고<br>Sputum culture<br>No growth.<br>최종보고일 20260608"
  }],
  rstUserDtl2: [{
    O_GCDN: "Sputum culture",
    O_GCD: "31100",
    O_CHR: " ",
    O_BDT: "20260608",
    O_TNM: "Sputum"
  }]
});
assert.equal(cultureRows[0].result, "No growth.");

console.log("All tests passed.");
