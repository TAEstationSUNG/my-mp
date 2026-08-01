import { supabase } from "../../../lib/supabase";
import { partyColor, initial } from "../../../lib/ui";
import { ALLOWANCE } from "../../../lib/allowance";
import { regionFromOrig, getRegionNews, NEWS_TOPICS } from "../../../lib/news";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

// 국회 의안정보시스템 원문(제안이유·주요내용·표결기록) 링크
const billUrl = (id) => `https://likms.assembly.go.kr/bill/billDetail.do?billId=${id}`;

async function getData(monaCd, newsTopic = "") {
  const { data: member } = await supabase
    .from("members")
    .select("*")
    .eq("mona_cd", monaCd)
    .maybeSingle();
  if (!member) return null;

  // 이슈 태그 라벨(slug → 라벨)
  const { data: tagRows } = await supabase.from("issue_tags").select("slug, label");
  const tagLabels = Object.fromEntries((tagRows ?? []).map((t) => [t.slug, t.label]));

  // 대표발의 법안 + 각 법안의 이슈 태그(중첩 조회)
  const { data: rawBills, count: billCount } = await supabase
    .from("bills")
    .select("bill_id, bill_name, propose_dt, proc_result, bill_issue_tags(tag_slug)", {
      count: "exact",
    })
    .eq("rst_mona_cd", monaCd)
    .order("propose_dt", { ascending: false })
    .limit(100);

  const bills = (rawBills ?? []).map((b) => ({
    ...b,
    tags: (b.bill_issue_tags ?? []).map((t) => t.tag_slug),
  }));

  const { data: part } = await supabase
    .from("member_vote_participation")
    .select("total_votes, attended, absent, participation_rate")
    .eq("mona_cd", monaCd)
    .maybeSingle();

  const { data: votes } = await supabase
    .from("votes")
    .select("bill_id, bill_name, result_vote_mod, vote_date")
    .eq("mona_cd", monaCd)
    .order("vote_date", { ascending: false })
    .limit(8);

  // 청년·민생 이슈별 발의 건수(이 의원, 전체 법안 기준 정확 카운트)
  const issueOrder = ["youth_housing", "employment", "pension"];
  const issueCountEntries = await Promise.all(
    issueOrder.map(async (slug) => {
      const { count } = await supabase
        .from("bills")
        .select("bill_id, bill_issue_tags!inner(tag_slug)", { count: "exact", head: true })
        .eq("rst_mona_cd", monaCd)
        .eq("bill_issue_tags.tag_slug", slug);
      return [slug, count ?? 0];
    })
  );
  const issueCounts = Object.fromEntries(issueCountEntries);

  const news = await getRegionNews(regionFromOrig(member.orig_nm), newsTopic);

  return {
    member,
    bills,
    billCount: billCount ?? 0,
    part,
    votes: votes ?? [],
    tagLabels,
    issueCounts,
    news,
  };
}

