import { supabase } from "../../lib/supabase";
import { partyColor, initial } from "../../lib/ui";
import { getRegionNews, NEWS_TOPICS } from "../../lib/news";

export const dynamic = "force-dynamic";

async function findMembers(region) {
  if (!region) return [];
  const { data } = await supabase
    .from("members")
    .select("mona_cd, hg_nm, poly_nm, orig_nm, elect_gbn_nm")
    .ilike("orig_nm", `%${region}%`)
    .order("hg_nm", { ascending: true });
  return data ?? [];
}

export default async function Town({ searchParams }) {
  const { q = "", news: newsTopic = "" } = (await searchParams) ?? {};
  const region = q.trim();
  const [members, news] = await Promise.all([
    findMembers(region),
    getRegionNews(region, newsTopic),
  ]);

  const newsHref = (topic) => {
    const p = new URLSearchParams();
    if (region) p.set("q", region);
    if (topic) p.set("news", topic);
    const s = p.toString();
    return `/town${s ? `?${s}` : ""}`;
  };

  return (
    <main className="container">
      <a href="/" className="back">‹ 홈</a>
      <h1>우리 동네 소식</h1>
      <p className="lead">
        우리 동네에서 무슨 일이 벌어지는지, 그리고 우리 지역구 의원이 누군지 함께 봐요.
      </p>

      <form className="search" action="/town" method="get">
        <input
          type="text"
          name="q"
          defaultValue={region}
          placeholder="우리 동네 입력 (예: 강북구, 파주)"
          autoFocus
        />
        <button type="submit">보기</button>
      </form>

      {region === "" && (
        <p className="hint">동네(시/구) 이름을 넣으면 지역 소식과 우리 의원을 보여드려요.</p>
      )}

      {region !== "" && (
        <>
          {/* 이 지역 국회의원 → 알아보기 */}
          <h2>이 지역 국회의원</h2>
          {members.length === 0 && (
            <p className="empty">‘{region}’ 지역구 의원을 못 찾았어요. 다른 이름으로 해보세요.</p>
          )}
          {members.map((m) => (
            <a key={m.mona_cd} href={`/member/${m.mona_cd}`} className="member-row">
              <div className="avatar" style={{ background: partyColor(m.poly_nm) }}>
                {initial(m.hg_nm)}
              </div>
              <div className="grow">
                <div className="name">{m.hg_nm}</div>
                <div className="sub">
                  {m.poly_nm ?? "무소속"} · {m.orig_nm ?? m.elect_gbn_nm}
                </div>
              </div>
              <span className="town-cta">알아보기 →</span>
            </a>
          ))}

          {/* 동네 뉴스 + 이슈 필터 */}
          <h2>{region} 최근 소식</h2>
          <p className="caption">Google 뉴스 · 최신순. 제목을 누르면 원문 기사로 이어져요.</p>
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
                {newsTopic ? `‘${region} ${newsTopic}’ 뉴스가 없어요.` : "뉴스를 불러오지 못했어요."}
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
    </main>
  );
}
