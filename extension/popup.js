const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------- 탭 ----------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// ---------- 감시 탭 ----------
function renderStatus(store) {
  const el = $("status");
  el.className = "status";
  if (!store.templates?.list) {
    el.classList.add("warn");
    el.textContent = "조회 양식 미수집 — SRMS 에서 검사결과 목록을 한 번 조회하면 자동 등록됩니다.";
    return;
  }
  const last = store.lastCheck;
  if (last && !last.ok && last.error === "login-required") {
    el.classList.add("err");
    el.textContent = "SRMS 로그인 필요 — 로그인 후 다시 확인하세요.";
    return;
  }
  const schedule = "매일 06:00–06:30 · 10분 간격 자동 확인";
  el.textContent = last?.at
    ? `양식 수집됨 ✓ · 마지막 확인 ${fmtTime(last.at)} · ${schedule}`
    : `양식 수집됨 ✓ · 아직 확인 이력 없음 · ${schedule}`;
}

function renderWatchlist(store) {
  const ul = $("watchlist");
  ul.innerHTML = "";
  if (!store.watchlist.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "감시할 환자를 추가하세요.";
    ul.appendChild(li);
    return;
  }
  for (const name of store.watchlist) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = name;
    const rm = document.createElement("button");
    rm.className = "rm";
    rm.textContent = "×";
    rm.title = "삭제";
    rm.addEventListener("click", async () => {
      await send({ type: "removePatient", name });
      refresh();
    });
    li.append(span, rm);
    ul.appendChild(li);
  }
}

function renderResults(store) {
  const box = $("results");
  box.innerHTML = "";
  const list = store.notifications || [];
  if (!list.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "아직 감지된 새 결과가 없습니다.";
    box.appendChild(p);
    return;
  }
  for (const [index, r] of list.slice(0, 20).entries()) {
    const card = document.createElement("div");
    card.className = "card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.title = "상세 보기";
    card.addEventListener("click", () => {
      send({ type: "openNotificationDetail", index });
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      send({ type: "openNotificationDetail", index });
    });
    const head = document.createElement("div");
    head.className = "head";
    const nm = document.createElement("div");
    nm.className = "patient";
    nm.textContent = `환자: ${r.patientName || "환자 미확인"}${r.chartNo ? ` · 차트번호: ${r.chartNo}` : ""}`;
    const when = document.createElement("span");
    when.className = "when";
    when.textContent = fmtTime(r.at);
    head.append(nm, when);
    card.appendChild(head);
    for (const item of r.items) {
      const row = document.createElement("div");
      row.className = "item";
      const nmEl = document.createElement("div");
      nmEl.className = "nm";
      nmEl.textContent = item.name + (item.sample ? ` · ${item.sample}` : "");
      const metaEl = document.createElement("div");
      metaEl.className = "meta";
      metaEl.textContent = `검사 시행일 ${item.performedDate || item.date || "-"} · 검사 확인일 ${item.checkedDate || "-"}`;
      const rsEl = document.createElement("div");
      rsEl.className = "rs";
      rsEl.textContent = `결과 ${item.result}`;
      row.append(nmEl, metaEl, rsEl);
      card.appendChild(row);
    }
    box.appendChild(card);
  }
}

async function refresh() {
  const store = await send({ type: "getStore" });
  renderStatus(store);
  renderWatchlist(store);
  renderResults(store);
}

async function loadLocalDevTools() {
  try {
    const url = chrome.runtime.getURL("dev-local.js");
    const res = await fetch(url);
    if (!res.ok) return;
    const script = document.createElement("script");
    script.src = url;
    script.defer = true;
    document.documentElement.appendChild(script);
  } catch {
    // 로컬 전용 파일이 없으면 아무 것도 하지 않는다.
  }
}

async function addPatient() {
  const input = $("nameInput");
  const name = input.value.trim();
  if (!name) return;
  await send({ type: "addPatient", name });
  input.value = "";
  refresh();
}

$("addBtn").addEventListener("click", addPatient);
$("nameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") addPatient(); });

$("checkNow").addEventListener("click", async () => {
  const btn = $("checkNow");
  btn.disabled = true;
  btn.textContent = "확인 중…";
  try {
    await send({ type: "checkNow" });
  } finally {
    btn.disabled = false;
    btn.textContent = "지금 확인";
    refresh();
  }
});

function setOtherLookupStatus(msg, kind) {
  const el = $("otherLookupStatus");
  if (!msg) { el.hidden = true; return; }
  el.hidden = false;
  el.className = "status" + (kind ? ` ${kind}` : "");
  el.textContent = msg;
}

