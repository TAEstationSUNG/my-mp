-- 🗳️ 정치 활동 투명화 앱 — Supabase(Postgres) 스키마
-- 원칙: 로그인 없음(Auth 미사용), 열린국회정보 원문 필드를 가공 없이 저장.
-- 조인 키: MONA_CD(의원 고유코드) / BILL_ID(법안 고유코드).
--
-- 외래키(FK) 방침: 외부 API 데이터는 지저분해서(과거 의원, 위원장 대안 등),
--   교차 참조에 FK를 강하게 걸면 적재가 통째로 실패한다.
--   그래서 "우리가 직접 넣는 부모"를 참조하는 곳에만 FK를 걸고,
--   나머지 조인 관계는 인덱스 + 주석으로만 표현한다.
--
-- 적용: Supabase 대시보드 → SQL Editor → 전체 붙여넣고 Run

-- ─────────────────────────────────────────────────────────────
-- 1. 의원 (source: nwvrqwxyaytdsfvhu, 국회의원 인적사항)
-- ─────────────────────────────────────────────────────────────
create table if not exists members (
  mona_cd        text primary key,          -- 의원 고유코드 (모든 조인의 기준)
  hg_nm          text not null,             -- 한글 성명
  hj_nm          text,                      -- 한자 성명
  eng_nm         text,                      -- 영문 성명
  bth_date       date,                      -- 생년월일
  sex_gbn_nm     text,                      -- 성별
  poly_nm        text,                      -- 정당명
  orig_nm        text,                      -- 선거구 (예: "경기 파주시을", "비례대표")
  elect_gbn_nm   text,                      -- 선거구분 (지역구 / 비례대표)
  cmit_nm        text,                      -- 소속 위원회 (콤마 구분 원문 그대로)
  reele_gbn_nm   text,                      -- 당선 횟수 (초선/재선…)
  units          text,                      -- 대수 (예: "제22대")
  tel_no         text,
  e_mail         text,
  homepage       text,
  assem_addr     text,                      -- 의원회관 호실
  mem_title      text,                      -- 약력 원문
  staff          text,                      -- 보좌관 이름(콤마 구분)
  secretary      text,                      -- 선임비서관
  secretary2     text,                      -- 비서 등
  age            int  default 22,
  synced_at      timestamptz default now()
);

-- 기존 members 테이블에 보좌진 컬럼 추가(이미 만든 DB용 · 재실행 안전)
alter table members add column if not exists staff text;
alter table members add column if not exists secretary text;
alter table members add column if not exists secretary2 text;

create index if not exists idx_members_orig on members (orig_nm);
create index if not exists idx_members_poly on members (poly_nm);

-- ─────────────────────────────────────────────────────────────
-- 2. 법안 (source: nzmimeepazxkubdpn, 의원 발의법률안)
-- ─────────────────────────────────────────────────────────────
create table if not exists bills (
  bill_id        text primary key,
  bill_no        text,
  bill_name      text not null,
  propose_dt     date,
  proc_result    text,
  proc_dt        date,
  committee      text,
  committee_id   text,
  age            int  default 22,
  rst_mona_cd    text,                      -- 대표발의자 코드 (→ members.mona_cd, FK 없음)
  rst_proposer   text,                      -- 대표발의자 이름 원문
  publ_proposer  text,                      -- 공동발의자 이름 원문 (콤마 나열)
  proposer       text,                      -- "김우영의원 등 15인" 형태 원문
  detail_link    text,
  synced_at      timestamptz default now()
);

create index if not exists idx_bills_rst_mona on bills (rst_mona_cd);
create index if not exists idx_bills_propose_dt on bills (propose_dt desc);

-- 공동발의 관계 (PUBL_MONA_CD 콤마 문자열을 정규화). bill_id는 우리가 넣는 bills 참조 → FK 유지.
create table if not exists bill_coproposers (
  bill_id   text references bills(bill_id) on delete cascade,
  mona_cd   text,                           -- → members.mona_cd (과거 의원 가능성 있어 FK 없음)
  primary key (bill_id, mona_cd)
);

-- ─────────────────────────────────────────────────────────────
-- 3. 표결 (의원 개인별) (source: nojepdqqaweusdfbi, 국회의원 본회의 표결정보)
--    RESULT_VOTE_MOD = 찬성 / 반대 / 기권 / 불참
--    ※ 대상 법안엔 위원장 대안·정부안도 있어 bill_id에 FK 걸지 않음
-- ─────────────────────────────────────────────────────────────
create table if not exists votes (
  bill_id          text,                    -- → bills.bill_id 일 수도, 아닐 수도 (FK 없음)
  mona_cd          text,                    -- → members.mona_cd (FK 없음)
  result_vote_mod  text not null,           -- 찬성 / 반대 / 기권 / 불참
  vote_date        timestamptz,
  bill_name        text,
  law_title        text,
  session_cd       text,
  age              int default 22,
  synced_at        timestamptz default now(),
  primary key (bill_id, mona_cd)
);

