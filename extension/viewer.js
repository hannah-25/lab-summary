// 뷰어 표시 로직 (lab-summary.html 의 표시 부분 이식).
// 데이터는 chrome.storage.local.lastLookupView 에서 읽고, 변경되면 라이브로 다시 렌더.
const $ = (id) => document.getElementById(id);
let viewerPatients = [];

function formatOtherItems(items) {
  return (items || [])
    .map((item) => `[${item.date || "-"}] ${item.name}: ${item.result || "결과 대기"}`)
    .join("\n");
}

function setOptionalForm(textareaId, items) {
  const textarea = $(textareaId);
  const form = textarea.closest(".result-form");
  const text = formatOtherItems(items);
  textarea.value = text;
  form.hidden = !text;
}

function setTextForm(textareaId, text) {
  const textarea = $(textareaId);
  const form = textarea.closest(".result-form");
  textarea.value = text || "";
  form.hidden = !textarea.value.trim();
}

function generateFinalResult() {
  const sections = [
    $("viewerLab").value.trim(),
    $("viewerUa").value.trim(),
    $("viewerSputum").value.trim() && `Sputum\n${$("viewerSputum").value.trim()}`,
    $("viewerStool").value.trim() && `Stool\n${$("viewerStool").value.trim()}`,
    $("viewerVreCre").value.trim() && `VRE/CRE\n${$("viewerVreCre").value.trim()}`,
    $("viewerBloodCulture").value.trim() && `Blood culture\n${$("viewerBloodCulture").value.trim()}`
  ].filter(Boolean);
  $("viewerFinal").value = sections.join("\n\n");
}

function renderPatient(index) {
  const patient = viewerPatients[index];
  if (!patient) return;
  $("viewerContent").hidden = false;
  $("viewerPatient").textContent = `${patient.name}${patient.chartNo ? ` (${patient.chartNo})` : ""}`;
  $("viewerDates").textContent = `최근 검사 ${patient.recentDate || "-"} · 이전 검사 ${patient.previousDate || "-"}`;
  setTextForm("viewerLab", patient.lab);
  setTextForm("viewerUa", patient.ua);
  setOptionalForm("viewerSputum", patient.sputum);
  setOptionalForm("viewerStool", patient.stool);
  setOptionalForm("viewerVreCre", patient.vreCre);
  setOptionalForm("viewerBloodCulture", patient.bloodCulture);
  $("viewerFinal").value = "";
}

function loadViewerData(data) {
  viewerPatients = Array.isArray(data?.patients) ? data.patients : [];
  if (!viewerPatients.length) {
    $("viewerContent").hidden = true;
    $("patientSelect").hidden = true;
    $("viewerStatus").textContent = "표시할 결과가 없습니다.";
    return;
  }

  // 오늘 결과 환자를 앞으로 정렬
  viewerPatients = [
    ...viewerPatients.filter((p) => p.isNewToday),
    ...viewerPatients.filter((p) => !p.isNewToday)
  ];

  const todayCount = viewerPatients.filter((p) => p.isNewToday).length;
  const select = $("patientSelect");
  select.replaceChildren();

  if (todayCount > 0) {
    const todayGroup = document.createElement("optgroup");
    todayGroup.label = `▶ 오늘 결과 (${todayCount}명)`;
    viewerPatients.filter((p) => p.isNewToday).forEach((patient, i) => {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = `${patient.name}${patient.chartNo ? ` (${patient.chartNo})` : ""}`;
      todayGroup.append(option);
    });
    select.append(todayGroup);
  }

  const prevPatients = viewerPatients.filter((p) => !p.isNewToday);
  if (prevPatients.length > 0) {
    const prevGroup = document.createElement("optgroup");
    prevGroup.label = `이전 결과 (${prevPatients.length}명)`;
    prevPatients.forEach((patient, i) => {
      const option = document.createElement("option");
      option.value = String(todayCount + i);
      option.textContent = `${patient.name}${patient.chartNo ? ` (${patient.chartNo})` : ""}`;
      prevGroup.append(option);
    });
    select.append(prevGroup);
  }

  select.hidden = viewerPatients.length < 2;
  $("viewerStatus").textContent = `전체 ${viewerPatients.length}명`;
  select.value = "0";
  renderPatient(0);
}

async function loadFromStorage() {
  const { lastLookupView } = await chrome.storage.local.get("lastLookupView");
  loadViewerData(lastLookupView);
}

// --- 오늘 새로 나온 환자 전체를 최근 결과만으로 인쇄 ---
function printItemLines(items) {
  return (items || [])
    .map((i) => `  [${i.date || "-"}] ${i.name}: ${i.result || "결과 대기"}`)
    .join("\n");
}

function printToday() {
  const today = viewerPatients.filter((p) => p.isNewToday);
  if (!today.length) {
    $("viewerStatus").textContent = "오늘 새로 나온 결과가 없습니다.";
    return;
  }
  const area = $("printArea");
  area.replaceChildren();
  for (const p of today) {
    const parts = [`${p.name}${p.chartNo ? ` (${p.chartNo})` : ""}   [검사일 ${p.recentDate || "-"}]`];
    if (p.labRecent) parts.push(p.labRecent);
    if (p.uaRecent) parts.push(p.uaRecent);
    if (p.sputum?.length) parts.push(`Sputum\n${printItemLines(p.sputum)}`);
    if (p.stool?.length) parts.push(`Stool\n${printItemLines(p.stool)}`);
    if (p.vreCre?.length) parts.push(`VRE/CRE\n${printItemLines(p.vreCre)}`);
    if (p.bloodCulture?.length) parts.push(`Blood culture\n${printItemLines(p.bloodCulture)}`);
    const block = document.createElement("pre");
    block.className = "print-patient";
    block.textContent = parts.join("\n\n");
    area.append(block);
  }
  $("viewerStatus").textContent = `오늘 결과 ${today.length}명 인쇄`;
  window.print();
}

$("printToday").addEventListener("click", printToday);
$("patientSelect").addEventListener("change", (event) => {
  renderPatient(Number(event.target.value));
});
$("generateFinal").addEventListener("click", generateFinalResult);
$("copyFinal").addEventListener("click", async () => {
  const text = $("viewerFinal").value.trim();
  if (!text) { $("viewerStatus").textContent = "복사할 결과가 없어요."; return; }
  try {
    await navigator.clipboard.writeText(text);
    $("viewerStatus").textContent = "전체 결과 복사 완료";
  } catch {
    $("viewerStatus").textContent = "브라우저에서 복사를 허용하지 않았어요.";
  }
});

// 새 조회가 들어오면(storage 변경) 라이브로 갱신
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.lastLookupView) {
    loadViewerData(changes.lastLookupView.newValue);
  }
});

loadFromStorage();