$("otherLookupBtn").addEventListener("click", async () => {
  const days = Math.max(1, Math.min(365, Number($("otherLookupDays").value) || 30));
  const btn = $("otherLookupBtn");
  btn.disabled = true;
  btn.textContent = "조회 중…";
  setOtherLookupStatus(`감시 환자의 최근 ${days}일 기타검사 3개를 조회 중입니다.`, "");
  try {
    const res = await send({ type: "otherLookup", limit: 3, days });
    if (res.status === "no-template") {
      setOtherLookupStatus("조회 양식 미수집: SRMS 검사결과 목록을 한 번 조회한 뒤 다시 시도하세요.", "warn");
    } else if (res.status === "empty") {
      setOtherLookupStatus("감시 환자를 먼저 추가하세요.", "warn");
    } else if (res.status === "login-required") {
      setOtherLookupStatus("SRMS 로그인이 필요합니다. 로그인 후 다시 조회하세요.", "err");
    } else if (res.status === "error") {
      setOtherLookupStatus(`오류: ${res.error || "원인 없음"}`, "err");
    } else {
      const failures = res.failures || [];
      const suffix = failures.length ? ` · 결과 없음 ${failures.length}명(${failures.join(", ")})` : "";
      setOtherLookupStatus(`완료 · ${res.views?.length || 0}명 뷰어 열림${suffix}`, failures.length ? "warn" : "");
    }
  } catch (e) {
    setOtherLookupStatus(`오류: ${e.message}`, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "최근 3개 뷰어 열기";
  }
});

loadLocalDevTools();

// ---------- 혈액/UA 조회 탭 ----------
function parseNames(text) {
  return [...new Set(
    text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)
  )];
}

function setLookupStatus(msg, kind) {
  const el = $("lookupStatus");
  if (!msg) { el.hidden = true; return; }
  el.hidden = false;
  el.className = "status" + (kind ? ` ${kind}` : "");
  el.textContent = msg;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 직접 응답이 유실되면, background 가 저장한 lastLookup 을 reqId 로 폴링해 회수한다.
async function pollLookup(reqId, tries = 40) {
  for (let i = 0; i < tries; i++) {
    await sleep(1500);
    const store = await send({ type: "getStore" });
    const last = store?.lastLookup;
    if (last && last.reqId === reqId) return last;
  }
  return null;
}

$("lookupBtn").addEventListener("click", async () => {
  const names = parseNames($("lookupNames").value);
  if (!names.length) { setLookupStatus("환자 이름을 입력하세요.", "warn"); return; }
  const days = Math.max(1, Math.min(365, Number($("lookupDays").value) || 60));

  const btn = $("lookupBtn");
  btn.disabled = true;
  btn.textContent = "조회 중…";
  setLookupStatus(`${names.length}명 조회 중… (환자당 몇 초 걸립니다)`, "");
  $("lookupOut").textContent = "";
  const reqId = Date.now();
  try {
    const directRes = await send({ type: "bloodLookup", names, days, reqId });
    let res = directRes;
    // 직접 응답이 유실/변형된 경우(서비스워커 재시작 등) 저장소를 폴링해 결과 회수
    if (!res || typeof res !== "object" || !("status" in res)) {
      res = await pollLookup(reqId);
    }
    if (!res || typeof res !== "object") {
      // 진단 정보 노출: 직접응답 형태 / 양식 유무 / background 가 남긴 마지막 결과
      const store = await send({ type: "getStore" });
      const directDesc = directRes === undefined ? "undefined"
        : (typeof directRes === "object" ? JSON.stringify(directRes).slice(0, 80) : `${typeof directRes}:${directRes}`);
      const diag = `직접응답=${directDesc} · 양식 list/detail=${!!store?.templates?.list}/${!!store?.templates?.detail} · lastLookup=${store?.lastLookup ? store.lastLookup.status : "없음"}`;
      setLookupStatus(`응답 없음 — ${diag}`, "warn");
    } else if (res.status === "no-template") {
      setLookupStatus("조회 양식 미수집 — SRMS 검사결과 목록을 한 번 조회한 뒤 다시 시도하세요.", "warn");
    } else if (res.status === "login-required") {
      setLookupStatus("SRMS 로그인 필요 — 로그인 후 다시 조회하세요.", "err");
    } else if (res.status === "error") {
      setLookupStatus(`오류: ${res.error || "알 수 없음"}`, "err");
    } else {
      const reports = res.reports || [];
      const failures = res.failures || [];
      $("lookupOut").textContent = reports.join("\n\n--------------------\n\n");
      const fail = failures.length ? ` · 검색 실패 ${failures.length}명(${failures.join(", ")})` : "";
      setLookupStatus(`완료 · ${reports.length}명${fail}`, failures.length ? "warn" : "");
    }
  } catch (e) {
    setLookupStatus(`오류: ${e.message}`, "err");
  } finally {
    btn.disabled = false;
    btn.textContent = "조회";
  }
});

$("copyBtn").addEventListener("click", async () => {
  const text = $("lookupOut").textContent;
  if (!text.trim()) return;
  await navigator.clipboard.writeText(text);
  const btn = $("copyBtn");
  btn.textContent = "복사됨 ✓";
  setTimeout(() => { btn.textContent = "복사"; }, 1200);
});

// 팝업 열면 배지(안읽음) 초기화 + 감시 탭 렌더
send({ type: "clearUnread" });
refresh();
