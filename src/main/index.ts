import { app, BrowserWindow, session, dialog } from 'electron';
import { join } from 'node:path';
import { registerWorkspace } from './ipc';
async function createWindow() {
  const window = new BrowserWindow({ title: 'Docflow', width: 1440, height: 940, minWidth: 800, minHeight: 600, backgroundColor: '#f5f6f8', titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default', autoHideMenuBar: true, webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  const cleanup = registerWorkspace(window);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-prevent-unload', event => { if (dialog.showMessageBoxSync(window, { type: 'question', buttons: ['계속 편집', '변경 버리기'], defaultId: 0, cancelId: 0, message: '저장하지 않은 변경이 있습니다.' }) === 1) event.preventDefault(); });
  window.on('closed', () => { void cleanup(); });
  if (process.env.ELECTRON_RENDERER_URL) await window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else await window.loadFile(join(__dirname, '../renderer/index.html'));
}
app.whenReady().then(() => { session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false)); return createWindow(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) void createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
