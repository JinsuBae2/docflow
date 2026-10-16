import { expect, it } from 'vitest';
import { isPlanningStart, planningPatchSchema } from '../../src/shared/planning';

it('offers planning for placeholders but preserves document mode for real content', () => {
  expect(isPlanningStart([])).toBe(true);
  expect(
    isPlanningStart([{ title: '아이디어', markdown: '<!-- docflow-id: abc -->\n# 아이디어\n\n' }]),
  ).toBe(true);
  expect(
    isPlanningStart([
      { title: '아이디어', markdown: '# 아이디어\n사용자가 탐지 결과를 검토한다.' },
    ]),
  ).toBe(false);
  expect(
    isPlanningStart([{ title: '아이디어', markdown: '# 아이디어\n## 목표\n분석 시간 단축' }]),
  ).toBe(false);
});

it('rejects unknown stages, extra fields and oversized planning notes', () => {
  const brief = { confirmed: '관리자를 위한 탐지 도구', openQuestions: '', assumptions: '' };
  expect(planningPatchSchema.safeParse({ stage: 'scope', brief }).success).toBe(true);
  expect(planningPatchSchema.safeParse({ stage: 'unknown', brief }).success).toBe(false);
  expect(planningPatchSchema.safeParse({ stage: 'scope', brief, root: '/other' }).success).toBe(
    false,
  );
  expect(
    planningPatchSchema.safeParse({
      stage: 'scope',
      brief: { ...brief, confirmed: 'x'.repeat(4001) },
    }).success,
  ).toBe(false);
});
