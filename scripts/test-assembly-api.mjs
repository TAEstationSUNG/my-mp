// 열린국회정보 Open API 응답 구조 검증 스크립트
// 사용법:
//   1) open.assembly.go.kr 에서 인증키 발급 (아래 README 참고)
//   2) 터미널에서:  ASSEMBLY_API_KEY=발급받은키 node scripts/test-assembly-api.mjs
//      (PowerShell:  $env:ASSEMBLY_API_KEY="발급받은키"; node scripts/test-assembly-api.mjs )
//
// 목적: PRD "다음 단계 1번" — 실제로 호출해서 응답 구조/필드 이름을 눈으로 확인한다.
//       코드가 틀린 엔드포인트가 있어도 나머지는 성공하고, 성공한 것의 실제 필드명을 뽑아준다.

const KEY = process.env.ASSEMBLY_API_KEY;
const BASE = "https://open.assembly.go.kr/portal/openapi";

if (!KEY) {
  console.error("\n❌ ASSEMBLY_API_KEY 환경변수가 없습니다.");
  console.error('   PowerShell:  $env:ASSEMBLY_API_KEY="여기에키"; node scripts/test-assembly-api.mjs\n');
  process.exit(1);
}

// 검증할 엔드포인트들. code(서비스ID)는 포털에서 각 API 상세페이지의 "요청주소"에 있는 값.
// ⚠️ member/attendance 코드는 확정 전이라 실패하면 포털에서 실제 코드로 교체하면 됨.
const ENDPOINTS = [
  {
    label: "발의법률안 (의원 발의 의안 목록)",
    code: "nzmimeepazxkubdpn",
    params: { AGE: "22", pSize: "3" }, // AGE=대수(22대)
    confident: true,
  },
  {
    label: "의안별 표결현황 (본회의 표결)",
    code: "ncocpgfiaoituanbr",
    params: { AGE: "22", pSize: "3" },
    confident: true,
  },
  {
    label: "국회의원 인적사항(통합)",
    code: "nwvrqwxyaytdsfvhu",
    params: { pSize: "3" },
    confident: true,
  },
  {
    label: "국회의원 본회의 표결정보 (의원 개인별 찬반)",
    code: "nojepdqqaweusdfbi",
    // 이 API는 특정 법안(BILL_ID)을 지정해야 의원별 표결이 나온다.
    // 아래 BILL_ID는 앞선 표결현황 테스트에서 나온 '건축법 일부개정법률안(대안)'.
    params: { AGE: "22", BILL_ID: "PRC_S2O6P0O4W3B0O1I5F4G4M5Q3T5R9D5", pSize: "3" },
    confident: true,
  },
];

// 열린국회정보 응답은 { 서비스명: [ {head:[...]}, {row:[...]} ] } 형태.
// 서비스명이 뭐가 될지 모르니 구조에서 head/row 를 직접 찾아낸다.
function parseAssembly(json) {
  // 최상위 키 중 배열인 값을 찾는다
  const topKey = Object.keys(json).find((k) => Array.isArray(json[k]));
  if (!topKey) {
    // RESULT 만 온 경우(에러) 처리
    return { ok: false, result: json.RESULT || json, rows: [], serviceName: null };
  }
  const arr = json[topKey];
  const headBlock = arr.find((el) => el && el.head);
  const rowBlock = arr.find((el) => el && el.row);
  const result =
    headBlock?.head?.find((h) => h.RESULT)?.RESULT ??
    (Array.isArray(headBlock?.head) ? headBlock.head : null);
  const totalCount = headBlock?.head?.find((h) => "list_total_count" in h)?.list_total_count;
  return {
    ok: result?.CODE?.startsWith("INFO-00") ?? Boolean(rowBlock),
    serviceName: topKey,
    result,
    totalCount,
    rows: rowBlock?.row ?? [],
  };
}

async function testOne(ep) {
  const qs = new URLSearchParams({
    KEY,
    Type: "json",
    pIndex: "1",
    pSize: "3",
    ...ep.params,
  });
  const url = `${BASE}/${ep.code}?${qs}`;
  console.log("\n" + "=".repeat(70));
  console.log(`▶ ${ep.label}`);
  console.log(`  code: ${ep.code}${ep.confident ? "" : "  (확정 전)"}`);

  try {
    const res = await fetch(url);
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      console.log(`  ⚠️ JSON 파싱 실패. 원문 앞부분:\n${text.slice(0, 300)}`);
      return;
    }
    const parsed = parseAssembly(json);
    if (!parsed.ok) {
      console.log(`  ❌ 실패:`, JSON.stringify(parsed.result));
      return;
    }
    console.log(`  ✅ 성공  |  서비스명(JSON key): ${parsed.serviceName}  |  전체건수: ${parsed.totalCount}`);
    const first = parsed.rows[0];
    if (first) {
      console.log(`  📋 응답 필드(${Object.keys(first).length}개):`);
      for (const [k, v] of Object.entries(first)) {
        const preview = String(v ?? "").slice(0, 40);
        console.log(`     - ${k.padEnd(22)} : ${preview}`);
      }
    } else {
      console.log("  (row 없음)");
    }
  } catch (err) {
    console.log(`  ❌ 네트워크 오류:`, err.message);
  }
}

console.log("열린국회정보 Open API 검증 시작 …");
for (const ep of ENDPOINTS) {
  await testOne(ep);
}
console.log("\n완료. 실패한 엔드포인트는 포털에서 실제 서비스ID로 교체하면 됩니다.\n");
