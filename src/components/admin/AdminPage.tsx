import React, { useEffect, useRef, useState } from "react";
import { Activity, ArrowLeft, CreditCard, FileClock, Flag, LogOut, RefreshCw, Settings2, ShieldCheck, Users } from "lucide-react";
import { getAuthStatus, signOut } from "../../services/authClient";
import { LEARNHUB_AUTH_CHANGED_EVENT } from "../../services/firebaseClient";
import { adminRequest, AdminRequestError } from "../../services/adminClient";
import { AuthModal } from "../notion/AuthModal";
import { LearnHubLogo } from "../common/LearnHubLogo";
import type { AdminAudit, AdminOverview, AdminReport, AdminUser, OperationsSettings } from "../../types/admin";
import type { AiModelDefinition } from "../../domain/aiModels";
import "./admin.css";

const tabs = [
  { id: "overview", label: "운영 현황", icon: Activity }, { id: "settings", label: "AI 운영", icon: Settings2 },
  { id: "users", label: "사용자", icon: Users }, { id: "reports", label: "신고", icon: Flag },
  { id: "billing", label: "결제·환불", icon: CreditCard }, { id: "audit", label: "변경 이력", icon: FileClock },
] as const;
type Tab = typeof tabs[number]["id"];
const initialTab = (): Tab => {
  const value = new URLSearchParams(window.location.search).get("tab");
  return tabs.find(tab => tab.id === value)?.id || "overview";
};
const number = (value: number) => value.toLocaleString("ko-KR");
const date = (value: string | null) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString("ko-KR") : "—";
const message = (error: unknown) => error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
const category: Record<string, string> = { wrong_answer: "틀린 정답", inaccurate: "부정확한 설명", unclear: "이해하기 어려움", rendering: "표시 오류", other: "기타" };
const reportStatus = { received: "접수", reviewing: "검토 중", resolved: "처리 완료" };

