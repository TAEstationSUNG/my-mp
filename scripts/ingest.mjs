// 🗳️ 열린국회정보 → Supabase 수집/적재 스크립트
//
// 준비:
//   1) npm install
//   2) .env.example 복사 → .env 에 ASSEMBLY_API_KEY / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 채우기
//   3) Supabase SQL Editor 에 supabase/schema.sql 적용 (테이블 먼저 생성)
//
// 실행:
//   npm run ingest:members        # 의원 299명
//   npm run ingest:bills          # 발의법안 전체 + 공동발의
//   npm run ingest:votesummary    # 법안별 표결 집계 (표결된 법안 목록의 원천)
//   npm run ingest:votes          # 의원 개인별 표결 (votesummary 먼저 필요, 오래 걸림)
//   npm run ingest:tags           # 이슈 태그(주거/고용/연금) 규칙 적용
//   npm run ingest:all            # 위 전부 순서대로
//
//   ingest:votes 는 법안 하나당 API 1회라 느립니다. 개수 제한:
//   node --env-file=.env scripts/ingest.mjs votes 50   ← 앞 50개 법안만

import { createClient } from "@supabase/supabase-js";

const KEY = process.env.ASSEMBLY_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

for (const [k, v] of Object.entries({ ASSEMBLY_API_KEY: KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY })) {
  if (!v) {
    console.error(`❌ 환경변수 ${k} 가 없습니다. .env 를 확인하세요.`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const BASE = "https://open.assembly.go.kr/portal/openapi";
const AGE = "22";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 값 변환 헬퍼 ────────────────────────────────────────────
const emptyToNull = (s) => (s == null || String(s).trim() === "" ? null : s);
const toDate = (s) => emptyToNull(s); // "2026-07-30" 형태면 그대로, 빈값이면 null
const toInt = (s) => {
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
};
// "20260723 164030" → ISO timestamp
function toTimestamp(s) {
  if (!s || String(s).trim() === "") return null;
  const m = String(s).trim().match(/^(\d{4})(\d{2})(\d{2})\s*(\d{2})?(\d{2})?(\d{2})?$/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", se = "00"] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${se}+09:00`;
}

// ── 열린국회정보 응답 파서 ──────────────────────────────────
function parse(json) {
  const topKey = Object.keys(json).find((k) => Array.isArray(json[k]));
  if (!topKey) return { rows: [], total: 0, endCode: json?.RESULT?.CODE };
  const arr = json[topKey];
  const head = arr.find((el) => el && el.head)?.head;
  const rows = arr.find((el) => el && el.row)?.row ?? [];
  const total = head?.find((h) => "list_total_count" in h)?.list_total_count ?? rows.length;
  const endCode = head?.find((h) => h.RESULT)?.RESULT?.CODE;
  return { rows, total, endCode };
}

// 한 서비스ID 전체 페이지를 순회하며 row 를 모아준다
// (요청마다 15초 시간제한 + 실패 시 1회 재시도 → 응답 없는 hang 방지)
async function fetchAll(code, extra = {}, { pSize = 1000, maxPages = Infinity } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const qs = new URLSearchParams({ KEY, Type: "json", pIndex: String(page), pSize: String(pSize), ...extra });
    const url = `${BASE}/${code}?${qs}`;
    let json;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        json = await res.json();
        break;
      } catch (e) {
        if (attempt === 2) throw new Error(`fetch 실패(${code}): ${e.message}`);
        await sleep(500);
      }
    }
    const { rows } = parse(json);
    if (rows.length === 0) break;
    out.push(...rows);
    if (rows.length < pSize) break; // 마지막 페이지
    await sleep(120); // 예의상 약간의 간격
  }
  return out;
}

// 배열을 청크로 나눠 upsert (한 번에 너무 많이 보내지 않도록)
async function upsertChunked(table, rows, onConflict, chunk = 500) {
  let done = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { error } = await supabase.from(table).upsert(slice, { onConflict });
    if (error) throw new Error(`[${table}] upsert 실패: ${error.message}`);
    done += slice.length;
    process.stdout.write(`\r  ${table}: ${done}/${rows.length}`);
  }
  process.stdout.write("\n");
}

// ── 1. 의원 ────────────────────────────────────────────────
async function syncMembers() {
  console.log("▶ 의원(members) 수집…");
  const raw = await fetchAll("nwvrqwxyaytdsfvhu", {});
  const rows = raw.map((r) => ({
    mona_cd: r.MONA_CD,
    hg_nm: r.HG_NM,
    hj_nm: emptyToNull(r.HJ_NM),
    eng_nm: emptyToNull(r.ENG_NM),
    bth_date: toDate(r.BTH_DATE),
    sex_gbn_nm: emptyToNull(r.SEX_GBN_NM),
    poly_nm: emptyToNull(r.POLY_NM),
    orig_nm: emptyToNull(r.ORIG_NM),
    elect_gbn_nm: emptyToNull(r.ELECT_GBN_NM),
    cmit_nm: emptyToNull(r.CMIT_NM),
    reele_gbn_nm: emptyToNull(r.REELE_GBN_NM),
    units: emptyToNull(r.UNITS),
    tel_no: emptyToNull(r.TEL_NO),
    e_mail: emptyToNull(r.E_MAIL),
    homepage: emptyToNull(r.HOMEPAGE),
    assem_addr: emptyToNull(r.ASSEM_ADDR),
    mem_title: emptyToNull(r.MEM_TITLE),
    staff: emptyToNull(r.STAFF),          // 보좌관 (콤마 구분 이름)
    secretary: emptyToNull(r.SECRETARY),  // 선임비서관
    secretary2: emptyToNull(r.SECRETARY2),// 비서 등
    age: toInt(r.AGE) ?? 22,
  })).filter((r) => r.mona_cd);
  await upsertChunked("members", rows, "mona_cd");
  console.log(`✅ 의원 ${rows.length}명`);
}

