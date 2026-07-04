// ISOLATED world 브릿지. MAIN world(inject.js)에서 postMessage 로 넘어온
// 요청 양식을 받아 background service worker 로 전달한다.
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.__labMonitor !== true || !data.template) return;
  // 익스텐션을 새로고침하면 이 탭의 옛 content script 는 컨텍스트가 무효화됨
  // (chrome.runtime.id 가 사라짐). 그 상태로 sendMessage 하면 동기 예외가 나므로 방어.
  if (!chrome.runtime?.id) return;
  try {
    chrome.runtime.sendMessage({
      type: "template",
      kind: data.kind,
      template: data.template
    }).catch(() => {});
  } catch {
    // "Extension context invalidated" 등 — SRMS 페이지를 새로고침하면 새 스크립트로 교체됨
  }
});
