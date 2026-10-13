import { useEffect, useState } from 'react';
import type { AiModel, Preferences, ProviderStatus } from '../../shared/contracts';
import { Dialog } from './Dialog';

export function ConnectionSetup({ preferences, status, running, onStatus, onSave, onClose }: { preferences: Preferences; status: ProviderStatus; running: boolean; onStatus: (status: ProviderStatus) => void; onSave: (preferences: Preferences) => void; onClose: () => void }) {
  const [models, setModels] = useState<AiModel[]>([]); const [model, setModel] = useState(preferences.model);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const check = async () => {
    setBusy(true); setError('');
    try { onStatus(await window.workspace.providerStatus()); setModels(await window.workspace.listModels()); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  useEffect(() => { void check(); }, []);
  const missing = !!model && !models.some(m => m.model === model);
  return <Dialog title="Codex 연결 설정" onClose={onClose} locked={busy}>
    <p className="dialog-intro">내 컴퓨터의 Codex CLI로 연결합니다. 이미 로그인했다면 연결을 확인하고 모델을 선택하세요.</p>
    <ol className="connection-steps"><li><strong>Codex CLI 설치</strong><code>npm install -g @openai/codex</code></li><li><strong>터미널에서 로그인</strong><code>codex login</code></li><li><strong>이 화면에서 연결 확인</strong><span>CLI의 로그인 계정을 사용합니다. 앱에 API 키를 입력하지 않습니다.</span></li></ol>
    <div className={'connection-status ' + (status.connected ? 'connected' : '')} role="status"><strong>{status.connected ? '연결됨' : '연결 확인 필요'}</strong><span>{status.detail}</span></div>
    <button className="button" disabled={busy || running} onClick={() => void check()}>연결 다시 확인</button>
    <label className="model-field">AI 모델<select value={model} disabled={busy || running} onChange={e => setModel(e.target.value)}><option value="">Codex 기본 모델</option>{missing && <option value={model}>{model} (목록 확인 필요)</option>}{models.map(m => <option key={m.model} value={m.model}>{m.displayName}{m.isDefault ? ' · 기본' : ''}</option>)}</select></label>
    <p className="dialog-hint">모델 목록은 설치된 Codex CLI에서 조회합니다. AI 요청을 보낼 때만 선택 문서·관련 맥락·확정된 결정·수락 및 거절 이력이 연결된 계정으로 전송됩니다. 전송 전 ‘맥락 확인’에서 내용을 확인하거나 제외할 수 있습니다.</p>
    {error && <p role="alert" className="inline-warning">{error}</p>}
    <div className="modal-footer"><button className="button primary" disabled={busy || running || missing} onClick={async () => {
      setBusy(true); setError('');
      try { onSave(await window.workspace.savePreferences({ model, onboardingDone: true })); }
      catch (e) { setError((e as Error).message); }
      finally { setBusy(false); }
    }}>설정 저장</button></div>
  </Dialog>;
}