// ── 2. 법안 + 공동발의 ─────────────────────────────────────
async function syncBills() {
  console.log("▶ 법안(bills) 수집… (건수 많아 몇 초 걸림)");
  const raw = await fetchAll("nzmimeepazxkubdpn", { AGE });
  const bills = raw.map((r) => ({
    bill_id: r.BILL_ID,
    bill_no: emptyToNull(r.BILL_NO),
    bill_name: r.BILL_NAME,
    propose_dt: toDate(r.PROPOSE_DT),
    proc_result: emptyToNull(r.PROC_RESULT),
    proc_dt: toDate(r.PROC_DT),
    committee: emptyToNull(r.COMMITTEE),
    committee_id: emptyToNull(r.COMMITTEE_ID),
    age: toInt(r.AGE) ?? 22,
    rst_mona_cd: emptyToNull(r.RST_MONA_CD),
    rst_proposer: emptyToNull(r.RST_PROPOSER),
    publ_proposer: emptyToNull(r.PUBL_PROPOSER),
    proposer: emptyToNull(r.PROPOSER),
    detail_link: emptyToNull(r.DETAIL_LINK),
  })).filter((r) => r.bill_id && r.bill_name);
  await upsertChunked("bills", bills, "bill_id");
  console.log(`✅ 법안 ${bills.length}건`);

  // 공동발의 관계 정규화 (PUBL_MONA_CD 콤마 분리)
  const coRows = [];
  const seen = new Set();
  for (const r of raw) {
    if (!r.BILL_ID || !r.PUBL_MONA_CD) continue;
    for (const cd of String(r.PUBL_MONA_CD).split(",").map((s) => s.trim()).filter(Boolean)) {
      const k = `${r.BILL_ID}|${cd}`;
      if (seen.has(k)) continue;
      seen.add(k);
      coRows.push({ bill_id: r.BILL_ID, mona_cd: cd });
    }
  }
  if (coRows.length) {
    await upsertChunked("bill_coproposers", coRows, "bill_id,mona_cd");
    console.log(`✅ 공동발의 관계 ${coRows.length}건`);
  }
}

// ── 3. 법안별 표결 집계 ────────────────────────────────────
async function syncVoteSummary() {
  console.log("▶ 법안별 표결 집계(bill_vote_summary) 수집…");
  const raw = await fetchAll("ncocpgfiaoituanbr", { AGE });
  const rows = raw.map((r) => ({
    bill_id: r.BILL_ID,
    proc_dt: toDate(r.PROC_DT),
    proc_result_cd: emptyToNull(r.PROC_RESULT_CD),
    bill_kind_cd: emptyToNull(r.BILL_KIND_CD),
    curr_committee: emptyToNull(r.CURR_COMMITTEE),
    member_tcnt: toInt(r.MEMBER_TCNT),
    vote_tcnt: toInt(r.VOTE_TCNT),
    yes_tcnt: toInt(r.YES_TCNT),
    no_tcnt: toInt(r.NO_TCNT),
    blank_tcnt: toInt(r.BLANK_TCNT),
    age: toInt(r.AGE) ?? 22,
  })).filter((r) => r.bill_id);
  await upsertChunked("bill_vote_summary", rows, "bill_id");
  console.log(`✅ 표결 집계 ${rows.length}건`);
  return rows.map((r) => r.bill_id);
}

