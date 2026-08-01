# 🗳️ 내 의원 뭐하나

**훅: "내 지역구 의원, 요즘 뭐 하고 있을까?"** — 지역구 국회의원의
**인적사항 · 발의 · 표결 · 출석 · 재산등록**을 판단 없이 사실 그대로 보여주는 개인 프로젝트.
(내부 코드명: politics-transparency)

🔗 **라이브: https://my-mp-seven.vercel.app** · 저장소: https://github.com/TAEstationSUNG/my-mp
([Notion PRD](https://app.notion.com/p/3ad2a3b2231381ed8efdf069d0216c6c))

## 현재 단계: STEP 1 — API 검증

본격 개발 전에 열린국회정보 Open API가 실제로 어떤 데이터를 주는지 확인한다.

### 1) 인증키 발급

1. https://open.assembly.go.kr 접속 → 회원가입 / 로그인
2. 상단 **OPEN API** 메뉴 → 로그인 상태에서 **마이페이지 → 인증키 발급** 신청
3. 발급된 인증키(문자열) 복사 (최대 10개까지 발급 가능)

### 2) 검증 스크립트 실행

PowerShell:

```bash
$env:ASSEMBLY_API_KEY="여기에_발급받은_인증키"; node scripts/test-assembly-api.mjs
```

성공하면 각 API의 **JSON key(서비스명)**, **전체 건수**, **실제 응답 필드 이름**이 출력된다.
이 필드 이름을 그대로 다음 단계의 Supabase 스키마 설계에 사용한다.

> 일부 엔드포인트 코드(국회의원 인적사항 등)는 아직 미확정이라 실패할 수 있음.
> 실패 시 포털의 해당 API 상세페이지 "요청주소"에 있는 서비스ID로 `scripts/test-assembly-api.mjs`의 `code` 값을 교체하면 됨.

## 확정된 데이터 소스 (STEP 1 결과)

| 데이터 | 서비스ID | 건수 | 조인 키 |
|---|---|---|---|
| 국회의원 인적사항 | `nwvrqwxyaytdsfvhu` | 299 | `MONA_CD` |
| 의원 발의법률안 | `nzmimeepazxkubdpn` | 18,501 | `RST_MONA_CD`, `PUBL_MONA_CD` |
| 의원별 본회의 표결 | `nojepdqqaweusdfbi` | 법안별 | `MONA_CD` + `BILL_ID` |
| 법안별 표결 집계 | `ncocpgfiaoituanbr` | 1,651 | `BILL_ID` |

- **출석률**: 별도 API 없음. 본회의 출석률은 표결정보의 `RESULT_VOTE_MOD='불참'` 비율로 근사(`member_vote_participation` 뷰). **위원회 출석률은 데이터 소스 없음 → 열린 질문.**

## STEP 3 — 수집 스크립트 (API → Supabase)

```bash
# 1) 의존성 설치
npm install

# 2) .env 만들기 (값 채우기)
Copy-Item .env.example .env

# 3) Supabase SQL Editor 에 supabase/schema.sql 적용 (테이블 생성)

# 4) 적재
npm run ingest:members       # 의원 299명
npm run ingest:bills         # 발의법안 + 공동발의
npm run ingest:votesummary   # 법안별 표결 집계
npm run ingest:votes         # 의원 개인별 표결 (오래 걸림)
npm run ingest:tags          # 이슈 태그 규칙 적용
# 또는 한 번에:  npm run ingest:all
```

- `ingest:votes` 는 표결 법안 하나당 API 1회라 느립니다. 처음엔 일부만:
  `node --env-file=.env scripts/ingest.mjs votes 50` (앞 50개 법안만)

## 로드맵 (Phase별) — 2026-08-01 갱신

원칙(전 Phase 공통): 점수·순위 없음 · 원문 그대로 + 출처 명시 · 로그인/자유텍스트 댓글 없음 ·
민감 항목은 "전원 동일 기준 수집 후 게재".

### 최근 변경 (2026-08-01)
- **서비스명 확정: "내 의원 뭐하나"** (훅: *"내 지역구 의원, 요즘 뭐 하고 있을까?"*)
- 첫 화면 질문형 훅 + 검색 결과 카드에 **최근 발의 미리보기**
- **디자인 전면 개편** — 컬러풀·친근, 정당색 아바타, 라이트/다크 자동전환, 모바일 반응형
- 프로필 UX — 인적사항/경력 **접기·펼치기**, 본회의·대표발의 **용어 설명 캡션**
- 법안·표결 항목에 **국회 원문(의안정보시스템) 링크** — "이게 진짜냐" 검증 가능
- 헤더의 "판단은 당신 몫" 문구 제거(커뮤니티 기능 없어 오해 소지)

### ✅ Phase 0 — 데이터 파이프라인 & 기본 앱 (완료)
- [x] 열린국회정보 API 4종 검증 (인적사항 / 발의 / 표결(집계·개인별))
- [x] Supabase 스키마 + RLS 공개 읽기 정책 (`supabase/schema.sql`)
- [x] 수집 스크립트 (`scripts/ingest.mjs`) — 의원·법안·표결·이슈태그
- [x] Next.js 앱 — 지역 검색 → 지역구 의원 목록 → 프로필
- [x] 본회의 표결 참여율(출석 근사, '불참' 비율)

### ▶ Phase 1 — MVP 완성 (지금 가진 데이터 + 신규 데이터 불필요)
- [x] 표결 데이터 전체 적재 (1,651개 법안 · 489,530건) → 참여율 정확화 완료
- [x] 이슈 태그 필터 UI (청년주거/고용/연금으로 법안 필터 + 법안별 이슈 배지) — PRD 4·6
- [x] Vercel 배포 → https://my-mp-seven.vercel.app
- [ ] **AI 요약(제안이유 쉬운말 번역)** — 지금은 "🤖 AI 요약(준비 중)" 버튼 칸만. Haiku+캐시로 구현 예정 — PRD 3-1 · ⚠️블로커(아래 참고)
- [ ] 세비·운영비 카드 (전원 동일 고정값, 정적 데이터) — PRD 10-1
- [ ] 부조리 카운터 ("상정 후 N일째 계류" 등, 대상은 제도·숫자) — PRD 10-4
- [ ] 공유용 OG 이미지 자동생성 (`next/og`, 팩트 카드) — PRD 10-5
- [ ] 이슈 카드 갤러리 (읽기 전용, 자동 큐레이션) — PRD 10-5
- [ ] GitHub Actions 자동 수집 스케줄링 — PRD 7

> ⚠️ **AI 요약 블로커(다음에 여기서 이어서):** 요약 재료인 '제안이유·주요내용'이 국회
> 의안정보시스템에서 **JS로 나중에 로드**돼 서버에서 그냥 fetch하면 안 나옴.
> 실제 소스는 `POST likms.assembly.go.kr/bill/bi/bill/detail/billInfo.do` 의
> `<pre id="prntSummary">` 인데, `billId`만 보내면 빈 껍데기가 옴(추가 파라미터 필요).
> → **다음 할 일**: ① `billInfo.do`의 정확한 요청 파라미터 확보, 또는
> ② 열린국회정보에 '제안이유' 제공 API가 있는지 확인. 재료만 확보되면 Haiku 요약+캐시는 간단.

### 🟡 Phase 2 — 어려운 데이터 파이프라인 (새 소스 필요)
- [ ] 재산등록 관보 PDF → 파싱/OCR → 구조화 (소규모 검증부터) — PRD 4·6
- [ ] 관보 명대사 카드 (재산 파이프라인 위, 원문+출처, 해석 없음) — PRD 10-3 · ⚖️법률검토
- [ ] 과거 선거 공약 (중앙선관위 정책·공약마당) — PRD 4·6
- [ ] 전과·병역사항 (중앙선관위 후보자 정보공개) — PRD 10-6
- [ ] 위원회 출석률 (`위원회 회의록` API '출석 위원' 명단 파싱) — PRD 4

### 🔴 Phase 3 — 발언·의혹·참여 (⚖️ 법률검토 + 전원 동일수집 필수)
- [ ] 발언·논란 아카이브 (회의록 등, 원문+맥락, 300명 동일 룰) — PRD 10-8
- [ ] 의혹 항목 (진행상태 라벨: 제기됨/수사중/무혐의/기소/확정) — PRD 10-7
- [ ] 원터치 투표 (익명 %, 새 쓰기 테이블 + RLS 익명 정책) — PRD 10-5
- [ ] 지역구 비교 랭킹 (지역 단위 익명 집계, 개인 저격 아님) — PRD 10-5
- [ ] 캐리커처 (인식 편의 목적) — PRD 10-2 · ⚖️초상권 검토
- [ ] 공약 ↔ 법안 텍스트 매칭 (로컬 임베딩) — PRD Phase 2
- [ ] 병역·젠더 이슈 태그 추가 / 비례대표 별도 보기 — PRD Phase 2

> ⚖️ = 게재 전 명예훼손·저작권·초상권 검토 필요. 특정 인물 먼저 수집·게재 금지(전원 동일 기준).
