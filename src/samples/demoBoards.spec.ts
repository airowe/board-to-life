import { describe, expect, it } from 'vitest';
import { checkWebGrounding } from '../ecosystem/questions';
import { checkFigureGrounding } from '../geometry/questions';
import { checkGrounding } from '../scene/questions';
import { SUBJECTS } from '../subjects';
import { SAMPLE_PICKS } from '../ui/capture';
import { HEROES } from '../ui/hero';
import { demoBoardFor } from './demoBoards';
import { SAMPLES } from './scenes';

const grounded = (board: NonNullable<ReturnType<typeof demoBoardFor>>): boolean => {
  const { content, questions } = board;
  if (content.subject === 'physics') return checkGrounding(questions, content.scene).ok;
  if (content.subject === 'ecosystem') return checkWebGrounding(questions, content.web).ok;
  return checkFigureGrounding(questions, content.figure).ok;
};

describe('demoBoardFor', () => {
  const picks = SUBJECTS.flatMap((subject) => [...SAMPLE_PICKS[subject].map((pick) => [subject, pick.url] as const), [subject, HEROES[subject].board] as const]);

  it.each(picks)('has a reading and grounded questions for every %s sample, %s', (subject, url) => {
    const board = demoBoardFor(url, subject);
    expect(board).not.toBeNull();
    if (!board) return;
    expect(board.content.subject).toBe(subject);
    expect(board.questions.length).toBeGreaterThan(0);
    expect(grounded(board)).toBe(true);
  });

  it('knows nothing about a photo that is not a sample', () => {
    expect(demoBoardFor('blob:http://localhost/abc', 'physics')).toBeNull();
  });

  it('does not read a sample as another subject', () => {
    expect(demoBoardFor(SAMPLE_PICKS.ecosystem[0]?.url ?? '', 'physics')).toBeNull();
  });

  it.each(SAMPLES.map((sample) => [sample.id, sample] as const))('asks %s about an item whose outcome is known', (_, sample) => {
    for (const question of sample.questions) {
      const item = question.observe.item;
      expect([...sample.outcome.falls, ...sample.outcome.stays]).toContain(item);
    }
  });

  it('hands out a copy, so editing a board does not change the sample', () => {
    const url = SAMPLE_PICKS.physics[1]?.url ?? '';
    const first = demoBoardFor(url, 'physics');
    if (first?.content.subject !== 'physics') throw new Error('expected a physics board');
    first.content.scene.items.length = 0;
    const second = demoBoardFor(url, 'physics');
    expect(second?.content.subject === 'physics' && second.content.scene.items.length).toBeGreaterThan(0);
  });
});
