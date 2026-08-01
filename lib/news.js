// 지역 뉴스 (Google 뉴스 RSS · 키 불필요 · 최신순). 홈/의원프로필/동네 페이지 공용.

// 지역구(orig_nm)에서 지역명 추출: "서울 강북구갑" → "강북구", "경기 파주시을" → "파주시"
export function regionFromOrig(origNm) {
  if (!origNm || origNm.includes("비례")) return null;
  const tokens = origNm.trim().split(/\s+/);
  const q = tokens[tokens.length - 1].replace(/[갑을병정]$/, "");
  return q || null;
}

const stripTags = (s) =>
  (s || "").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").trim();

// 지역 뉴스 이슈 필터
export const NEWS_TOPICS = [
  { q: "", label: "전체" },
  { q: "교통", label: "교통" },
  { q: "개발", label: "개발" },
  { q: "문화", label: "문화" },
  { q: "복지", label: "복지" },
  { q: "환경", label: "환경" },
  { q: "안전", label: "안전" },
];

// region: 지역명(예: "강북구"), topic: 이슈 키워드(선택)
export async function getRegionNews(region, topic = "") {
  if (!region) return { region: null, topic, items: [] };
  const q = topic ? `${region} ${topic}` : region;
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 1800 }, // 30분 캐시
    });
    if (!res.ok) return { region, topic, items: [] };
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map((m) => {
      const block = m[1];
      const rawTitle = stripTags((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
      const source = stripTags((block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1]);
      const link = ((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "").trim();
      const pub = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || "";
      let title = rawTitle;
      if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
      const date = pub ? new Date(pub).toLocaleDateString("ko-KR") : "";
      return { title, source, link, date };
    });
    return { region, topic, items };
  } catch {
    return { region, topic, items: [] };
  }
}
