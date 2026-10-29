/**
 * CL-03 parental proof — what reviewers, parents and children are told
 * (docs/security/cl03-parental-proof-design.md). Pure, so it's tested in node
 * (tests/guardian-proof-fn.test.mts). No names or documents go to reviewers:
 * they open the proof inside the app.
 */
import { clip, stripLinks } from './text.ts';

type Msg = { title: string; body: string };

export function reviewerAlert(): Msg {
  return {
    title: '🛡️ Parental proof to review',
    body: 'A parent sent their photo ID and a document showing they\'re the parent or guardian of an under-18 player. Open the review queue to check them.',
  };
}

/** The parent and the child, after a reviewer's decision. */
export function decidedMessages(o: { approved: boolean; reason: string | null; childName: string }): { parent: Msg; child: Msg } {
  const first = clip(o.childName, 60).split(' ')[0] || 'your child';
  if (o.approved) {
    return {
      parent: { title: '✓ Approved', body: `${first}'s account is approved — you're now linked as their parent or guardian. Messages about ${first} come to you.` },
      child: { title: '✓ Your account is approved', body: 'Your parent or guardian\'s documents were accepted. You\'re all set.' },
    };
  }
  const why = stripLinks(clip(o.reason ?? '', 200)).trim();
  return {
    parent: { title: 'Documents not accepted', body: `We couldn't accept the documents for ${first}${why ? `: ${why}` : ''}. Open SportnNote to send new ones.` },
    child: { title: 'Not approved yet', body: 'Your parent or guardian\'s documents weren\'t accepted. Ask them to open SportnNote and send new ones.' },
  };
}
