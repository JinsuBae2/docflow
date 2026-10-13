import { expect, it } from 'vitest';
import {
  flowSafetyError,
  flowKind,
  parseSimpleFlow,
  serializeSimpleFlow,
} from '../../src/shared/flows';

it('recognizes supported diagram families and blocks executable or configuration content', () => {
  expect(
    ['flowchart TD\nA-->B', 'sequenceDiagram\nA->>B: Hello', 'stateDiagram-v2\n[*] --> Ready'].map(
      flowKind,
    ),
  ).toEqual(['flowchart', 'sequence', 'state']);
  for (const code of [
    'flowchart TD\nclick A "https://evil.test"',
    'sequenceDiagram\nlinks A: {"URL":"https://evil.test"}',
    '%%{init: {}}%%\nflowchart TD',
    'flowchart TD\nA[<script>bad</script>]',
    '---\nconfig: {}\n---\nflowchart TD',
  ])
    expect(flowSafetyError(code)).toBeTruthy();
  expect(flowSafetyError('stateDiagram-v2\n[*] --> Ready')).toBeUndefined();
});

it('round-trips basic nodes, arrows, cycles and direction without accepting lossy syntax', () => {
  const flow = parseSimpleFlow('flowchart LR\n A[시작] --> B[검토]\n B --> A')!;
  expect(flow.nodes).toEqual([
    { id: 'A', label: '시작' },
    { id: 'B', label: '검토' },
  ]);
  expect(flow.edges).toEqual([
    { from: 'A', to: 'B' },
    { from: 'B', to: 'A' },
  ]);
  expect(parseSimpleFlow(serializeSimpleFlow(flow))).toEqual(flow);
  for (const code of [
    'flowchart TD\nA{판단} --> B',
    'flowchart TD\nA -->|수락| B',
    'flowchart TD\n%% keep this comment\nA --> B',
    'flowchart TD\nsubgraph Group\nA-->B\nend',
    'sequenceDiagram\nA->>B: Hello',
  ])
    expect(parseSimpleFlow(code)).toBeNull();
  expect(() =>
    serializeSimpleFlow({ ...flow, nodes: [{ id: 'A', label: '"]\nclick A bad' }] }),
  ).toThrow();
});

it('allows action words in labels/messages but rejects real click and callback statements', () => {
  expect(flowSafetyError('flowchart TD\nA[Click sign in] --> B[Dashboard]')).toBeUndefined();
  expect(flowSafetyError('sequenceDiagram\nAPI->>Client: callback complete')).toBeUndefined();
  expect(parseSimpleFlow('flowchart TD\nA[Click sign in] --> B[Dashboard]')).not.toBeNull();
  for (const code of [
    'flowchart TD\nA --> B\nclick A handler',
    'flowchart TD; A --> B; click A handler',
    'sequenceDiagram\nparticipant Client\nlink Client: URL',
  ])
    expect(flowSafetyError(code)).toBeTruthy();
});
