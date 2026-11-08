/** Wave 0 (docs/security/breaks/score-on-close.md): what a follow-up step's
 *  header does. On a step that only DESCRIBES a play already decided (assist,
 *  feed, rebound, outcome …) closing saves the play as is — the goal / try is
 *  never lost. On a step that DEFINES the play, and always while editing an
 *  existing one, it cancels (a mis-tap backs out; an edit keeps the original). PURE. */
export const closeSaves = ({ editing, describing }: { editing: boolean; describing: boolean }) => !editing && describing;
export const closeLabel = (saves: boolean) => (saves ? 'Save as is' : 'Cancel');
