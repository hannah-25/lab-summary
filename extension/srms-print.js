// MAIN world: 조회로 연 SRMS 창에서 최신 혈액/UA 접수를 인쇄한다.
(async function () {
  const params = new URLSearchParams(location.hash.slice(1));
  if (window !== window.top || location.pathname !== "/main.do" || params.get("labPrint") !== "1") return;
  if (window.__labMonitorPrintStarted) return;
  window.__labMonitorPrintStarted = true;
  // 새로고침으로 같은 결과를 다시 인쇄하지 않도록 시작 표시를 지운다.
  history.replaceState(null, "", location.pathname + location.search);
  let status;

  async function waitFor(read, label) {
    const until = Date.now() + 30000;
    while (Date.now() < until) {
      const value = read();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`${label} 대기 시간 초과. SRMS 로그인과 화면을 확인하세요.`);
  }

  function frame(path) {
    const iframe = [...document.querySelectorAll("iframe")].find((el) => {
      const url = new URL(el.src || "about:blank", location.href);
      return url.origin === location.origin && url.pathname === path;
    });
    return iframe?.contentWindow;
  }

  // SRMS는 AJAX를 예약한 뒤 실행하므로 고정 지연 대신 응답 처리를 기다린다.
  // isOwn: 페이지가 스스로 보낸 같은 URL 요청(예: 첫 화면 기본 목록 조회)의 응답을 걸러낸다.
  function request(w, url, action, isOwn = () => true) {
    return new Promise((resolve, reject) => {
      const doc = w.jQuery(w.document);
      const finish = (error, response) => {
        clearTimeout(timer);
        doc.off("ajaxComplete", complete);
        if (error) reject(error);
        else resolve(response);
      };
      const complete = (_event, xhr, settings) => {
        if (!url.test(settings.url)) return;
        try {
          if (xhr.status < 200 || xhr.status >= 300) throw new Error(`SRMS 요청 실패 (${xhr.status})`);
          const response = xhr.responseJSON || JSON.parse(xhr.responseText);
          if (!isOwn(response)) return;
          if (response.O_MSGCOD && String(response.O_MSGCOD) !== "200") throw new Error("SRMS 조회 실패. 화면의 안내를 확인하세요.");
          finish(null, response);
        } catch (error) { finish(error); }
      };
      const timer = setTimeout(() => finish(new Error("SRMS 응답 시간 초과. 로그인 상태를 확인하세요.")), 30000);
      doc.on("ajaxComplete", complete);
      try { action(); } catch (error) { finish(error); }
    });
  }

  try {
    await waitFor(() => document.body, "페이지");
    status = document.createElement("div");
    status.id = "labMonitorPrintStatus";
    status.setAttribute("role", "status");
    status.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2147483647;max-width:480px;padding:14px;background:#fff;color:#222;border:2px solid #9a2020;border-radius:8px;font:14px sans-serif;box-shadow:0 2px 12px #0003";
    document.body.append(status);
    const name = (params.get("name") || "").trim();
    const from = params.get("from") || "";
    const to = params.get("to") || "";
    if (!name || !/^\d{8}$/.test(from) || !/^\d{8}$/.test(to) || from > to) throw new Error("인쇄할 이름 또는 조회 기간이 올바르지 않습니다.");
    document.title = `${name} · SRMS`;
    status.textContent = `${name} · 최신 혈액/UA 접수 조회 중…`;
    // goPage는 menu.js 로드 직후 생기지만 기본 탭 iframe은 파싱 중에 붙는다. load 전에 부르면 탭 틀이 없어 실패하거나 화면이 겹친다.
    await waitFor(() => document.readyState === "complete" && typeof window.goPage === "function", "SRMS 메뉴");
    if (!frame("/rstUser.do")) window.goPage("RSTUSER", "수진자별 결과조회(A)", "rstUser.do", "&QuickYN=Y");
    const w = await waitFor(() => {
      const candidate = frame("/rstUser.do");
      return candidate?.document.readyState === "complete" && candidate.dataProvider1 && candidate.gridView2 && typeof candidate.search === "function" && candidate;
    }, "검색 화면");
    const field = (id, value) => {
      const el = w.document.getElementById(id);
      if (!el) throw new Error(`SRMS 검색 항목을 찾을 수 없습니다 (${id}).`);
      w.jQuery(el).val(value);
    };
    field("I_FDT", `${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6)}`);
    field("I_TDT", `${to.slice(0, 4)}-${to.slice(4, 6)}-${to.slice(6)}`);
    field("I_DGN", "D");
    field("I_CNT", "1000");
    const withoutSuffix = name.replace(/\d+$/, "");
    const keywords = withoutSuffix && withoutSuffix !== name ? [name, withoutSuffix] : [name];
    let matches = [];
    for (const keyword of keywords) {
      field("I_NAM", keyword);
      field("I_PCHN", "");
      // 첫 화면 기본 목록 조회와 겹치면 그 응답을 먼저 받아 엉뚱한 행을 고르므로, I_NAM 에코로 내 검색만 받는다.
      await request(w, /\/rstUserList\.do(?:\?|$)/, () => w.search(), (response) => String(response.I_NAM ?? "") === keyword);
      matches = w.dataProvider1.getJsonRows().map((row, index) => ({ ...row, index }))
        .filter((row) => String(row.NAM || "").trim() === name);
      if (matches.length) break;
    }
    if (!matches.length) throw new Error("이름이 정확히 일치하는 결과가 없습니다. 이름 뒤 숫자와 조회 기간을 확인하세요.");
    if (matches.some((row) => !row.CHN || !row.HOS) || new Set(matches.map((row) => `${row.HOS}|${row.CHN}`)).size !== 1) {
      throw new Error("동명이인 또는 환자 식별정보 누락으로 자동 인쇄를 중단했습니다. 차트번호를 확인하세요.");
    }
    const target = matches.filter((row) => /serum|edta|urine/i.test(row.ETCINF || "") && !/culture/i.test(row.ETCINF || ""))
      .sort((a, b) => String(b.DAT).localeCompare(String(a.DAT)) || String(b.JNO).localeCompare(String(a.JNO), undefined, { numeric: true }))[0];
    if (!target || !/^\d{8}$/.test(String(target.DAT)) || !target.JNO) throw new Error("조회 기간에 인쇄할 혈액/UA 접수가 없습니다.");
    // RealGrid 1.1.31은 행이 바뀐 뒤 마우스가 그리드 위에 있으면 이전 hover 행을 갱신하다 예외를 던진다(_resetRowHoverView).
    // 현재 행은 그 전에 이미 지정되므로, 예외는 무시하고 지정 결과만 확인한다.
    try { w.gridView1.setCurrent({ dataRow: target.index }); } catch {}
    if (w.gridView1.getCurrent().dataRow !== target.index) throw new Error("검색 결과에서 접수를 선택하지 못했습니다. 다시 시도하세요.");
    await request(w, /\/rstUserDtl\.do(?:\?|$)/, () => w.dataResult2(target));
    if (w.document.getElementById("NAM")?.textContent.trim() !== name ||
        w.document.getElementById("I_DTLDAT")?.value !== String(target.DAT) ||
        w.document.getElementById("I_DTLJNO")?.value !== String(target.JNO)) throw new Error("선택한 환자와 상세 결과가 일치하지 않아 인쇄를 중단했습니다.");
    w.gridView2.checkAll(true);
    if (!w.gridView2.getCheckedRows().length) throw new Error("인쇄할 검사 결과가 없습니다.");
    status.textContent = `${name} · ${target.DAT} 결과지 준비 중…`;
    w.document.getElementById("resultImg").click();
    const report = await waitFor(() => {
      const candidate = frame("/rstReport.do");
      return candidate?.dataProvider?.getRowCount() > 0 && typeof candidate.ubiform_viewPrint === "function" && candidate;
    }, "결과지 목록");
    const reports = report.dataProvider.getJsonRows();
    if (reports.some((row) => String(row.F100NAM || "").trim() !== name || String(row.F600DAT) !== String(target.DAT) || String(row.F600JNO) !== String(target.JNO))) {
      throw new Error("결과지의 환자·접수번호가 선택한 결과와 일치하지 않아 인쇄를 중단했습니다.");
    }
    for (let index = 0; index < reports.length; index++) {
      let opened = false;
      const originalOpen = report.open;
      report.open = function (...args) {
        const popup = originalOpen.apply(this, args);
        opened = Boolean(popup);
        return popup;
      };
      try {
        await request(report, /\/getReportDataTobe2?\.do(?:\?|$)/, () => report.ubiform_viewPrint(report.gridView.getItemIndex(index), "STSD_PRINT"));
      } finally { report.open = originalOpen; }
      if (!opened) throw new Error("인쇄창이 열리지 않았습니다. SRMS 팝업을 허용한 뒤 결과지의 인쇄 아이콘을 눌러주세요.");
    }
    status.textContent = `${name} · ${target.DAT} 결과지 ${reports.length}건 인쇄 요청 완료. 최종 출력은 인쇄창에서 확인하세요.`;
  } catch (error) {
    if (status) { status.setAttribute("role", "alert"); status.textContent = error.message; }
    console.error("[LabMonitor] SRMS 인쇄:", error);
  }
})();
