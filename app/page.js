import { supabase } from "../lib/supabase";
import { partyColor, initial } from "../lib/ui";

export const dynamic = "force-dynamic"; // 항상 최신 DB 조회

async function searchMembers(q) {
  if (!q) return [];
  const { data, error } = await supabase
    .from("members")
    .select("mona_cd, hg_nm, poly_nm, orig_nm, elect_gbn_nm")
    .ilike("orig_nm", `%${q}%`)
    .order("hg_nm", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

// 검색된 의원들의 "최근 활동" — 각자 최신 발의 법안 + 발의 건수
async function recentActivity(monaCds) {
  if (monaCds.length === 0) return {};
  const { data } = await supabase
    .from("bills")
    .select("rst_mona_cd, bill_name, propose_dt")
    .in("rst_mona_cd", monaCds)
    .order("propose_dt", { ascending: false });

  const byMember = {};
  for (const b of data ?? []) {
    const cd = b.rst_mona_cd;
    if (!byMember[cd]) byMember[cd] = { latest: b, count: 0 };
    byMember[cd].count += 1;
  }
  return byMember;
}

const billUrl = (id) => `https://likms.assembly.go.kr/bill/billDetail.do?billId=${id}`;

// 이슈별(주거/고용/연금) 최근 법안 자동 큐레이션 — 읽기 전용 갤러리 (PRD 10-5)
async function getIssueGallery() {
  const { data: tags } = await supabase.from("issue_tags").select("slug, label");
  if (!tags?.length) return [];
  return Promise.all(
    tags.map(async (t) => {
      const { data, count } = await supabase
        .from("bills")
        .select("bill_id, bill_name, propose_dt, rst_proposer, bill_issue_tags!inner(tag_slug)", {
          count: "exact",
        })
        .eq("bill_issue_tags.tag_slug", t.slug)
        .order("propose_dt", { ascending: false })
        .limit(3);
      return { slug: t.slug, label: t.label, count: count ?? 0, bills: data ?? [] };
    })
  );
}

export default async function Home({ searchParams }) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const members = await searchMembers(query);
  const activity = await recentActivity(members.map((m) => m.mona_cd));
  const gallery = await getIssueGallery();

  return (
    <main className="container">
      <h1>내 지역구 의원,<br />요즘 뭐 하고 있을까?</h1>
      <p className="lead">
        우리 구 국회의원이 무슨 법안을 내고 어떻게 투표했는지 —
        판단·점수 없이 사실만 보여드려요.
      </p>

      {/* 두 입구: 의원 찾기 / 우리 동네 소식 */}
      <div className="entry-grid">
        <div className="entry-card">
          <div className="entry-emoji">🔍</div>
          <div className="entry-title">내 의원 찾기</div>
          <div className="entry-desc">지역구 국회의원의 활동·발의·표결을 봐요</div>
          <form className="search" action="/" method="get">
            <input type="text" name="q" defaultValue={query} placeholder="지역 입력 (예: 파주)" />
            <button type="submit">의원 보기</button>
          </form>
        </div>
        <div className="entry-card alt">
          <div className="entry-emoji">📰</div>
          <div className="entry-title">우리 동네 소식</div>
          <div className="entry-desc">동네 현안·뉴스 + 우리 지역 의원 알아보기</div>
          <form className="search" action="/town" method="get">
            <input type="text" name="q" placeholder="동네 입력 (예: 강북구)" />
            <button type="submit">소식 보기</button>
          </form>
        </div>
      </div>

      {query !== "" && members.length === 0 && (
        <p className="empty">‘{query}’ 로 찾은 의원이 없어요. 다른 지역명으로 해보세요.</p>
      )}

      {members.map((m) => {
        const act = activity[m.mona_cd];
        return (
          <a key={m.mona_cd} href={`/member/${m.mona_cd}`} className="member-row">
            <div className="avatar" style={{ background: partyColor(m.poly_nm) }}>
              {initial(m.hg_nm)}
            </div>
            <div className="grow">
              <div className="name">{m.hg_nm}</div>
              <div className="sub">
                {m.poly_nm ?? "무소속"} · {m.orig_nm ?? m.elect_gbn_nm}
              </div>
              {act ? (
                <div className="recent">
                  <span className="recent-tag">최근 발의</span>
                  {act.latest.bill_name}
                  <span className="recent-more"> · 총 {act.count}건</span>
                </div>
              ) : (
                <div className="recent muted-recent">대표발의 기록 없음</div>
              )}
            </div>
            <span className="chevron">›</span>
          </a>
        );
      })}

      {/* 이슈 카드 갤러리 — 이슈별 최근 법안 자동 큐레이션 (읽기 전용) */}
      <h2 className="gallery-h2">이슈별 최근 법안</h2>
      <p className="hint" style={{ marginTop: -4 }}>
        청년 주거·고용·연금 이슈에 최근 올라온 법안이에요. 제목을 누르면 국회 원문으로 이어져요.
      </p>
      <div className="issue-cards">
        {gallery.map((g) => (
          <div key={g.slug} className="issue-card">
            <div className="issue-card-head">
              <span className="issue-card-title">#{g.label}</span>
              <span className="issue-card-count">총 {g.count}건</span>
            </div>
            {g.bills.length === 0 && <div className="issue-empty">최근 법안 없음</div>}
            {g.bills.map((b) => (
              <a
                key={b.bill_id}
                href={billUrl(b.bill_id)}
                target="_blank"
                rel="noopener noreferrer"
                className="issue-bill"
              >
                <div className="issue-bill-name">{b.bill_name}</div>
                <div className="issue-bill-meta">
                  {b.rst_proposer ? `${b.rst_proposer} · ` : ""}
                  {b.propose_dt}
                </div>
              </a>
            ))}
          </div>
        ))}
      </div>

      <p className="principle">
        점수·순위 없이, 국회가 공개한 자료의 원문을 그대로 보여드립니다.
        (출처: 열린국회정보 · 국회 의안정보시스템)
      </p>
    </main>
  );
}
