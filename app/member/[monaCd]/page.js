import { supabase } from "../../../lib/supabase";
import { partyColor, initial } from "../../../lib/ui";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

// 국회 의안정보시스템 원문(제안이유·주요내용·표결기록) 링크
const billUrl = (id) => `https://likms.assembly.go.kr/bill/billDetail.do?billId=${id}`;

async function getData(monaCd) {
  const { data: member } = await supabase
    .from("members")
    .select("*")
    .eq("mona_cd", monaCd)
    .maybeSingle();
  if (!member) return null;

  const { data: bills, count: billCount } = await supabase
    .from("bills")
    .select("bill_id, bill_name, propose_dt, proc_result", { count: "exact" })
    .eq("rst_mona_cd", monaCd)
    .order("propose_dt", { ascending: false })
    .limit(10);

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

  return { member, bills: bills ?? [], billCount: billCount ?? 0, part, votes: votes ?? [] };
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

export default async function MemberPage({ params }) {
  const { monaCd } = await params;
  const data = await getData(monaCd);
  if (!data) notFound();
  const { member: m, bills, billCount, part, votes } = data;

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

      {/* 대표발의 법안 */}
      <h2>대표발의 법안 {billCount > 10 ? `(최근 10건 / 총 ${billCount}건)` : ""}</h2>
      <p className="caption">
        (*<b>대표발의</b>란, 그 법안을 대표로 제안한 의원이에요.)
        ‘원문 보기’를 누르면 국회 원문에서 제안 이유·주요 내용을 볼 수 있어요.
        쉬운 말 요약(AI)은 곧 추가될 예정이에요.
      </p>
      <div className="card">
        {bills.length === 0 && <p className="empty">대표발의한 법안이 없습니다.</p>}
        {bills.map((b) => (
          <div key={b.bill_id} className="bill-item">
            <div>{b.bill_name}</div>
            <div className="meta">
              {b.propose_dt} {b.proc_result ? `· ${b.proc_result}` : "· 처리 진행중"}
            </div>
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
