import { existsSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';

interface SecureStorage {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?(): string;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}
export class CredentialStore {
  constructor(
    private file: string,
    private crypto: SecureStorage,
  ) {}
  private available() {
    return (
      this.crypto.isEncryptionAvailable() &&
      this.crypto.getSelectedStorageBackend?.() !== 'basic_text'
    );
  }
  get(): string {
    if (!existsSync(this.file)) return '';
    if (!this.available()) throw new Error('OS 보안 저장소를 사용할 수 없습니다.');
    try {
      return this.crypto.decryptString(readFileSync(this.file));
    } catch {
      throw new Error('저장된 Claude 키를 읽을 수 없습니다. 연결 설정에서 다시 저장해 주세요.');
    }
  }
  set(key: string) {
    if (!key) {
      rmSync(this.file, { force: true });
      return;
    }
    if (!this.available())
      throw new Error('OS 보안 저장소를 사용할 수 없어 키를 저장하지 않았습니다.');
    const temporary = this.file + '.tmp';
    try {
      writeFileSync(temporary, this.crypto.encryptString(key), { mode: 0o600 });
      renameSync(temporary, this.file);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
}
