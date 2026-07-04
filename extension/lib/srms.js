// fetch 기반 SRMS 조회. background service worker 에서 사용.
// host_permissions 덕분에 credentials:"include" 로 로그인 쿠키가 자동 전송됨.
export const LIST_URL = "https://srms.seegenemedical.com/rstUserList.do";
export const DETAIL_URL = "https://srms.seegenemedical.com/rstUserDtl.do";

// 세션이 만료되면 SRMS 는 JSON 대신 로그인 HTML 을 반환한다.
export class LoginRequiredError extends Error {
  constructor() {
    super("LOGIN_REQUIRED");
    this.name = "LoginRequiredError";
  }
}

async function postForm(url, form) {
  const body = new URLSearchParams(
    Object.fromEntries(Object.entries(form).map(([k, v]) => [k, String(v ?? "")]))
  ).toString();
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest"
    },
    body
  });
  if (res.status === 401 || res.status === 403) throw new LoginRequiredError();
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    // 로그인 페이지 등 JSON 이 아닌 응답
    throw new LoginRequiredError();
  }
}

function searchVariants(name) {
  const withoutSuffix = name.replace(/\d+$/, "");
  return withoutSuffix && withoutSuffix !== name ? [name, withoutSuffix] : [name];
}

// 환자 이름으로 검사 목록 조회. resultList 행에는 STS(상태), JNO, DAT, ETCINF 등이 담긴다.
export async function searchPatient(listTemplate, name) {
  for (const keyword of searchVariants(name)) {
    const payload = await postForm(LIST_URL, { ...listTemplate, I_NAM: keyword });
    const rows = (payload.resultList || []).filter(
      (row) => String(row.NAM || "").trim() === name
    );
    if (rows.length) return { rows, payload, keyword };
  }
  return { rows: [], payload: null, keyword: name };
}

export async function fetchDetail(detailTemplate, resultRow) {
  const form = {
    ...(detailTemplate || {}),
    I_JNO: String(resultRow.JNO || ""),
    I_DTLJNO: String(resultRow.JNO || ""),
    I_DAT: String(resultRow.DAT || ""),
    I_DTLDAT: String(resultRow.DAT || ""),
    I_CHN: String(resultRow.CHN || "")
  };
  return postForm(DETAIL_URL, form);
}

// STS: 1=검사중(결과없음), 2=완료, 4=중간보고. 2/4 를 "결과 있음" 으로 본다.
export function hasResult(resultRow) {
  const sts = String(resultRow.STS || "");
  return sts === "2" || sts === "4";
}
