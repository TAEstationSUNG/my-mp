import "./globals.css";

export const metadata = {
  title: "내 의원 뭐하나",
  description: "내 지역구 국회의원이 요즘 뭐 하는지 — 판단·점수 없이 사실만.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <header className="site-header">
          <div className="inner">
            <a href="/" className="logo">🗳️ 내 의원 뭐하나</a>
            <span className="tag">사실만 · 판단은 당신 몫</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
