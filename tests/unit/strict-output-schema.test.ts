import { createRequire } from 'node:module';
import { parseUserFlow } from '../../src/shared/user-flow';
import { expect, it } from 'vitest';
import {
  outputSchema,
  flowOutputSchema,
  planningOutputSchema,
  normalizeAiResponse,
  responseSchema,
} from '../../src/shared/proposal-schema';
function check(schema: unknown, path = 'schema') {
  if (!schema || typeof schema !== 'object') return;
  if (Array.isArray(schema)) {
    schema.forEach((s, i) => check(s, `${path}.${i}`));
    return;
  }
  const item = schema as Record<string, any>;
  if (item.type === 'object') {
    expect(item.additionalProperties, path).toBe(false);
    expect([...(item.required || [])].sort(), path).toEqual(
      Object.keys(item.properties || {}).sort(),
    );
  }
  for (const [key, value] of Object.entries(item)) check(value, `${path}.${key}`);
}
it.each([
  ['document', outputSchema],
  ['flow', flowOutputSchema],
  ['planning', planningOutputSchema],
])('requires all nested properties in %s generation schemas', (_, schema) => check(schema));

it('normalizes only optional AI nulls while preserving required nulls and strict local storage validation', () => {
  const factory = createRequire(import.meta.url)('../fixtures/flow-response.cjs');
  const wire = factory({
    sources: [{ id: 'doc', documentId: 'doc', revision: 'rev', content: '# 로그인' }],
    flowContext: { flowId: 'journey', projectId: 'project', baseFlow: null },
  });
  const proposal = wire.proposals[0];
  const node = proposal.flow.nodes[0];
  Object.assign(node, {
    parentId: null,
    extent: null,
    position: null,
    width: null,
    height: null,
    collapsed: null,
  });
  Object.assign(node.data, { description: null, components: null, outputs: null });
  proposal.scopedSourceId = null;
  proposal.flow.edges[0].sourceHandle = null;
  proposal.flow.edges[0].label = null;
  expect(() => parseUserFlow(proposal.flow)).toThrow();
  const parsed = responseSchema.parse(normalizeAiResponse(wire));
  const parsedProposal = parsed.proposals[0];
  expect(parsedProposal.kind).toBe('flow');
  if (parsedProposal.kind !== 'flow') throw new Error('Expected a flow proposal');
  const flow = parsedProposal.flow;
  expect(flow.nodes[0].parentId).toBeUndefined();
  expect(flow.nodes[0].data.description).toBeUndefined();
  expect(flow.edges[0].sourceHandle).toBeUndefined();
  expect(parsed.proposals[0].targetId).toBeNull();
  expect(parsed.proposals[0].baseRevision).toBeNull();
  expect(() => parseUserFlow(flow)).not.toThrow();
  node.id = null;
  expect(() => responseSchema.parse(normalizeAiResponse(wire))).toThrow();
  node.id = 'start';
  node.extra = 'unknown';
  expect(() => responseSchema.parse(normalizeAiResponse(wire))).toThrow();
});

it.each(['constructor', '__proto__'])(
  'preserves unknown %s null properties for strict rejection',
  (key) => {
    const wire = JSON.parse(`{"message":"확인","proposals":[],"${key}":null}`);
    const normalized = normalizeAiResponse(wire);
    expect(Object.hasOwn(normalized as object, key)).toBe(true);
    expect(() => responseSchema.parse(normalized)).toThrow();
  },
);
