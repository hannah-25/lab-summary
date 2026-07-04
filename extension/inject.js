// MAIN world 주입 스크립트. SRMS 페이지의 fetch/XHR 응답을 가로채
// rstUserList / rstUserDtl 요청 양식(template)을 추출해 postMessage 로 브릿지에 넘긴다.
// (기존 CLI 의 context.on("response") + scalarForm 을 익스텐션용으로 옮긴 것)
(function () {
  const LIST_RE = /rstUserList\.do/;
  const DETAIL_RE = /rstUserDtl\.do/;

  function scalarForm(object) {
    const out = {};
    for (const [key, value] of Object.entries(object || {})) {
      if (["string", "number", "boolean"].includes(typeof value)) out[key] = String(value);
    }
    return out;
  }

  function handle(json, url) {
    let msg = null;
    if (LIST_RE.test(url) && json && "resultList" in json) {
      msg = { kind: "list", template: scalarForm(json) };
    } else if (DETAIL_RE.test(url) && json && json.param_rstUserDtl) {
      msg = { kind: "detail", template: scalarForm(json.param_rstUserDtl) };
    }
    if (msg) window.postMessage({ __labMonitor: true, ...msg }, "*");
  }

  function tryParse(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  // --- fetch 후킹 ---
  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = async function (...args) {
      const res = await origFetch.apply(this, args);
      try {
        const input = args[0];
        const url = (typeof input === "string" ? input : input && input.url) || res.url || "";
        if (LIST_RE.test(url) || DETAIL_RE.test(url)) {
          res.clone().text().then((t) => { const j = tryParse(t); if (j) handle(j, url); }).catch(() => {});
        }
      } catch {}
      return res;
    };
  }

  // --- XMLHttpRequest 후킹 (레거시 jQuery ajax 대비) ---
  const OrigOpen = XMLHttpRequest.prototype.open;
  const OrigSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__labUrl = url;
    return OrigOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", () => {
      try {
        const url = this.__labUrl || this.responseURL || "";
        if (!LIST_RE.test(url) && !DETAIL_RE.test(url)) return;
        const rt = this.responseType;
        let json = null;
        if (rt === "" || rt === "text") json = tryParse(this.responseText);
        else if (rt === "json") json = this.response;
        if (json) handle(json, url);
      } catch {}
    });
    return OrigSend.apply(this, args);
  };
})();