create index if not exists idx_votes_mona on votes (mona_cd);
create index if not exists idx_votes_bill on votes (bill_id);

-- ─────────────────────────────────────────────────────────────
-- 4. 법안별 표결 집계 (source: ncocpgfiaoituanbr, 의안별 표결현황)
-- ─────────────────────────────────────────────────────────────
create table if not exists bill_vote_summary (
  bill_id          text primary key,        -- FK 없음(위 3번과 동일 이유)
  proc_dt          date,
  proc_result_cd   text,
  bill_kind_cd     text,
  curr_committee   text,
  member_tcnt      int,
  vote_tcnt        int,
  yes_tcnt         int,
  no_tcnt          int,
  blank_tcnt       int,
  age              int default 22,
  synced_at        timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- 5. 이슈 태그 (키워드 규칙 기반: 청년주거 / 고용 / 연금)
-- ─────────────────────────────────────────────────────────────
create table if not exists issue_tags (
  slug        text primary key,
  label       text not null,
  keywords    text[] not null,
  description text
);

create table if not exists bill_issue_tags (
  bill_id   text references bills(bill_id) on delete cascade,
  tag_slug  text references issue_tags(slug) on delete cascade,
  primary key (bill_id, tag_slug)
);

insert into issue_tags (slug, label, keywords, description) values
  ('youth_housing', '청년 주거',
     array['전세','월세','주거','임대','청년주택','행복주택','보증금','주택'],
     '법안명에 주거 관련 키워드가 포함되면 태깅'),
  ('employment', '일자리·고용',
     array['고용','일자리','노동','근로','채용','최저임금','실업','비정규직','청년고용','취업'],
     '법안명에 일자리·고용·노동 관련 키워드가 포함되면 태깅'),
  ('pension', '연금',
     array['연금','국민연금','퇴직연금','기초연금','노령연금'],  -- '노후'는 '노후계획도시' 오탐이라 제외
     '법안명에 연금 관련 키워드가 포함되면 태깅')
on conflict (slug) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 6. 재산등록 (source: 전자관보 PDF — Phase 별도 파이프라인)
--    원문 그대로 + 출처 명시 + '고지거부' 명시. 코멘트/증감계산 금지.
-- ─────────────────────────────────────────────────────────────
create table if not exists asset_disclosures (
  id           bigint generated always as identity primary key,
  mona_cd      text,
  relation     text,                        -- 본인 / 배우자 / 장남 등 (원문)
  category     text,                        -- 부동산 / 예금 / 주식 등 (원문)
  detail       text,
  amount_text  text,                        -- 금액 '원문 문자열' (계산 안 함)
  is_refused   boolean default false,       -- 고지거부 여부
  source_name  text,
  source_date  date,
  source_url   text,
  synced_at    timestamptz default now()
);

create index if not exists idx_assets_mona on asset_disclosures (mona_cd);

-- ─────────────────────────────────────────────────────────────
-- 7. 뷰: 의원별 본회의 표결 참여율 (출석률 근사, '불참'=결석)
-- ─────────────────────────────────────────────────────────────
create or replace view member_vote_participation
with (security_invoker = on) as
select
  m.mona_cd,
  m.hg_nm,
  count(v.*)                                             as total_votes,
  count(*) filter (where v.result_vote_mod <> '불참')    as attended,
  count(*) filter (where v.result_vote_mod = '불참')     as absent,
  round(
    100.0 * count(*) filter (where v.result_vote_mod <> '불참')
    / nullif(count(v.*), 0), 1
  )                                                      as participation_rate
from members m
left join votes v on v.mona_cd = m.mona_cd
group by m.mona_cd, m.hg_nm;

-- ─────────────────────────────────────────────────────────────
-- 8. RLS(행 수준 보안) + 공개 읽기 정책
--    · 모든 테이블에 RLS 켬 → 정책 없으면 접근 차단이 기본
--    · anon/authenticated 에게 SELECT(읽기)만 허용 → 쓰기 정책은 만들지 않음
--    · 수집 스크립트는 service_role 키라 RLS 우회 → 정상 쓰기
--    · 데이터는 전부 이미 공개된 국회 정보라 전체 공개 읽기가 원칙에 부합
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'members','bills','bill_coproposers','votes','bill_vote_summary',
    'issue_tags','bill_issue_tags','asset_disclosures'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "public read" on %I', t);
    execute format('create policy "public read" on %I for select using (true)', t);
  end loop;
end $$;
