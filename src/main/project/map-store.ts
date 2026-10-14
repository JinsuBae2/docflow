import type { MapPosition, MapView, ProjectMap } from '../../shared/project-map';
import { buildProjectMap } from '../../shared/project-map';
import type { ProjectStore } from './store';
export class ProjectMapStore {
  constructor(private store: ProjectStore) {}
  read(): ProjectMap {
    return buildProjectMap(this.store.workspace());
  }
  private check(projectId: string) {
    const map = this.read();
    if (map.projectId !== projectId) throw new Error('프로젝트가 변경되었습니다.');
    return map;
  }
  saveLayout(projectId: string, positions: MapPosition[]) {
    const map = this.check(projectId);
    const ids = new Set(map.nodes.map((n) => n.id));
    if (
      new Set(positions.map((p) => p.nodeId)).size !== positions.length ||
      positions.some(
        (p) =>
          !ids.has(p.nodeId) ||
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          Math.abs(p.x) > 1_000_000 ||
          Math.abs(p.y) > 1_000_000,
      )
    )
      throw new Error('지도 좌표 또는 노드가 올바르지 않습니다.');
    const merged = new Map(map.positions.map((p) => [p.nodeId, p]));
    for (const p of positions) merged.set(p.nodeId, p);
    this.store.put('map-view', {
      id: projectId,
      version: (map.version || 0) + 1,
      positions: [...merged.values()],
      collapsedDocumentIds: map.collapsedDocumentIds,
      legendCollapsed: map.legendCollapsed,
    });
    return this.read();
  }
  saveView(projectId: string, view: Pick<MapView, 'collapsedDocumentIds' | 'legendCollapsed'>) {
    const map = this.check(projectId);
    if (
      view.collapsedDocumentIds.some(
        (id) => !map.nodes.some((n) => n.kind === 'document' && n.id === id),
      )
    )
      throw new Error('접을 문서를 찾을 수 없습니다.');
    this.store.put('map-view', {
      id: projectId,
      version: (map.version || 0) + 1,
      positions: map.positions,
      ...view,
      collapsedDocumentIds: [...new Set(view.collapsedDocumentIds)],
    });
    return this.read();
  }
}
