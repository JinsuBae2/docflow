import { useEffect, useState } from 'react';
import type { AiModel, AiProviderId, Preferences, ProviderStatus } from '../../shared/contracts';
import { Dialog } from './Dialog';

export function ConnectionSetup({
  preferences,
  status,
  running,
  onStatus,
  onSave,
  onClose,
}: {
  preferences: Preferences;
  status: ProviderStatus;
  running: boolean;
  onStatus: (status: ProviderStatus) => void;
  onSave: (preferences: Preferences) => void;
  onClose: () => void;
}) {
  const [provider, setProvider] = useState<AiProviderId>(preferences.provider);
  const [models, setModels] = useState<AiModel[]>([]);
  const [model, setModel] = useState(preferences.model);
  const [draftModels, setDraftModels] = useState(preferences.models);
  const [connection, setConnection] = useState(status);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const claude = provider === 'claude';
  const check = async () => {
    setBusy(true);
    setError('');
    setModels([]);
    try {
      const next = await window.workspace.providerStatus(provider);
      setConnection(next);
      if (next.connected) setModels(await window.workspace.listModels(provider));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void check();
  }, [provider]);
  const missing = !!model && !models.some((m) => m.model === model);
  return (
    <Dialog title={claude ? 'Claude 연결 설정' : 'Codex 연결 설정'} onClose={onClose} locked={busy}>
      <label className="model-field provider-field">
        AI 제공자
        <select
          value={provider}
          disabled={busy || running}
          onChange={(e) => {
            const next = e.target.value as AiProviderId;
            setDraftModels((current) => ({ ...current, [provider]: model }));
            setModel(draftModels[next]);
            setKey('');
            setError('');
            setProvider(next);
          }}
        >
          <option value="codex">Codex · 로컬 CLI</option>
          <option value="claude">Claude · Anthropic API</option>
        </select>
      </label>
      {claude ? (
        <>
          <p className="dialog-intro">
            Anthropic Console에서 발급한 API 키로 연결합니다. API 사용 요금과 한도가 적용되며 Claude
            구독 로그인은 지원하지 않습니다.
          </p>
          <label className="model-field">
            Claude API 키
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              placeholder="새 키 입력 · 저장된 키는 표시하지 않음"
              disabled={busy || running}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <div className="connection-key-actions">
            <button
              className="button"
              disabled={!key.trim() || busy || running}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await window.workspace.saveClaudeKey(key.trim());
                  setKey('');
                  await check();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              키 저장 및 연결 확인
            </button>
            <button
              className="button"
              disabled={busy || running}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await window.workspace.saveClaudeKey('');
                  setKey('');
                  await check();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              저장된 키 삭제
            </button>
          </div>
          <p className="dialog-hint">
            키는 OS 보안 저장소로 암호화해 보관합니다. 실행 환경의 ANTHROPIC_API_KEY도 사용할 수
            있으며, 앱에서 키를 삭제해도 환경 변수는 유지됩니다. 연결 확인은 모델 목록만 조회합니다.
          </p>
        </>
      ) : (
        <>
          <p className="dialog-intro">
            내 컴퓨터의 Codex CLI로 연결합니다. 이미 로그인했다면 연결을 확인하고 모델을 선택하세요.
          </p>
          <ol className="connection-steps">
            <li>
              <strong>Codex CLI 설치</strong>
              <code>npm install -g @openai/codex</code>
            </li>
            <li>
              <strong>터미널에서 로그인</strong>
              <code>codex login</code>
            </li>
            <li>
              <strong>이 화면에서 연결 확인</strong>
              <span>CLI의 로그인 계정을 사용합니다. 앱에 API 키를 입력하지 않습니다.</span>
            </li>
          </ol>
        </>
      )}
      <div
        className={'connection-status ' + (connection.connected ? 'connected' : '')}
        role="status"
      >
        <strong>{connection.connected ? '연결됨' : '연결 확인 필요'}</strong>
        <span>{connection.detail}</span>
      </div>
      <button className="button" disabled={busy || running} onClick={() => void check()}>
        연결 다시 확인
      </button>
      <label className="model-field">
        AI 모델
        <select value={model} disabled={busy || running} onChange={(e) => setModel(e.target.value)}>
          <option value="">{claude ? 'Claude 모델을 선택하세요' : 'Codex 기본 모델'}</option>
          {missing && <option value={model}>{model} (목록 확인 필요)</option>}
          {models.map((m) => (
            <option key={m.model} value={m.model}>
              {m.displayName}
              {m.isDefault ? ' · 기본' : ''}
            </option>
          ))}
        </select>
      </label>
      <p className="dialog-hint">
        모델 목록은 연결된 제공자에서 조회합니다. AI 요청 시 선택 문서·관련 맥락·확정된 결정·수락 및
        거절 이력이 외부 서비스로 전송됩니다. 전송 전 ‘맥락 확인’에서 내용을 확인하거나 제외할 수
        있습니다.
      </p>
      {error && (
        <p role="alert" className="inline-warning">
          {error}
        </p>
      )}
      <div className="modal-footer">
        <button
          className="button primary"
          disabled={busy || running || missing || (claude && (!model || !connection.connected))}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              onSave(
                await window.workspace.savePreferences({ provider, model, onboardingDone: true }),
              );
              onStatus(connection);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          설정 저장
        </button>
      </div>
    </Dialog>
  );
}
