import { randomUUID } from 'node:crypto';
import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import type {
  AiEvent,
  AiProviderId,
  AnalysisBudget,
  AnalysisInput,
  AnalysisSummary,
  ContextSnapshot,
  ContextSource,
  RequestUsage,
  Project,
  Decision,
  Proposal,
  EditorDraft,
  Document,
  Relation,
} from '../../shared/contracts';
import type { ProjectStore } from './store';
import type { AiProvider } from '../ai/provider';
import { documentInstructions } from '../ai/instructions';
import { outputSchema, responseSchema } from '../../shared/proposal-schema';
import { normalizeCodexUsage } from '../ai/usage';
import { revisionOf } from './markdown';
import { ProposalService } from './proposals';
import { readDocumentFile } from './files';

export const estimateTokens = (value: unknown) =>
  Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value), 'utf8');
interface Batch {
  id: string;
  phase: 'documents' | 'links';
  snapshot: ContextSnapshot;
  key: string;
  completed: boolean;
  cached: boolean;
}
interface AnalysisRecord extends AnalysisSummary {
  batches: Batch[];
  revisions: Record<string, string>;
  boundary: string;
}
type Client = Pick<AiProvider, 'run' | 'close'>;

export class AnalysisService {
  constructor(private store: ProjectStore) {}
  get(id: string): AnalysisRecord {
    const record = this.store.get<AnalysisRecord>('analysis', id);
    if (!record) throw new Error('분석 계획을 찾을 수 없습니다.');
    return record;
  }
  summary(record: AnalysisRecord): AnalysisSummary {
    const { batches: _b, revisions: _r, boundary: _g, ...summary } = record;
    return {
      ...summary,
      evidence: record.batches.flatMap((batch) =>
        batch.snapshot.sources.map((s) => ({
          sourceId: s.id,
          documentId: s.documentId,
          sectionId: s.sectionId,
          title: s.title,
          revision: s.revision,
          start: s.range?.start,
          end: s.range?.end,
          phase: batch.phase,
        })),
      ),
    };
  }
  list() {
    return this.store.all<AnalysisRecord>('analysis').map((record) => this.summary(record));
  }
  private metadata() {
    const ws = {
      project: this.store.all<Project>('project')[0],
      decisions: this.store.all<Decision>('decision'),
      proposals: this.store.all<Proposal>('proposal'),
    };
    return {
      project: {
        name: ws.project.name,
        goal: ws.project.goal,
        constraints: ws.project.constraints,
      },
      decisions: ws.decisions,
      proposalHistory: ws.proposals
        .filter((p) => ['accepted', 'rejected'].includes(p.status))
        .map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          reason: p.reason,
          rejectionReason: p.rejectionReason,
        })),
    };
  }
  prepare(
    input: AnalysisInput,
    settings: { provider: AiProviderId; model: string },
  ): AnalysisSummary {
    if (!settings.model) throw new Error('연결 설정에서 분석할 모델을 선택해 주세요.');
    const budget: AnalysisBudget = {
      contextTokens: input.contextTokens ?? 32768,
      outputTokens: input.outputTokens ?? 8192,
      reserveTokens: 8192,
      inputTokens: 0,
    };
    budget.inputTokens = budget.contextTokens - budget.outputTokens - budget.reserveTokens;
    if (
      budget.inputTokens < 4000 ||
      estimateTokens(documentInstructions) + estimateTokens(outputSchema) > budget.reserveTokens
    )
      throw new Error('입력·출력·지침 예산을 확인해 주세요.');
    const ws = this.store.workspace();
    const excluded = new Set(input.excludedIds);
    const selected = new Set(input.selectedIds);
    for (const id of selected)
      if (!ws.documents.some((d) => d.id === id))
        throw new Error('분석할 문서를 다시 선택해 주세요.');
    const documents = ws.documents.filter(
      (d) => (!selected.size || selected.has(d.id)) && !excluded.has(d.id),
    );
    if (!documents.length) throw new Error('분석할 문서가 없습니다.');
    if (ws.drafts?.some((d) => documents.some((doc) => doc.id === d.documentId)))
      throw new Error('분석 대상의 초안을 저장하거나 문서를 제외해 주세요.');
    const metadata = this.metadata();
    const makeSnapshot = (
      sources: ContextSource[],
      relations: ContextSnapshot['relations'] = [],
    ): ContextSnapshot => ({
      id: randomUUID(),
      requestId: randomUUID(),
      instruction: input.instruction,
      ...metadata,
      sources,
      omittedIds: [...excluded],
      relations,
      budget,
    });
    if (estimateTokens(makeSnapshot([])) + 1500 > budget.inputTokens)
      throw new Error(
        '프로젝트 지침·결정·이력이 입력 예산을 넘습니다. 예산을 명시적으로 조정해 주세요.',
      );
    const sources: ContextSource[] = [];
    const warnings = [
      ...ws.documentIssues,
      ...ws.documentLinks
        .filter(
          (l) =>
            documents.some((d) => d.id === l.documentId) &&
            !['resolved', 'external'].includes(l.status),
        )
        .map((l) => `${l.label || l.href}: ${l.reason || l.status}`),
    ];
    for (const doc of documents) {
      const lineOffsets = [0];
      for (let i = 0; i < doc.markdown.length; i++)
        if (doc.markdown[i] === '\n') lineOffsets.push(i + 1);
      const cuts = [
        0,
        ...doc.sections.map((s) => lineOffsets[s.line - 1]).filter((n) => n > 0),
        doc.markdown.length,
      ];
      const split = (start: number, end: number, sectionId?: string) => {
        if (sectionId && excluded.has(sectionId)) return;
        const source: ContextSource = {
          id: start === 0 && end === doc.markdown.length ? doc.id : `${doc.id}:${start}:${end}`,
          documentId: doc.id,
          title: doc.sections.find((s) => s.id === sectionId)?.title || doc.title,
          revision: doc.revision,
          content: doc.markdown.slice(start, end),
          sectionId,
          complete: start === 0 && end === doc.markdown.length,
          range: { start, end },
        };
        // Two sources must fit together for the later link integration pass.
        if (estimateTokens(source) > (budget.inputTokens - estimateTokens(makeSnapshot([]))) / 2) {
          let middle = start + Math.floor((end - start) / 2);
          if (middle <= start) throw new Error('근거 식별자가 입력 예산을 넘습니다.');
          if (/^[\uDC00-\uDFFF]$/.test(doc.markdown[middle])) middle--;
          if (middle <= start) throw new Error('입력 예산을 늘려 주세요.');
          split(start, middle, sectionId);
          split(middle, end, sectionId);
        } else sources.push(source);
      };
      if (
        !doc.sections.some((s) => excluded.has(s.id)) &&
        estimateTokens(doc.markdown) < (budget.inputTokens - estimateTokens(makeSnapshot([]))) / 2
      )
        split(0, doc.markdown.length);
      else
        for (let i = 0; i < cuts.length - 1; i++) {
          const section = [...doc.sections]
            .reverse()
            .find((s) => lineOffsets[s.line - 1] <= cuts[i]);
          split(cuts[i], cuts[i + 1], section?.id);
        }
    }
    const words = input.instruction
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 1);
    const score = (s: ContextSource) =>
      words.reduce(
        (n, w) =>
          n +
          (s.title.toLowerCase().includes(w) ? 3 : 0) +
          (s.content.toLowerCase().includes(w) ? 1 : 0),
        0,
      );
    sources.sort((a, b) => score(b) - score(a));
    const batches: Batch[] = [];
    const add = (
      phase: Batch['phase'],
      evidence: ContextSource[],
      relations?: ContextSnapshot['relations'],
    ) => {
      const snapshot = makeSnapshot(evidence, relations);
      if (estimateTokens(snapshot) > budget.inputTokens)
        throw new Error('연결 근거가 입력 예산을 넘습니다. 예산을 조정해 주세요.');
      const { id: _id, requestId: _request, ...payload } = snapshot;
      const key = revisionOf(
        JSON.stringify({
          ...settings,
          phase,
          payload,
          instructions: documentInstructions,
          schema: outputSchema,
        }),
      );
      if (!batches.some((b) => b.key === key))
        batches.push({ id: randomUUID(), phase, snapshot, key, completed: false, cached: false });
    };
    for (const source of sources) add('documents', [source]);
    const owner = (id: string) =>
      documents.find((d) => d.id === id || d.sections.some((s) => s.id === id));
    for (const relation of ws.relations) {
      const from = owner(relation.fromId);
      const to = owner(relation.toId);
      if (!from || !to || from.id === to.id) continue;
      const link = ws.documentLinks.find((l) => l.id === relation.linkId);
      const linkOffset = link
        ? from.markdown
            .split('\n')
            .slice(0, link.line - 1)
            .reduce((n, line) => n + line.length + 1, 0) +
          link.column -
          1
        : undefined;
      const a = sources.find(
        (s) =>
          s.documentId === from.id &&
          (linkOffset !== undefined
            ? s.range!.start <= linkOffset && s.range!.end > linkOffset
            : s.complete || relation.fromId === from.id || s.sectionId === relation.fromId),
      );
      const b = sources.find(
        (s) =>
          s.documentId === to.id &&
          (link?.targetSectionId && link.targetSectionId !== to.id
            ? s.sectionId === link.targetSectionId || s.complete
            : s.complete || relation.toId === to.id || s.sectionId === relation.toId),
      );
      if (a && b) add('links', [a, b], [{ fromId: from.id, toId: to.id, type: relation.type }]);
      else
        warnings.push(
          `${from.title} → ${to.title}: 제외된 섹션 때문에 연결 근거를 함께 전송하지 않았습니다.`,
        );
    }
    const record: AnalysisRecord = {
      id: randomUUID(),
      instruction: input.instruction,
      ...settings,
      status: 'ready',
      budget,
      total: batches.length,
      warnings,
      completed: 0,
      cached: 0,
      documentIds: documents.map((d) => d.id),
      excludedIds: [...excluded],
      batches,
      revisions: Object.fromEntries(documents.map((d) => [d.id, d.revision])),
      boundary: this.boundary(),
    };
    this.store.put('analysis', record);
    return this.summary(record);
  }
  private boundary() {
    return revisionOf(
      JSON.stringify({
        metadata: this.metadata(),
        relations: this.store.all<Relation>('relation'),
      }),
    );
  }
  private validate(record: AnalysisRecord) {
    const documents = this.store.all<Document>('document');
    if (
      Object.entries(record.revisions).some(([id, rev]) => {
        const doc = documents.find((d) => d.id === id);
        return !doc || revisionOf(readDocumentFile(this.store.root, doc.relativePath)) !== rev;
      }) ||
      record.boundary !== this.boundary()
    )
      throw new Error('문서 또는 프로젝트 맥락이 변경되었습니다. 새 분석 계획을 만들어 주세요.');
    if (this.store.all<EditorDraft>('draft').some((d) => record.documentIds.includes(d.documentId)))
      throw new Error('분석 대상에 초안이 생겼습니다. 저장하거나 제외한 새 계획을 만들어 주세요.');
  }
  async *run(id: string, factory: () => Client, signal: AbortSignal): AsyncGenerator<AiEvent> {
    const record = this.get(id);
    record.status = 'running';
    record.error = undefined;
    this.store.put('analysis', record);
    try {
      this.validate(record);
      for (const batch of record.batches) {
        // Cached batches have no provider I/O to let IPC, progress and cancellation run.
        await yieldToEventLoop();
        if (signal.aborted) break;
        this.validate(record);
        if (batch.completed) continue;
        yield {
          type: 'progress',
          text: `${batch.phase === 'links' ? '연결 통합 검토' : '문서 분석'} ${record.completed + 1}/${record.total}`,
        };
        if (signal.aborted) break;
        const cached = this.store.get<{ id: string; snapshotId: string }>(
          'analysis-cache',
          batch.key,
        );
        if (cached) {
          batch.completed = true;
          batch.cached = true;
        } else {
          const snapshot = batch.snapshot;
          this.store.saveSnapshot(snapshot);
          let usage: RequestUsage | undefined;
          let client: Client | undefined;
          try {
            let response = this.store.get<{ id: string; response: unknown }>(
              'analysis-result',
              snapshot.id,
            )?.response;
            if (!response) {
              usage = {
                id: randomUUID(),
                provider: record.provider,
                model: record.model || null,
                createdAt: new Date().toISOString(),
                status: 'running',
                usage: normalizeCodexUsage(undefined),
              };
              this.store.saveUsage(usage);
              client = factory();
              for await (const event of client.run(snapshot, signal, record.model || undefined)) {
                if (event.type === 'usage') {
                  usage = { ...usage, usage: event.usage, model: event.model || usage.model };
                  this.store.saveUsage(usage);
                  yield event;
                } else if (event.type === 'error') throw new Error(event.message);
                else if (event.type === 'cancelled') break;
                else if (event.type === 'result') {
                  response = event.response;
                  break;
                } else yield event;
              }
            }
            if (signal.aborted) {
              if (usage) usage.status = 'cancelled';
              break;
            }
            if (!response) throw new Error('AI 응답이 완료되지 않았습니다. 재개해 주세요.');
            if (estimateTokens(response) > record.budget.outputTokens)
              throw new Error(
                '출력 예산을 넘었습니다. 예산을 조정한 새 분석 또는 재개가 필요합니다.',
              );
            this.validate(record);
            const parsed = responseSchema.parse(response);
            this.store.put('analysis-result', { id: snapshot.id, response: parsed });
            try {
              await new ProposalService(this.store).register(snapshot.id, parsed);
            } catch (error) {
              this.store.remove('analysis-result', snapshot.id);
              throw error;
            }
            this.store.put('message', {
              id: snapshot.id,
              role: 'assistant',
              text: parsed.message,
              requestId: record.id,
              createdAt: new Date().toISOString(),
            });
            this.store.put('analysis-cache', { id: batch.key, snapshotId: snapshot.id });
            batch.completed = true;
            if (usage) usage.status = 'completed';
          } catch (error) {
            if (usage) usage.status = signal.aborted ? 'cancelled' : 'error';
            throw error;
          } finally {
            if (usage) this.store.saveUsage(usage);
            await client?.close();
          }
        }
        record.completed = record.batches.filter((b) => b.completed).length;
        record.cached = record.batches.filter((b) => b.cached).length;
        this.store.put('analysis', record);
      }
      record.status = signal.aborted ? 'paused' : 'completed';
      yield signal.aborted
        ? { type: 'cancelled' }
        : {
            type: 'result',
            response: {
              message: '묶음 분석 완료. 문서별 제안과 연결 근거를 검토해 주세요.',
              proposals: [],
            },
          };
    } catch (error) {
      record.status = signal.aborted ? 'paused' : 'error';
      record.error = (error as Error).message;
      yield signal.aborted ? { type: 'cancelled' } : { type: 'error', message: record.error };
    } finally {
      this.store.put('analysis', record);
    }
  }
}