export default function AdminPage() {
  const [auth, setAuth] = useState(getAuthStatus);
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");
  const [accessError, setAccessError] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [reload, setReload] = useState(0);
  const [accessRetry, setAccessRetry] = useState(0);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [settings, setSettings] = useState<OperationsSettings | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    document.title = "LearnHub · 관리자";
    const onAuth = () => { generation.current++; setData(null); setSettings(null); setAccess("checking"); setAuth(getAuthStatus()); setReload(value => value + 1); };
    window.addEventListener(LEARNHUB_AUTH_CHANGED_EVENT, onAuth);
    return () => window.removeEventListener(LEARNHUB_AUTH_CHANGED_EVENT, onAuth);
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!auth.signedIn) { setAccess("denied"); setAccessError(""); return; }
    setAccess("checking");
    adminRequest("session").then(() => { if (!cancelled) { setAccess("allowed"); setAccessError(""); } })
      .catch(error => { if (!cancelled) { setAccess("denied"); setAccessError(message(error)); } });
    return () => { cancelled = true; };
  }, [auth, accessRetry]);

  useEffect(() => {
    if (access !== "allowed") return;
    const ticket = ++generation.current;
    setLoading(true); setError(""); setData(null); setSettings(null);
    const suffix = tab === "users" ? `?search=${encodeURIComponent(query)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}` :
      tab === "reports" && cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    adminRequest<any>(`${tab}${suffix}`).then(result => {
      if (ticket !== generation.current) return;
      setData(result);
      if (tab === "settings") setSettings(result.settings);
    }).catch(error => {
      if (ticket !== generation.current) return;
      setError(message(error));
      if (error instanceof AdminRequestError && [401, 403].includes(error.status)) { setAccess("denied"); setAccessError(message(error)); }
    }).finally(() => { if (ticket === generation.current) setLoading(false); });
    return () => { generation.current++; };
  }, [access, tab, query, cursor, reload]);

  const navigate = (value: Tab) => {
    generation.current++; setData(null); setSettings(null); setTab(value); setCursor(null); setQuery(""); setSearch(""); setError(""); setNotice("");
    window.history.replaceState(null, "", `/admin?tab=${value}`);
  };
  const mutate = async (action: () => Promise<unknown>, success: string) => {
    if (busy) return;
    const uid = auth.userId;
    setBusy(true); setError(""); setNotice("");
    try {
      await action();
      if (getAuthStatus().userId !== uid) return;
      setNotice(success); setReload(value => value + 1);
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  };
  const logout = async () => { try { await signOut(); } catch (error) { setAccessError(message(error)); } };

  if (access !== "allowed") return <div className="lh-admin admin-gate"><section className="admin-gate-card">
    <LearnHubLogo className="h-9 w-9" /><h1>LearnHub 관리자</h1>
    <p>{access === "checking" ? "관리자 권한 확인 중…" : accessError || "운영자 계정으로 로그인해 주세요."}</p>
    {access !== "checking" && <div className="admin-actions">
      {auth.signedIn ? <><button onClick={logout}>다른 계정으로 로그인</button><button onClick={() => setAccessRetry(value => value + 1)}>다시 확인</button></> :
        <button className="primary" onClick={() => setLoginOpen(true)}>로그인</button>}
      <a href="/">LearnHub로 돌아가기</a>
    </div>}
    <AuthModal isOpen={loginOpen} onClose={() => setLoginOpen(false)} />
  </section></div>;

  return <div className="lh-admin admin-shell">
    <aside className="admin-sidebar"><a className="admin-brand" href="/admin"><LearnHubLogo className="h-8 w-8" /><span>LearnHub<small>운영 콘솔</small></span></a>
      <nav aria-label="관리자 메뉴">{tabs.map(item => <button key={item.id} disabled={busy} aria-current={tab === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><item.icon size={18} />{item.label}</button>)}</nav>
      <div className="admin-sidebar-footer"><a href="/"><ArrowLeft size={16} />학습 화면</a><button onClick={logout}><LogOut size={16} />로그아웃</button></div>
    </aside>
    <main className="admin-main"><header className="admin-header"><div><div className="admin-eyebrow"><ShieldCheck size={14} />관리자</div><h1>{tabs.find(item => item.id === tab)?.label}</h1></div>
      <button disabled={busy || loading} onClick={() => { setNotice(""); setReload(value => value + 1); }}><RefreshCw size={16} />새로고침</button></header>
      {error && <div className="admin-alert error" role="alert">{error}</div>}
      {notice && <div className="admin-alert success" role="status">{notice}</div>}
      {loading && <p role="status" className="admin-empty">불러오는 중…</p>}

      {tab === "overview" && data && <Overview data={data} />}
      {tab === "settings" && settings && data && <form onSubmit={event => {
        event.preventDefault();
        if (!window.confirm("이 설정을 이후 AI 요청부터 적용할까요?")) return;
        void mutate(() => adminRequest("settings", settings), "운영 설정을 적용했습니다.");
      }}><section className="admin-card"><div className="admin-section-title"><h2>AI 이용</h2><span className={`admin-badge ${settings.aiPaused ? "warning" : ""}`}>{settings.aiPaused ? "생성 중지" : "운영 중"}</span></div>
        <label className="admin-check"><input type="checkbox" checked={settings.aiPaused} disabled={busy} onChange={event => setSettings({ ...settings, aiPaused: event.target.checked })} /><span>AI 생성 일시 중지<small>기존 수업과 학습 기록은 계속 열람할 수 있습니다.</small></span></label>
        <label className="admin-check"><input type="checkbox" checked={settings.limitsEnabled} disabled={busy} onChange={event => setSettings({ ...settings, limitsEnabled: event.target.checked })} /><span>일일 사용량 제한 적용<small>로그인 전 체험의 별도 한도는 항상 적용됩니다.</small></span></label>
      </section><section className="admin-card"><h2>일일 한도 <small>UTC 00:00 / 한국 시간 오전 9시 초기화</small></h2><div className="admin-form-grid">
        {([ ["requestLimit", "사용자당 요청 수"], ["outputTokenLimit", "사용자당 출력 토큰 예약량"], ["globalRequestLimit", "전체 요청 수"], ["globalOutputTokenLimit", "전체 출력 토큰 예약량"] ] as const).map(([key, label]) =>
          <label key={key}>{label}<input type="number" min={1} max={1_000_000_000} step={1} required disabled={busy} value={settings[key]} onChange={event => setSettings({ ...settings, [key]: Number(event.target.value) })} /></label>)}
      </div><p className="admin-caption">요청·출력 예약량 기준입니다. 입력 토큰 등을 포함한 실제 청구액의 상한은 아닙니다.</p></section>
      <section className="admin-card"><h2>허용 모델</h2><div className="admin-models">{(data.models as AiModelDefinition[]).map(model => <label className="admin-check" key={model.id}>
        <input type="checkbox" checked={!settings.disabledModels.includes(model.id)} disabled={busy} onChange={event => setSettings({ ...settings, disabledModels: event.target.checked ? settings.disabledModels.filter(id => id !== model.id) : [...settings.disabledModels, model.id] })} /><span>{model.label}<small>{model.provider}</small></span></label>)}</div></section>
      <div className="admin-save"><span>변경 내용을 저장하면 서버에 적용됩니다.</span><button className="primary" disabled={busy}>{busy ? "저장 중…" : "설정 저장"}</button></div></form>}

      {tab === "users" && <><form className="admin-search" onSubmit={event => { event.preventDefault(); setCursor(null); setQuery(search.trim()); setReload(value => value + 1); }}>
        <label className="sr-only" htmlFor="admin-user-search">이메일 또는 UID 검색</label><input id="admin-user-search" placeholder="정확한 이메일 또는 UID" value={search} onChange={event => setSearch(event.target.value)} /><button disabled={busy}>검색</button>
      </form>{data && <><section className="admin-card table-card"><div className="admin-table-wrap"><table><thead><tr><th>계정</th><th>오늘 AI 사용량</th><th>최근 로그인 / 저장</th><th>AI 이용</th></tr></thead><tbody>{(data.items as AdminUser[]).map(user => <tr key={user.uid}>
        <td><strong>{user.email || user.displayName || "이름 없음"}</strong><small>{user.uid}</small></td><td>{number(user.requestsToday)}회<small>{number(user.reservedTokensToday)} 출력 토큰 예약</small></td>
        <td>{date(user.lastSignInAt)}<small>클라우드 저장: {date(user.snapshotUpdatedAt)}{user.snapshotRevision !== null ? ` · v${user.snapshotRevision}` : ""}</small></td>
        <td><button disabled={busy || user.uid === auth.userId} className={user.aiBlocked ? "" : "danger"} onClick={() => {
          if (window.confirm(`${user.email || user.uid} 계정의 AI 이용을 ${user.aiBlocked ? "허용" : "제한"}할까요?`)) void mutate(() => adminRequest(`users/${encodeURIComponent(user.uid)}`, { aiBlocked: !user.aiBlocked }, "PATCH"), "계정의 AI 이용 설정을 변경했습니다.");
        }}>{user.aiBlocked ? "제한 해제" : "이용 제한"}</button></td></tr>)}</tbody></table></div>{data.items.length === 0 && <p className="admin-empty">검색 결과가 없습니다.</p>}</section>
        <Pagination cursor={cursor} next={data.nextCursor} onChange={setCursor} /></>}</>}

      {tab === "reports" && data && <>{data.items.length ? (data.items as AdminReport[]).map(report => <ReportCard key={`${report.userId}/${report.id}/${report.revision}`} report={report} busy={busy}
        save={(status, note) => mutate(() => adminRequest(`reports/${encodeURIComponent(report.userId)}/${encodeURIComponent(report.id)}`, { status, note, revision: report.revision }, "PATCH"), "신고 처리 내용을 저장했습니다.")} />) : <div className="admin-card admin-empty">접수된 신고가 없습니다.</div>}
        <Pagination cursor={cursor} next={data.nextCursor} onChange={setCursor} /></>}

      {tab === "billing" && data && <><section className="admin-card admin-billing"><span className="admin-badge warning">결제 연동 전</span><h2>결제·환불 관리</h2><p>결제 공급자가 연결되면 주문 내역과 환불 요청을 이곳에서 관리합니다.</p><div className="admin-billing-grid"><div><h3>결제 내역</h3><p>주문 번호 · 사용자 · 상품 · 결제 금액 · 결제 상태</p></div><div><h3>환불 요청</h3><p>원결제 · 요청 사유 · 환불 가능 금액 · 처리 결과</p></div></div><p className="admin-caption">현재 결제·환불 실행 기능은 연결되어 있지 않습니다.</p></section></>}

      {tab === "audit" && data && <section className="admin-card table-card">{data.items.length ? <div className="admin-table-wrap"><table><thead><tr><th>변경 시각</th><th>작업 / 대상</th><th>운영자</th><th>변경 내용</th></tr></thead><tbody>{(data.items as AdminAudit[]).map(item => <tr key={item.id}><td>{date(item.createdAt)}</td><td>{({ "settings.update": "AI 설정 변경", "user.ai-access": "사용자 AI 권한 변경", "report.update": "신고 처리" } as Record<string, string>)[item.action] || item.action}<small>{item.target}</small></td><td><small>{item.actor}</small></td><td><details><summary>변경 전후 보기</summary><pre>{JSON.stringify({ 이전: item.before, 이후: item.after }, null, 2)}</pre></details></td></tr>)}</tbody></table></div> : <p className="admin-empty">관리자 변경 이력이 없습니다.</p>}</section>}
    </main>
  </div>;
}

function Overview({ data }: { data: AdminOverview & { usersTruncated?: boolean } }) {
  const stats = [ ["등록 사용자", `${number(data.totalUsers)}${data.usersTruncated ? "+" : ""}`], ["오늘 승인된 AI 요청", `${number(data.admittedRequests)}회`],
    ["AI 실패 / 완료된 요청", `${number(data.failedRequests)} / ${number(data.completedRequests)}`], ["평균 AI 응답", data.meanDurationMs === null ? "—" : `${(data.meanDurationMs / 1000).toFixed(1)}초`] ];
  return <><p className="admin-caption">{data.day} UTC 기준 · AI 지표는 운영 기능 적용 이후부터 집계됩니다.</p><div className="admin-stats">{stats.map(([label, value]) => <section className="admin-card" key={label}><span>{label}</span><strong>{value}</strong></section>)}</div>
    <section className="admin-card"><h2>AI 사용량</h2><div className="admin-usage"><div><span>출력 토큰 예약량</span><strong>{number(data.reservedOutputTokens)}</strong></div><div><span>공급자가 보고한 전체 토큰</span><strong>{number(data.actualTokens)}</strong></div></div><p className="admin-caption">실제 청구액은 공급자 콘솔에서 확인합니다. 사용량을 반환하지 않은 실패 요청의 토큰은 포함되지 않습니다.</p></section>
    <section className="admin-card table-card"><h2>최근 AI 오류</h2>{data.recentFailures.length ? <div className="admin-table-wrap"><table><thead><tr><th>시각</th><th>기능</th><th>모델</th><th>상태</th></tr></thead><tbody>{data.recentFailures.map(item => <tr key={item.id}><td>{date(item.createdAt)}</td><td>{item.endpoint}</td><td>{item.model}</td><td>{item.status}</td></tr>)}</tbody></table></div> : <p className="admin-empty">기록된 AI 오류가 없습니다.</p>}</section></>;
}
function Pagination({ cursor, next, onChange }: { cursor: string | null; next: string | null; onChange: (value: string | null) => void }) {
  return <div className="admin-pagination">{cursor && <button onClick={() => onChange(null)}>처음으로</button>}{next && <button onClick={() => onChange(next)}>다음 25개</button>}</div>;
}
const ReportCard: React.FC<{ report: AdminReport; busy: boolean; save: (status: AdminReport["status"], note: string) => Promise<void> }> = ({ report, busy, save }) => {
  const [status, setStatus] = useState(report.status);
  const [note, setNote] = useState(report.note);
  return <form className="admin-card" onSubmit={event => { event.preventDefault(); void save(status, note); }}>
    <div className="admin-section-title"><h2>{category[report.category] || report.category}</h2><span className="admin-badge">{reportStatus[report.status]}</span></div>
    <p className="admin-report-body">{report.description}</p><p className="admin-caption">접수 {date(report.createdAt)} · 신고 번호 {report.id}<br />사용자 {report.userId}{report.courseId && ` · 과정 ${report.courseId}`}{report.lessonId && ` · 수업 ${report.lessonId}`}</p>
    <div className="admin-report-form"><label>처리 상태<select value={status} disabled={busy} onChange={event => setStatus(event.target.value as AdminReport["status"])}>{Object.entries(reportStatus).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>운영 메모<textarea rows={2} maxLength={2000} value={note} disabled={busy} onChange={event => setNote(event.target.value)} /></label><button disabled={busy}>저장</button></div>
  </form>;
}