// API 원문에 섞인 HTML 엔티티(&middot; 등)를 보이는 문자로 복원 (내용 변경 아님)
function decodeEntities(s) {
  if (!s) return s;
  return s
    .replace(/&middot;/g, "·")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function voteClass(v) {
  if (v === "찬성") return "vote-yes";
  if (v === "반대") return "vote-no";
  return "vote-etc";
}

export default async function MemberPage({ params, searchParams }) {
  const { monaCd } = await params;
  const { tag: activeTag = "", news: newsTopic = "" } = (await searchParams) ?? {};
  const data = await getData(monaCd, newsTopic);
  if (!data) notFound();
  const { member: m, bills, billCount, part, votes, tagLabels, issueCounts, news } = data;
  const youthOrder = ["youth_housing", "employment", "pension"];
  const youthTotal = youthOrder.reduce((s, slug) => s + (issueCounts[slug] ?? 0), 0);

  // 이 의원 법안이 실제로 걸린 이슈 태그(칩으로 노출)
  const availableTags = [...new Set(bills.flatMap((b) => b.tags))].filter(
    (slug) => tagLabels[slug]
  );
  const isFiltering = activeTag && availableTags.includes(activeTag);
  const shownBills = isFiltering
    ? bills.filter((b) => b.tags.includes(activeTag))
    : bills.slice(0, 10);
  const billUrlFor = (slug) =>
    slug ? `/member/${monaCd}?tag=${slug}` : `/member/${monaCd}`;
  // 지역 뉴스 이슈 필터 링크 (기존 tag 필터는 유지)
  const newsHref = (q) => {
    const p = new URLSearchParams();
    if (activeTag) p.set("tag", activeTag);
    if (q) p.set("news", q);
    const s = p.toString();
    return `/member/${monaCd}${s ? `?${s}` : ""}`;
  };

  // 계류 카운터 — 처리결과가 빈 법안 = 아직 심사 중(계류). 대상은 '제도(심사 속도)', 판단 없이 날짜만.
  const isPending = (b) => !b.proc_result || !String(b.proc_result).trim();
  const pendingBills = bills.filter(isPending);
  const processedCount = bills.length - pendingBills.length;
  const oldestPending = pendingBills.reduce(
    (min, b) => (!min || (b.propose_dt && b.propose_dt < min.propose_dt) ? b : min),
    null
  );
  const daysPending = oldestPending?.propose_dt
    ? Math.floor((Date.now() - new Date(oldestPending.propose_dt).getTime()) / 86400000)
    : null;

  // 실제 보좌진 인원(이름 콤마 구분 → 개수만). 데이터 없으면 null → 정원 표기로 폴백.
  const countNames = (s) => (s ? String(s).split(",").filter((x) => x.trim()).length : 0);
  const hasAideData = m.staff != null || m.secretary != null || m.secretary2 != null;
  const aideCount = hasAideData
    ? countNames(m.staff) + countNames(m.secretary) + countNames(m.secretary2)
    : null;

  return (
    <main className="container">
      <a href="/" className="back">‹ 검색으로</a>

      <div className="profile-head">
        <div className="avatar lg" style={{ background: partyColor(m.poly_nm) }}>
          {initial(m.hg_nm)}
        </div>
        <div className="meta">
          <h1>{m.hg_nm}</h1>
          <div>
            <span className="party-badge" style={{ background: partyColor(m.poly_nm) }}>
              {m.poly_nm ?? "무소속"}
            </span>
            <span className="chip">{m.orig_nm ?? m.elect_gbn_nm}</span>
            {m.reele_gbn_nm && <span className="chip">{m.reele_gbn_nm}</span>}
          </div>
        </div>
      </div>

      {/* 청년·민생 이슈 활동 — "나(청년)를 위해 뭘 했나" 요약 */}
      <div className="youth-card">
        <div className="youth-head">
          <div>
            <div className="youth-title">청년·민생 이슈 활동</div>
            <div className="youth-sub">주거 · 일자리 · 연금에 발의한 법안</div>
          </div>
          <div className="youth-total">
            {youthTotal}
            <span>건</span>
          </div>
        </div>
        <div className="youth-chips">
          {youthOrder.map((slug) => (
            <a key={slug} href={`/member/${monaCd}?tag=${slug}`} className="youth-chip">
              <span className="youth-chip-label">{tagLabels[slug] ?? slug}</span>
              <span className="youth-chip-num">{issueCounts[slug] ?? 0}</span>
            </a>
          ))}
        </div>
      </div>

      {/* 인적사항 — 통째로 접기/펼치기 */}
      <details className="section" open>
        <summary>인적사항</summary>
        <div className="card">
          <dl className="kv">
            {m.hj_nm && (<><dt>한자</dt><dd>{m.hj_nm}</dd></>)}
            {m.bth_date && (<><dt>생년월일</dt><dd>{m.bth_date}</dd></>)}
            {m.cmit_nm && (<><dt>소속 위원회</dt><dd>{m.cmit_nm}</dd></>)}
            {m.units && (<><dt>대수</dt><dd>{m.units}</dd></>)}
            {m.assem_addr && (<><dt>사무실</dt><dd>{m.assem_addr}</dd></>)}
            {m.tel_no && (<><dt>전화</dt><dd>{m.tel_no}</dd></>)}
          </dl>
          {m.mem_title && (
            <details className="collapse">
              <summary>학력 · 경력 펼치기</summary>
              <p className="career">{decodeEntities(m.mem_title)}</p>
            </details>
          )}
        </div>
      </details>

      {/* 현재 활동 */}
      <h2>현재 활동</h2>
      <div className="card">
        <div className="stat">
          <div className="box">
            <div className="num">{billCount}</div>
            <div className="lbl">대표발의 법안</div>
          </div>
          <div className="box accent">
            <div className="num">
              {part?.participation_rate != null ? `${part.participation_rate}%` : "—"}
            </div>
            <div className="lbl">본회의 표결 참여율</div>
          </div>
          <div className="box">
            <div className="num small">
              {part ? `${part.attended} / ${part.total_votes}` : "—"}
            </div>
            <div className="lbl">참여 / 전체 표결</div>
          </div>
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          ※ ‘표결 참여율’은 본회의 표결에서 ‘불참’이 아닌 비율입니다(출석률 근사).
          위원회 출석률은 현재 공개 데이터가 없어 표시하지 않습니다.
        </p>
      </div>

      {/* 법안 계류 카운터 — 대상은 사람이 아니라 '심사 속도(제도)' */}
      <h2>법안 처리 현황</h2>
      <div className="card">
        <div className="stat">
          <div className="box">
            <div className="num">{processedCount}</div>
            <div className="lbl">처리 완료</div>
          </div>
          <div className="box">
            <div className="num">{pendingBills.length}</div>
            <div className="lbl">심사 중(계류)</div>
          </div>
          <div className="box accent">
            <div className="num small">
              {daysPending != null ? `${daysPending}일째` : "—"}
            </div>
            <div className="lbl">최장 계류</div>
          </div>
        </div>
        {oldestPending && (
          <p className="pending-line">
            ⏳ 가장 오래 계류 중: <b>{oldestPending.bill_name}</b> — 상정 {daysPending}일째
          </p>
        )}
        <p className="hint" style={{ marginTop: 10 }}>
          ※ 상정 후 처리까지 걸린 날짜만 계산한 값이에요(오늘 기준). 국회 <b>심사 속도</b>를
          보여줄 뿐, 좋다/나쁘다 평가는 하지 않아요.
          {bills.length < billCount && ` (최근 ${bills.length}건 기준)`}
        </p>
      </div>

      {/* 세비·운영비 — 전원 동일 고정 지원 (PRD 10-1) */}
      <h2>세비 · 운영비</h2>
      <p className="caption">
        모든 국회의원에게 <b>동일하게</b> 적용되는 고정 지원이에요(개인별 차이 아님).
        위 활동(발의·표결·처리)과 나란히 놓고 ‘예산 대비 결과’를 스스로 판단해보세요.
      </p>
      <div className="card">
        {/* 월급 크게 + 연간세비 아래 */}
        <div className="salary-head">
          <div className="salary-label">월급 (세비)</div>
          <div className="salary-monthly">{ALLOWANCE.salaryMonthly}</div>
          <div className="salary-annual">연간 세비 {ALLOWANCE.salaryAnnual}</div>
          <div className="salary-note">{ALLOWANCE.salaryNote}</div>
        </div>

        <dl className="allowance">
          {/* 보좌 인력 — 실제 인원(의원별) + 1인당 세금 비용 */}
          <div className="allowance-row">
            <dt>보좌 인력</dt>
            <dd>
              <span className="allowance-val">
                {aideCount != null ? `실제 ${aideCount}명` : "최대 9명"}
              </span>
              <span className="allowance-note">
                {ALLOWANCE.aidePerPerson} · {ALLOWANCE.aideNote}
              </span>
            </dd>
          </div>
          {ALLOWANCE.items.map((it) => (
            <div key={it.label} className="allowance-row">
              <dt>{it.label}</dt>
              <dd>
                <span className="allowance-val">{it.value}</span>
                <span className="allowance-note">{it.note}</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="hint" style={{ marginTop: 10 }}>
          출처: {ALLOWANCE.source} · {ALLOWANCE.baseYear} 기준. 개인별 실제 집행액은 국회가
          공개하지 않아 <b>기준(참고) 액수</b>만 표시해요.
        </p>
      </div>

      {/* 대표발의 법안 */}
      <h2>
        대표발의 법안{" "}
        {isFiltering
          ? `(‘${tagLabels[activeTag]}’ ${shownBills.length}건)`
          : billCount > 10
          ? `(최근 10건 / 총 ${billCount}건)`
          : ""}
      </h2>
      <p className="caption">
        (*<b>대표발의</b>란, 그 법안을 대표로 제안한 의원이에요.)
        ‘원문 보기’를 누르면 국회 원문에서 제안 이유·주요 내용을 볼 수 있어요.
        쉬운 말 요약(AI)은 곧 추가될 예정이에요.
      </p>

      {/* 이슈 태그 필터 (청년주거/고용/연금) */}
      {availableTags.length > 0 && (
        <div className="tag-filter">
          <a href={billUrlFor("")} className={`tag-chip ${!isFiltering ? "on" : ""}`}>
            전체
          </a>
          {availableTags.map((slug) => (
            <a
              key={slug}
              href={billUrlFor(slug)}
              className={`tag-chip ${activeTag === slug ? "on" : ""}`}
            >
              {tagLabels[slug]}
            </a>
          ))}
        </div>
      )}

      <div className="card">
        {shownBills.length === 0 && (
          <p className="empty">
            {isFiltering ? "해당 이슈의 대표발의 법안이 없습니다." : "대표발의한 법안이 없습니다."}
          </p>
        )}
        {shownBills.map((b) => (
          <div key={b.bill_id} className="bill-item">
            <div>{b.bill_name}</div>
            <div className="meta">
              {b.propose_dt} {b.proc_result ? `· ${b.proc_result}` : "· 처리 진행중"}
            </div>
            {b.tags.length > 0 && (
              <div className="bill-tags">
                {b.tags
                  .filter((slug) => tagLabels[slug])
                  .map((slug) => (
                    <span key={slug} className="issue-badge">
                      #{tagLabels[slug]}
                    </span>
                  ))}
              </div>
            )}
            <div className="bill-actions">
              <a
                href={billUrl(b.bill_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="act-link"
              >
                원문 보기 ↗
              </a>
              <span className="act-chip soon" title="곧 제공될 예정이에요">
                🤖 AI 요약 (준비 중)
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 최근 표결 */}
      <h2>최근 본회의 표결</h2>
      <p className="caption">
        (*<b>본회의</b>란, 국회의원 전원이 모여 법안을 최종적으로 찬반 표결하는 회의예요.)
        아래 찬성·반대는 이 의원이 실제로 던진 표(국회 공식 기록)이고, 누르면 원문에서 확인돼요.
      </p>
      <div className="card">
        {votes.length === 0 && (
          <p className="empty">표결 기록이 아직 적재되지 않았습니다.</p>
        )}
        {votes.map((v, i) => (
          <a
            key={i}
            href={billUrl(v.bill_id)}
            target="_blank"
            rel="noopener noreferrer"
            className="bill-item link"
          >
            <div className="row">
              <span>{v.bill_name}</span>
              <span className={`vote-badge ${voteClass(v.result_vote_mod)}`}>
                {v.result_vote_mod}
              </span>
            </div>
            <div className="meta">
              {v.vote_date ? `${new Date(v.vote_date).toLocaleDateString("ko-KR")} · ` : ""}
              원문에서 확인 ↗
            </div>
          </a>
        ))}
      </div>

      {/* 우리 지역구 최근 소식 — 지역 뉴스(≠ 의원 활동), 원문 연결 */}
      {news?.region && (
        <>
          <h2>우리 지역구 최근 소식 · {news.region}</h2>
          <p className="caption">
            지역구 <b>{news.region}</b>의 최근 뉴스예요 (Google 뉴스 · 최신순).
            <b> 의원 활동이 아니라 지역 소식</b>이고, 제목을 누르면 원문 기사로 이어져요.
          </p>
          <div className="tag-filter">
            {NEWS_TOPICS.map((t) => (
              <a
                key={t.q || "all"}
                href={newsHref(t.q)}
                className={`tag-chip ${newsTopic === t.q ? "on" : ""}`}
              >
                {t.label}
              </a>
            ))}
          </div>
          <div className="card">
            {news.items.length === 0 && (
              <p className="empty">
                {news.topic ? `‘${news.region} ${news.topic}’ 뉴스가 없어요.` : "지금은 지역 뉴스를 불러오지 못했어요."}
              </p>
            )}
            {news.items.map((n, i) => (
              <a
                key={i}
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="bill-item link"
              >
                <div>{n.title}</div>
                <div className="meta">
                  {n.source}
                  {n.date ? ` · ${n.date}` : ""}
                </div>
              </a>
            ))}
          </div>
        </>
      )}

      {/* 준비중 항목 (PRD: 없는 건 억지로 채우지 않고 명시) */}
      <h2>재산등록 · 과거 공약</h2>
      <div className="notice">
        재산등록(관보)과 과거 선거 공약은 별도 파이프라인으로 준비 중입니다.
        확보되는 대로 원문·출처와 함께 그대로 표시할 예정입니다.
      </div>

      <p className="principle">
        모든 정보는 열린국회정보 등 공개 데이터의 원문입니다.
        각 항목은 국회 의안정보시스템 원문으로 연결됩니다.
      </p>
    </main>
  );
}
