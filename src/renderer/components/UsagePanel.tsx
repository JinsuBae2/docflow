import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { AiProviderId, UsageLimits, UsageReason, UsageSummary } from '../../shared/contracts';
import { Dialog } from './Dialog';

const count = (value: number | null) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ko-KR') : '미보고';
const time = (value: string | null) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('ko-KR') : '제공자가 시각을 반환하지 않음';
const providerName = (provider: AiProviderId | null) => provider === 'claude' ? 'Claude API' : provider === 'codex' ? 'Codex' : '과거 기록';
const reasonText = (reason: UsageReason, provider: AiProviderId | null): string => ({
  no_history: '과거 요청에는 사용량 기록이 없습니다. 0으로 계산하지 않습니다.',
  unsupported: provider === 'claude' ? '일반 API 키로 계정 잔액이나 실시간 한도를 조회할 수 없습니다. 요청 후 반환된 단기 한도만 표시합니다.' : '설치된 CLI가 한도 조회를 지원하지 않습니다.',
  auth_mode: '현재 로그인 방식은 Codex 계정 한도 조회를 지원하지 않습니다.',
  auth_required: provider === 'claude' ? 'Claude API 키를 연결하거나 인증 상태를 확인해 주세요.' : 'Codex 로그인이 필요합니다. 연결 설정에서 확인해 주세요.',
  network: '연결 실패로 현재 한도를 조회하지 못했습니다. 잠시 후 새로고침해 주세요.',
  missing_response: '제공자가 사용량 또는 한도 정보를 반환하지 않았습니다.',
  invalid_response: '제공자가 올바르지 않은 값을 반환해 해당 항목을 표시하지 않았습니다.'
})[reason];
function duration(minutes: number | null) { if (!minutes) return '기간 미제공'; if (minutes % 1440 === 0) return `${minutes / 1440}일`; if (minutes % 60 === 0) return `${minutes / 60}시간`; return `${minutes}분`; }

