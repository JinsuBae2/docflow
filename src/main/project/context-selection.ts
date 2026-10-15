import type { ContextSnapshot, ContextSource, Document } from '../../shared/contracts';
import { contextPayload, hasSourceEvidence } from '../../shared/context-payload';
export function originalSource(doc: Document, sectionId?: string): ContextSource {
  const section = doc.sections.find((s) => s.id === sectionId);
  const offsets = [0];
  for (let i = 0; i < doc.markdown.length; i++) if (doc.markdown[i] === '\n') offsets.push(i + 1);
  const next = section && doc.sections[section.order + 1];
  const range = section
    ? { start: offsets[section.line - 1], end: next ? offsets[next.line - 1] : doc.markdown.length }
    : undefined;
  return {
    id: sectionId || doc.id,
    documentId: doc.id,
    title: section?.title || doc.title,
    revision: doc.revision,
    content: range ? doc.markdown.slice(range.start, range.end) : doc.markdown,
    complete: !sectionId,
    sectionId,
    range,
  };
}
export function selectContextSources(
  snapshot: ContextSnapshot,
  documents: Document[],
  requested: ContextSource[],
  optional: Document[],
  excluded: Set<string>,
  limit: number,
) {
  const size = () => JSON.stringify(contextPayload(snapshot)).length;
  const words =
    snapshot.instruction
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((w) => w.length > 1) || [];
  const score = (s: ContextSource) =>
    words.reduce(
      (n, w) =>
        n +
        (s.title.toLocaleLowerCase().includes(w) ? 30 : 0) +
        (s.content.toLocaleLowerCase().includes(w) ? 1 : 0),
      0,
    );
  const omittedDecisions = snapshot.decisions.length,
    omittedHistory = snapshot.proposalHistory.length;
  const candidateIds = new Set([
    ...requested.map((s) => s.documentId),
    ...optional.map((d) => d.id),
  ]);
  snapshot.omittedIds = [...new Set([...excluded, ...candidateIds])];
  snapshot.sources = [];
  // Reserve room for evidence before optional historical metadata consumes the request.
  while (size() > limit - Math.min(1000, limit / 3) && snapshot.proposalHistory.length)
    snapshot.proposalHistory.shift();
  while (size() > limit - Math.min(1000, limit / 3) && snapshot.decisions.length)
    snapshot.decisions.shift();
  if (size() > limit)
    throw new Error('요청·프로젝트 정보가 맥락 예산을 넘습니다. 요청 범위를 줄여 주세요.');
  const append = (item: ContextSource) => {
    if (!hasSourceEvidence(item.content) || snapshot.sources.some((s) => s.id === item.id))
      return false;
    snapshot.sources.push(item);
    if (size() <= limit) return true;
    snapshot.sources.pop();
    return false;
  };
  const fragments = (item: ContextSource) => {
    if (item.range) return [item];
    const doc = documents.find((d) => d.id === item.documentId)!;
    return doc.sections.length
      ? doc.sections.filter((s) => !excluded.has(s.id)).map((s) => originalSource(doc, s.id))
      : [item];
  };
  const clip = (item: ContextSource, share: number) => {
    const start = item.range?.start || 0;
    let lo = 0,
      hi = Math.min(item.content.length, Math.max(0, share));
    const candidate = (end: number): ContextSource => ({
      ...item,
      complete: false,
      content: item.content.slice(0, end),
      range: { start, end: start + end },
    });
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      snapshot.sources.push(candidate(mid));
      const fits = size() <= limit;
      snapshot.sources.pop();
      if (fits) lo = mid;
      else hi = mid - 1;
    }
    let end = lo;
    const newline = item.content.lastIndexOf('\n', end - 1);
    if (newline >= end / 2) end = newline + 1;
    if (end > 0 && /[\uD800-\uDBFF]/.test(item.content[end - 1])) end--;
    const comment = item.content.lastIndexOf('<!--', end);
    if (comment >= 0 && item.content.indexOf('-->', comment) >= end) end = comment;
    const result = candidate(end);
    if (hasSourceEvidence(result.content)) append(result);
  };
  const relevant = requested.filter(
    (s, i) =>
      hasSourceEvidence(s.content) &&
      requested.findIndex((other) => other.id === s.id) === i &&
      (!s.sectionId ||
        !requested.some((other) => other.documentId === s.documentId && other.complete !== false)),
  );
  snapshot.sources = [...relevant];
  const compact = size() > limit;
  if (compact) {
    snapshot.sources = [];
    const ranked = relevant.flatMap(fragments).sort((a, b) => score(b) - score(a));
    const seen = new Set<string>();
    const first = ranked.filter((s) => !seen.has(s.documentId) && !!seen.add(s.documentId));
    const ordered = [...first, ...ranked.filter((s) => !first.includes(s))];
    for (let i = 0; i < ordered.length; i++) {
      const item = ordered[i];
      const remaining = new Map<string, ContextSource>();
      for (const next of ordered.slice(i)) {
        if (
          !snapshot.sources.some((source) => source.documentId === next.documentId) &&
          !remaining.has(next.documentId)
        )
          remaining.set(next.documentId, next);
      }
      // Reserve each remaining document's identity/range overhead before distributing text.
      const metadata = [...remaining.values()].reduce((total, source) => {
        const start = source.range?.start || 0;
        return (
          total +
          JSON.stringify({ ...source, content: '', complete: false, range: { start, end: start } })
            .length +
          1
        );
      }, 0);
      const share = Math.min(
        8000,
        Math.floor((limit - size() - metadata) / Math.max(1, remaining.size)),
      );
      if (item.content.length <= share && append(item)) continue;
      clip(item, share);
    }
  }
  for (const doc of optional) {
    if (excluded.has(doc.id) || requested.some((s) => s.documentId === doc.id)) continue;
    if (!doc.sections.some((s) => excluded.has(s.id)) && append(originalSource(doc))) continue;
    const candidates = fragments(originalSource(doc))
      .filter((s) => !excluded.has(s.id) && (score(s) > 0 || optional.length < 3))
      .sort((a, b) => score(b) - score(a));
    for (const item of candidates) {
      if (!append(item)) clip(item, Math.min(4000, Math.max(0, limit - size())));
    }
  }
  const omitted: NonNullable<ContextSnapshot['selection']>['omitted'] = [];
  for (const doc of documents) {
    const available = doc.sections.length
      ? doc.sections.map((s) => originalSource(doc, s.id))
      : [originalSource(doc)];
    for (const item of available) {
      const chosen = snapshot.sources.find(
        (s) =>
          s.documentId === doc.id &&
          (!s.range ||
            (item.range && s.range.start <= item.range.start && s.range.end >= item.range.end)),
      );
      if (chosen) continue;
      const partial = snapshot.sources.some((s) => s.documentId === doc.id && s.id === item.id);
      const isExcluded = excluded.has(doc.id) || excluded.has(item.id);
      omitted.push({
        documentId: doc.id,
        sectionId: item.sectionId,
        title: item.title,
        reason: isExcluded
          ? 'excluded'
          : !hasSourceEvidence(item.content)
            ? 'empty'
            : partial
              ? 'partial'
              : requested.some((s) => s.documentId === doc.id) || optional.includes(doc)
                ? 'budget'
                : 'unrelated',
      });
    }
  }
  // Keep only IDs on the wire; titles and UI selection diagnostics stay local.
  snapshot.omittedIds = [
    ...new Set([
      ...excluded,
      ...documents
        .filter(
          (d) =>
            candidateIds.has(d.id) &&
            !snapshot.sources.some((s) => s.documentId === d.id && s.complete !== false),
        )
        .map((d) => d.id),
    ]),
  ];
  if (size() > limit) throw new Error('요청 정보가 맥락 예산을 넘습니다. 선택 범위를 줄여 주세요.');
  snapshot.selection = {
    mode: compact || snapshot.sources.some((s) => s.complete === false) ? 'excerpts' : 'full',
    limit,
    usedCharacters: size(),
    estimatedInputTokens: 0,
    omitted,
    omittedDecisions: omittedDecisions - snapshot.decisions.length,
    omittedHistory: omittedHistory - snapshot.proposalHistory.length,
  };
}
