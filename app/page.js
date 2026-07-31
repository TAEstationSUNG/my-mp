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

export default async function Home({ searchParams }) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const members = await searchMembers(query);
  const activity = await recentActivity(members.map((m) => m.mona_cd));

  return (
    <main className="container">
      <h1>내 지역구 의원,<br />요즘 뭐 하고 있을까?</h1>
      <p className="lead">
        우리 구 국회의원이 무슨 법안을 내고 어떻게 투표했는지 —
        판단·점수 없이 사실만 보여드려요.
      </p>

      <form className="search" action="/" method="get">
        <input
          type="text"
          name="q"
          defaultValue={query}
          placeholder="우리 동네 입력 (예: 파주, 종로, 강남)"
          autoFocus
        />
        <button type="submit">보기</button>
      </form>

      {query === "" && (
        <p className="hint">
          시/구 이름을 넣으면 그 지역 의원이 요즘 뭘 하는지 바로 보여드려요. (비례대표는 “비례”)
        </p>
      )}

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

      <p className="principle">
        이 서비스는 점수·순위를 매기지 않습니다. 열린국회정보 등 공개된 사실만 그대로 보여주며,
        평가와 판단은 이용자의 몫입니다.
      </p>
    </main>
  );
}