// ── 4. 의원 개인별 표결 (법안마다 API 1회) ──────────────────
async function syncVotes(limit = Infinity) {
  console.log("▶ 의원 개인별 표결(votes) 수집…");
  // 표결된 법안 목록을 DB(bill_vote_summary)에서 가져온다
  // Supabase는 한 번에 최대 1000행만 반환 → range 로 전체를 페이지네이션
  const allIds = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("bill_vote_summary")
      .select("bill_id")
      .order("proc_dt", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`bill_vote_summary 조회 실패: ${error.message}`);
    if (!data.length) break;
    allIds.push(...data.map((r) => r.bill_id));
    if (data.length < pageSize) break;
  }
  const billIds = allIds.slice(0, limit);
  if (billIds.length === 0) {
    console.log("⚠️ 먼저 votesummary 를 수집하세요 (표결된 법안 목록이 비어있음).");
    return;
  }
  console.log(`  대상 법안 ${billIds.length}개 (법안당 API 1회)`);

  let total = 0;
  let skipped = 0;
  for (let i = 0; i < billIds.length; i++) {
    const billId = billIds[i];
    try {
      const raw = await fetchAll("nojepdqqaweusdfbi", { AGE, BILL_ID: billId }, { pSize: 1000, maxPages: 1 });
      const rows = raw.map((r) => ({
        bill_id: r.BILL_ID,
        mona_cd: r.MONA_CD,
        result_vote_mod: r.RESULT_VOTE_MOD,
        vote_date: toTimestamp(r.VOTE_DATE),
        bill_name: emptyToNull(r.BILL_NAME),
        law_title: emptyToNull(r.LAW_TITLE),
        session_cd: emptyToNull(r.SESSION_CD),
        age: toInt(r.AGE) ?? 22,
      })).filter((r) => r.bill_id && r.mona_cd && r.result_vote_mod);
      if (rows.length) {
        const { error: e } = await supabase.from("votes").upsert(rows, { onConflict: "bill_id,mona_cd" });
        if (e) throw new Error(e.message);
        total += rows.length;
      }
    } catch (e) {
      skipped++; // 한 법안이 느리거나 실패해도 전체는 계속
    }
    process.stdout.write(`\r  진행 ${i + 1}/${billIds.length}  누적 ${total}건  건너뜀 ${skipped}`);
    await sleep(120);
  }
  process.stdout.write("\n");
  console.log(`✅ 표결 기록 ${total}건`);
}

// ── 5. 이슈 태그 규칙 적용 ─────────────────────────────────
// 키워드 정의(이곳이 원천). 규칙 기반이라 오탐 최소화하려면 '구체 키워드' 위주로.
const ISSUE_TAGS = [
  {
    slug: "youth_housing",
    label: "청년 주거",
    keywords: ["전세", "월세", "주거", "임대주택", "청년주택", "행복주택", "보증금", "주택청약", "주거급여"],
    description: "주거 관련 키워드 매칭",
  },
  {
    slug: "employment",
    label: "일자리·고용",
    keywords: ["고용", "일자리", "노동", "근로", "채용", "최저임금", "실업", "비정규직", "청년고용", "취업"],
    description: "일자리·고용·노동 관련 키워드 매칭",
  },
  {
    slug: "pension",
    label: "연금",
    // '노후'는 '노후계획도시'(도시재생) 오탐이라 제외 → 연금 전용어만
    keywords: ["연금", "국민연금", "퇴직연금", "기초연금", "노령연금"],
    description: "연금 관련 키워드 매칭",
  },
];

async function applyTags() {
  console.log("▶ 이슈 태그(bill_issue_tags) 재빌드…");

  // 1) 키워드 정의를 DB(issue_tags)에 동기화 (코드가 원천)
  await supabase.from("issue_tags").upsert(
    ISSUE_TAGS.map((t) => ({
      slug: t.slug,
      label: t.label,
      keywords: t.keywords,
      description: t.description,
    })),
    { onConflict: "slug" }
  );

  // 2) 기존 태그 전부 삭제(깨끗이 재빌드 — 키워드 바꿔도 stale 안 남게)
  const { error: delErr } = await supabase
    .from("bill_issue_tags")
    .delete()
    .neq("tag_slug", "___none___"); // 모든 행 매칭
  if (delErr) throw new Error(`bill_issue_tags 삭제 실패: ${delErr.message}`);

  // 3) 법안을 페이지로 읽으며 키워드 매칭 → 재삽입
  const pageSize = 1000;
  let from = 0;
  const tagRows = [];
  for (;;) {
    const { data: bills, error } = await supabase
      .from("bills")
      .select("bill_id,bill_name")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`bills 조회 실패: ${error.message}`);
    if (!bills.length) break;
    for (const b of bills) {
      const name = b.bill_name ?? "";
      for (const t of ISSUE_TAGS) {
        if (t.keywords.some((kw) => name.includes(kw))) {
          tagRows.push({ bill_id: b.bill_id, tag_slug: t.slug });
        }
      }
    }
    if (bills.length < pageSize) break;
    from += pageSize;
  }
  if (tagRows.length) {
    await upsertChunked("bill_issue_tags", tagRows, "bill_id,tag_slug");
  }
  console.log(`✅ 태그 매칭 ${tagRows.length}건`);
}

// ── 실행 진입점 ─────────────────────────────────────────────
const [, , target = "all", arg2] = process.argv;
const votesLimit = arg2 ? parseInt(arg2, 10) : Infinity;

try {
  switch (target) {
    case "members": await syncMembers(); break;
    case "bills": await syncBills(); break;
    case "votesummary": await syncVoteSummary(); break;
    case "votes": await syncVotes(votesLimit); break;
    case "tags": await applyTags(); break;
    case "all":
      await syncMembers();
      await syncBills();
      await syncVoteSummary();
      await syncVotes(votesLimit);
      await applyTags();
      break;
    default:
      console.error(`알 수 없는 대상: ${target} (members|bills|votesummary|votes|tags|all)`);
      process.exit(1);
  }
  console.log("\n🎉 완료");
} catch (err) {
  console.error("\n❌ 오류:", err.message);
  process.exit(1);
}