export function UsagePanel({ provider: initialProvider, projectRoot, onClose }: { provider: AiProviderId; projectRoot: string; onClose: () => void }) {
  const [provider, setProvider] = useState(initialProvider); const [summary, setSummary] = useState<UsageSummary | null>(null); const [limits, setLimits] = useState<UsageLimits | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const sequence = useRef(0);
  const refresh = async () => {
    const current = ++sequence.current; setBusy(true); setError('');
    const [records, quotas] = await Promise.allSettled([window.workspace.usageSummary(), window.workspace.usageLimits(provider)]);
    if (current !== sequence.current) return;
    if (records.status === 'fulfilled') setSummary(records.value); else setError('프로젝트 사용량 기록을 읽지 못했습니다. 프로젝트 연결을 확인해 주세요.');
    if (quotas.status === 'fulfilled') setLimits(quotas.value);
    else setLimits(old => old && old.provider === provider ? { ...old, reason: 'network' } : { provider, checkedAt: null, source: provider === 'claude' ? 'response' : 'account', windows: [], reason: 'network' });
    setBusy(false);
  };
  useEffect(() => { setLimits(null); void refresh(); return () => { sequence.current++; }; }, [provider, projectRoot]);
  useEffect(() => window.workspace.onRequestEvent(({ event }) => {
    if (event.type === 'progress') return;
    void window.workspace.usageSummary().then(setSummary).catch(() => setError('사용량 갱신에 실패했습니다. 새로고침해 주세요.'));
  }), [projectRoot]);
  const statuses = { running: '진행 중', completed: '완료', error: '실패', cancelled: '취소', unknown: '과거 기록' };
  return <Dialog title="AI 사용량" closeLabel="사용량 닫기" onClose={onClose}><div className="usage-panel">
    <div className="usage-toolbar"><p>요청에 기록된 토큰과 계정 한도를 구분해 확인합니다.</p><button className="button compact" aria-label="사용량 새로고침" data-tooltip="사용량 기록과 조회 가능한 계정 한도를 다시 읽습니다. AI 생성 요청이나 결제는 실행하지 않습니다." disabled={busy} onClick={() => void refresh()}><RefreshCw size={14} />새로고침</button></div>
    {error && <p role="alert" className="inline-warning">{error}</p>}
    <section aria-label="프로젝트 누적 사용량" className="usage-section"><h3>이번 프로젝트에 기록된 토큰</h3><div className="usage-totals">{summary?.totals.map(total => <div key={total.provider}><span>{providerName(total.provider)}</span><strong>{total.knownRequests ? count(total.totalTokens) : '확인 불가'}</strong><small>{total.knownRequests ? `기록된 요청 ${total.knownRequests}개 · 미보고 ${total.unknownRequests}개` : '아직 보고된 사용량이 없습니다.'}</small></div>)}</div><p className="usage-note">다른 앱의 요청은 포함하지 않습니다. 캐시 토큰은 입력에 포함되므로 합계에 다시 더하지 않습니다. 과거 미기록 요청은 추정하지 않습니다.</p></section>
    <section aria-label="제공자 계정 한도" className="usage-section"><div className="usage-section-heading"><h3>제공자 계정 한도</h3><label>한도 제공자<select aria-label="한도 제공자" value={provider} onChange={e => setProvider(e.target.value as AiProviderId)}><option value="codex">Codex</option><option value="claude">Claude API</option></select></label></div>
      {provider === 'claude' && <p className="usage-note">최근 API 응답 기준의 단기 요청·토큰 한도입니다. Claude 구독 잔량이나 결제 잔액과 별개입니다.</p>}
      {busy && <p role="status">한도를 확인하고 있습니다.</p>}
      {limits?.reason && <p className="usage-unavailable" role="status"><strong>{limits.windows.length ? '현재 조회 제한' : '확인 불가'}</strong> · {reasonText(limits.reason, provider)}</p>}
      {limits?.windows.map(window => <div key={window.id} className="usage-window"><div><strong>{provider === 'codex' && window.label === 'codex' ? 'Codex' : window.label}{window.unit === 'percent' && ` · ${duration(window.windowMinutes)}`}</strong><small>초기화: {time(window.resetsAt)}</small></div><div className="usage-window-value">{window.unit === 'percent' ? <><strong>{window.remainingPercent === null ? '확인 불가' : `${Number(window.remainingPercent.toFixed(1))}%`}</strong><span>남음</span>{window.remainingPercent !== null && <meter aria-label={window.label + ' 남은 비율'} min={0} max={100} value={window.remainingPercent} />}</> : <><strong>{count(window.remaining)}</strong><span>/ {count(window.limit)} {window.unit === 'tokens' ? '토큰' : '요청'} 남음</span></>}</div>{window.reason && <p className="usage-note">{reasonText(window.reason, provider)}</p>}</div>)}
      {limits?.checkedAt && <p className="usage-note">마지막 확인: {time(limits.checkedAt)}{limits.source === 'response' ? ' · 최근 API 응답 기준, 새 요청 전에는 갱신되지 않습니다.' : limits.reason ? ' · 현재 값이 아닌 마지막 조회값입니다.' : ''}</p>}
    </section>
    <section className="usage-section"><h3>요청별 사용량</h3><div className="usage-table-wrap"><table aria-label="요청별 사용량"><thead><tr><th>요청 · 제공자 / 모델</th><th>입력</th><th>출력</th><th>캐시 읽기</th><th>캐시 쓰기</th><th>합계</th></tr></thead><tbody>{summary?.requests.map(request => <tr key={request.id}><td><strong>{providerName(request.provider)}{request.provider && ` · ${statuses[request.status]}`}</strong><small>{request.model || '모델 기록 없음'} · {time(request.createdAt)}</small>{(request.usage.reason || Object.values(request.usage).some(value => value === null)) && <span className="usage-row-reason">확인 불가 사유: {reasonText(request.usage.reason || 'missing_response', request.provider)}</span>}</td><td>{count(request.usage.inputTokens)}</td><td>{count(request.usage.outputTokens)}</td><td>{count(request.usage.cachedInputTokens)}</td><td>{count(request.usage.cacheWriteInputTokens)}</td><td>{count(request.usage.totalTokens)}</td></tr>)}</tbody></table></div>{summary && !summary.requests.length && <p className="usage-note">아직 이 프로젝트의 AI 요청 기록이 없습니다.</p>}</section>
  </div></Dialog>;
}
