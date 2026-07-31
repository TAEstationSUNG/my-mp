// 정당별 색상 + 아바타 헬퍼 (컬러풀·친근 디자인용)

// 흰 글씨가 잘 읽히는 진한 정당 색 (라이트/다크 공통)
const PARTY_COLORS = {
  더불어민주당: "#1e5bd6",
  국민의힘: "#d63c2f",
  조국혁신당: "#2b3a8f",
  개혁신당: "#e8730f",
  진보당: "#d6186a",
  기본소득당: "#16a394",
  사회민주당: "#c98a00",
  무소속: "#6b7280",
};

const FALLBACK = ["#6d5ae6", "#0ea5a4", "#e8730f", "#d6186a", "#2b8a3e", "#1e5bd6"];

export function partyColor(name) {
  if (!name) return PARTY_COLORS["무소속"];
  if (PARTY_COLORS[name]) return PARTY_COLORS[name];
  // 등록 안 된 정당은 이름 기반으로 색 하나 배정 (항상 같은 색)
  let sum = 0;
  for (const ch of name) sum += ch.charCodeAt(0);
  return FALLBACK[sum % FALLBACK.length];
}

// 이름 첫 글자(성) — 아바타용
export function initial(name) {
  return name ? name.trim().charAt(0) : "?";
}
