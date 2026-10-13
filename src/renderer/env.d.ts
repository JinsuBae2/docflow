import type { WorkspaceApi } from '../shared/contracts';
declare global { interface Window { workspace: WorkspaceApi } }
