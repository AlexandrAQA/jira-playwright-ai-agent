/**
 * Unit tests for the Jira layer.
 *
 * Everything decidable without the network lives in a plain function, and those
 * are what is tested here. That is a deliberate choice over mocking axios: a
 * test that asserts "axios.get was called with this URL" restates the
 * implementation and would keep passing while the ADF parsing quietly broke.
 *
 * The most important test in this file is the one that proves appending never
 * drops what was already in a description. The agent writes to real tickets
 * unattended, so that rule has to hold in code rather than only in the playbook.
 */
import { expect, test } from '@playwright/test';

import {
  type AdfNode,
  adfToText,
  appendedDescription,
  isHumanOnlyStatus,
  moveIssue,
  pickTransition,
  textToParagraphs,
  toJiraIssue,
} from '../../src/jira';

/** A description as Jira actually returns it. */
const doc = (...paragraphs: string[]): AdfNode => ({
  type: 'doc',
  version: 1,
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

test.describe('adfToText', () => {
  test('reads text out of a nested document', () => {
    expect(adfToText(doc('First line.', 'Second line.'))).toBe('First line.\nSecond line.\n');
  });

  test('treats a missing description as empty rather than throwing', () => {
    expect(adfToText(null)).toBe('');
    expect(adfToText(undefined)).toBe('');
  });

  test('turns a hard break into a newline', () => {
    expect(
      adfToText({
        type: 'paragraph',
        content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }],
      }),
    ).toBe('a\nb\n');
  });

  test('walks node types it does not know instead of stopping', () => {
    // Jira keeps adding node types; an unknown one must not swallow its children.
    expect(
      adfToText({
        type: 'someFutureAtlassianNode',
        content: [{ type: 'text', text: 'still readable' }],
      }),
    ).toBe('still readable');
  });
});

test.describe('textToParagraphs', () => {
  test('makes one paragraph per line', () => {
    expect(textToParagraphs('one\ntwo')).toHaveLength(2);
  });

  test('keeps a blank line as an empty paragraph', () => {
    // Dropping it would silently reflow a human's formatting.
    const paragraphs = textToParagraphs('one\n\ntwo');
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[1].content).toEqual([]);
  });

  test('round-trips through adfToText', () => {
    const text = 'Automated test added.\nFile: tests/generated/aiqa-7.spec.ts';
    const rebuilt = adfToText({ type: 'doc', version: 1, content: textToParagraphs(text) });
    expect(rebuilt.trim()).toBe(text);
  });
});

test.describe('appendedDescription', () => {
  test('keeps every existing paragraph and adds the new one at the end', () => {
    const before = doc('Acceptance criteria written by a human.');
    const after = appendedDescription(before, 'Automated test: PASSED.');

    expect(adfToText(after)).toContain('Acceptance criteria written by a human.');
    expect(adfToText(after).trimEnd().endsWith('Automated test: PASSED.')).toBe(true);
    expect(after.content).toHaveLength(2);
  });

  test('never mutates the description it was given', () => {
    // The agent retries; a mutated input would compound on the second attempt.
    const before = doc('Original.');
    appendedDescription(before, 'Added.');
    expect(before.content).toHaveLength(1);
  });

  test('creates a document when the ticket had no description', () => {
    const after = appendedDescription(null, 'First note.');
    expect(after.type).toBe('doc');
    expect(adfToText(after).trim()).toBe('First note.');
  });

  test('does not append into a node that is not a document', () => {
    // Anything other than a doc root is not a description we can extend safely.
    const after = appendedDescription({ type: 'paragraph' }, 'Note.');
    expect(after.type).toBe('doc');
    expect(after.content).toHaveLength(1);
  });
});

test.describe('pickTransition', () => {
  const transitions = [
    { id: '11', name: 'To Do', to: { name: 'To Do' } },
    { id: '21', name: 'Start work', to: { name: 'In Progress' } },
    { id: '41', name: 'Done', to: { name: 'Done' } },
  ];

  test('matches on the destination status, which is what a human names', () => {
    expect(pickTransition(transitions, 'In Progress')?.id).toBe('21');
  });

  test('matches on the transition name too', () => {
    expect(pickTransition(transitions, 'Start work')?.id).toBe('21');
  });

  test('ignores case and surrounding spaces', () => {
    expect(pickTransition(transitions, '  done  ')?.id).toBe('41');
  });

  test('returns nothing for a status this board cannot reach', () => {
    // The caller turns this into a message listing what IS available, which is
    // what makes a differently configured board diagnosable.
    expect(pickTransition(transitions, 'In Review')).toBeUndefined();
  });

  test('survives a transition with no destination', () => {
    expect(pickTransition([{ id: '1', name: 'Odd' }], 'Done')).toBeUndefined();
  });
});

test.describe('isHumanOnlyStatus', () => {
  // The agent once closed a ticket as Done with "Run: PASSED" for a spec that
  // a human then rejected. The pull request was closed and the branch deleted,
  // so the board went on advertising a test that existed nowhere. Done is a
  // claim about a merge, and the agent cannot observe a merge.
  test('reserves the closing statuses for a human', () => {
    expect(isHumanOnlyStatus('Done')).toBe(true);
    expect(isHumanOnlyStatus('  done  ')).toBe(true);
    expect(isHumanOnlyStatus('Closed')).toBe(true);
    expect(isHumanOnlyStatus('Resolved')).toBe(true);
  });

  test('leaves the statuses the agent legitimately drives', () => {
    expect(isHumanOnlyStatus('In Progress')).toBe(false);
    expect(isHumanOnlyStatus('In Review')).toBe(false);
    expect(isHumanOnlyStatus('To Do')).toBe(false);
  });
});

test.describe('moveIssue', () => {
  test('refuses to close a ticket before it has touched the network', async () => {
    // The guard has to sit in front of the request, not inside the response
    // handling: this test passes with no Jira credentials at all, which is the
    // proof that nothing reached the board.
    await expect(moveIssue('AIQA-10', 'Done')).rejects.toThrow(/Refusing to move AIQA-10/);
  });

  test('names the status to use instead, rather than only saying no', async () => {
    // A gate that blocks without pointing anywhere is a gate people route around.
    await expect(moveIssue('AIQA-10', 'Done')).rejects.toThrow(/In Review/);
  });
});

test.describe('toJiraIssue', () => {
  test('maps the fields the agent needs', () => {
    const issue = toJiraIssue({
      key: 'AIQA-7',
      fields: {
        summary: 'Full checkout flow',
        status: { name: 'In Progress' },
        labels: ['playwright_agent'],
        description: doc('Steps: 1. open the app.'),
      },
    });

    expect(issue.key).toBe('AIQA-7');
    expect(issue.summary).toBe('Full checkout flow');
    expect(issue.status).toBe('In Progress');
    expect(issue.labels).toEqual(['playwright_agent']);
    expect(issue.descriptionText).toBe('Steps: 1. open the app.');
  });

  test('fills in blanks for a ticket with nothing but a key', () => {
    const issue = toJiraIssue({ key: 'AIQA-1', fields: {} });
    expect(issue).toEqual({
      key: 'AIQA-1',
      summary: '',
      status: '',
      labels: [],
      descriptionText: '',
      descriptionAdf: null,
    });
  });
});
