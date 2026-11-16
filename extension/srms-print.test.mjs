import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("./srms-print.js", import.meta.url), "utf8");

async function runPrint({ blockedAt = -1, mismatch = false, automatic = true } = {}) {
  const events = [];
  const fields = new Map();
  const status = { setAttribute() {}, style: {}, textContent: "" };
  const target = { NAM: "테스트", CHN: "C1", HOS: "H1", DAT: "20261117", JNO: "123", ETCINF: "Serum" };
  const reports = Array.from({ length: 2 }, () => ({
    F100NAM: mismatch ? "다른이름" : target.NAM, F600DAT: target.DAT, F600JNO: target.JNO
  }));
  function ajaxPage(document) {
    let complete;
    const page = { document };
    page.jQuery = (el) => el === document ? {
      on(_event, handler) { complete = handler; },
      off() { complete = undefined; }
    } : { val(value) { el.value = value; } };
    page.respond = (url, responseJSON = {}) => {
      queueMicrotask(() => complete(null, { status: 200, responseJSON }, { url }));
    };
    return page;
  }
  const search = ajaxPage({
    readyState: "complete",
    getElementById(id) {
      if (!fields.has(id)) fields.set(id, {});
      return fields.get(id);
    }
  });
  Object.assign(search, {
    dataProvider1: { getJsonRows: () => [target] },
    gridView1: { setCurrent() {}, getCurrent: () => ({ dataRow: 0 }) },
    gridView2: { checkAll() {}, getCheckedRows: () => [0] },
    search() { search.respond("/rstUserList.do", { I_NAM: target.NAM }); },
    dataResult2() { search.respond("/rstUserDtl.do"); }
  });
  search.document.getElementById("NAM").textContent = target.NAM;
  search.document.getElementById("I_DTLDAT").value = target.DAT;
  search.document.getElementById("I_DTLJNO").value = target.JNO;
  search.document.getElementById("resultImg").click = () => {};
  const report = ajaxPage({});
  const originalOpen = (index) => {
    events.push(`print:${index}`);
    return index === blockedAt ? null : {};
  };
  Object.assign(report, {
    dataProvider: { getRowCount: () => reports.length, getJsonRows: () => reports },
    gridView: { getItemIndex: (index) => index },
    open: originalOpen,
    ubiform_viewPrint(index) {
      report.open(index);
      report.respond("/getReportDataTobe.do");
    }
  });
  const window = { goPage() {}, close() { events.push("close"); } };
  window.top = window;
  const document = {
    readyState: "complete",
    body: { append() {} },
    createElement: () => status,
    querySelectorAll: () => [
      { src: "https://srms.seegenemedical.com/rstUser.do", contentWindow: search },
      { src: "https://srms.seegenemedical.com/rstReport.do", contentWindow: report }
    ]
  };
  await runInNewContext(source, {
    window, document, URL, URLSearchParams, setTimeout, clearTimeout,
    location: {
      pathname: "/main.do", search: "", origin: "https://srms.seegenemedical.com",
      href: "https://srms.seegenemedical.com/main.do",
      hash: automatic ? `#${new URLSearchParams({ labPrint: "1", name: target.NAM, from: "20260918", to: "20261117" })}` : ""
    },
    history: { replaceState() {} },
    console: { error() {} }
  });
  assert.equal(report.open, originalOpen, "restore the site's popup function");
  return { events, status };
}

test("close the search window only after all print windows open", async () => {
  const { events } = await runPrint();
  assert.deepEqual(events, ["print:0", "print:1", "close"]);
});

test("keep the search window and error when any print popup is blocked", async () => {
  for (const blockedAt of [0, 1]) {
    const { events, status } = await runPrint({ blockedAt });
    assert.ok(!events.includes("close"));
    assert.match(status.textContent, /SRMS 팝업을 허용/);
  }
});

test("keep the search window when the report belongs to another patient", async () => {
  const { events, status } = await runPrint({ mismatch: true });
  assert.deepEqual(events, []);
  assert.match(status.textContent, /일치하지 않아/);
});

test("leave manually opened SRMS windows alone", async () => {
  const { events } = await runPrint({ automatic: false });
  assert.deepEqual(events, []);
});
