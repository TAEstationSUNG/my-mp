import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { supabase } from "../../../lib/supabase";
import { partyColor, initial } from "../../../lib/ui";

export const alt = "내 의원 뭐하나 — 의원 활동 요약";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }) {
  const { monaCd } = await params;

  const [{ data: m }, billRes, { data: part }] = await Promise.all([
    supabase.from("members").select("hg_nm, poly_nm, orig_nm, elect_gbn_nm").eq("mona_cd", monaCd).maybeSingle(),
    supabase.from("bills").select("bill_id", { count: "exact", head: true }).eq("rst_mona_cd", monaCd),
    supabase.from("member_vote_participation").select("participation_rate").eq("mona_cd", monaCd).maybeSingle(),
  ]);

  const name = m?.hg_nm ?? "국회의원";
  const party = m?.poly_nm ?? "무소속";
  const region = m?.orig_nm ?? m?.elect_gbn_nm ?? "";
  const billCount = billRes?.count ?? 0;
  const rate = part?.participation_rate != null ? `${part.participation_rate}%` : "—";
  const color = partyColor(party);

  const font = await readFile(join(process.cwd(), "assets", "Pretendard-Bold.ttf"));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          fontFamily: "Pretendard",
          padding: 72,
        }}
      >
        {/* 상단: 아바타 + 이름 + 배지 */}
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <div
            style={{
              width: 150,
              height: 150,
              borderRadius: 150,
              background: color,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 78,
            }}
          >
            {initial(name)}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 72, color: "#1b1b2b" }}>{name}</div>
            <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
              <div style={{ background: color, color: "#fff", fontSize: 28, padding: "8px 22px", borderRadius: 999, display: "flex" }}>
                {party}
              </div>
              {region ? (
                <div style={{ background: "#f1f1f6", color: "#3a3a44", fontSize: 28, padding: "8px 22px", borderRadius: 999, display: "flex" }}>
                  {region}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* 스탯 타일 */}
        <div style={{ display: "flex", gap: 28, marginTop: 60 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#f5f5fb", borderRadius: 28, padding: "36px 32px" }}>
            <div style={{ fontSize: 78, color }}>{`${billCount}건`}</div>
            <div style={{ fontSize: 30, color: "#6b7280", marginTop: 8 }}>대표발의 법안</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#f5f5fb", borderRadius: 28, padding: "36px 32px" }}>
            <div style={{ fontSize: 78, color }}>{rate}</div>
            <div style={{ fontSize: 30, color: "#6b7280", marginTop: 8 }}>본회의 표결 참여율</div>
          </div>
        </div>

        {/* 하단 브랜딩 */}
        <div style={{ display: "flex", marginTop: "auto", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 40, color: "#1b1b2b" }}>내 의원 뭐하나</div>
          <div style={{ fontSize: 28, color: "#8a8a93" }}>내 지역구 의원, 요즘 뭐 하고 있을까?</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Pretendard", data: font, weight: 700, style: "normal" }],
    }
  );
}
