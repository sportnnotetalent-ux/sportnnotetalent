/** SD-15 — padel's stat schema (points only today). PURE. */
import { rallyStats, serveDetailStats } from '../rallyStats.ts';

const base = rallyStats('padel', '🟡', { sets: true });

/** SD-117c — padel's one-tap Double fault (as tennis): credited live to the
 *  faulting server ('keyed': only lines that had one carry it — older padel
 *  lines read "not tracked"). Aces come through the point detail (`aces`). */
export const padelStats: typeof base = {
  ...base,
  stats: [
    ...base.stats,
    { key: 'doubleFaults', label: 'Double faults', short: 'double faults', one: 'double fault', abbr: 'DF', group: 'serve', format: { unit: 'count', better: 'lower' }, weight: -1, coverage: 'keyed' },
    // SD-135 (PD-b) — optional 1st / 2nd serve (as tennis; keyed: only lines
    // of matches that tracked it carry the keys)
    ...serveDetailStats(),
    // padel-fault PF6 — the serving player's serve faults by type (keyed: only
    // lines of matches that typed a fault carry them), the mesh as padel's own
    ...([
      ['srvFaultNet', 'Serve faults into the net', 'serve faults into the net', 'serve fault into the net'],
      ['srvFaultLong', 'Serve faults long', 'serve faults long', 'serve fault long'],
      ['srvFaultWide', 'Serve faults wide', 'serve faults wide', 'serve fault wide'],
      ['srvFootFaults', 'Foot faults', 'foot faults', 'foot fault'],
      ['srvFaultMesh', 'Serve faults into the mesh', 'serve faults into the mesh', 'serve fault into the mesh'],
    ] as const).map(([key, label, short, one]) => ({ key, label, short, one, group: 'serve', format: { unit: 'count' as const, better: 'lower' as const }, coverage: 'keyed' as const })),
  ],
  sections: (base.sections ?? []).map((sec) => (sec.id === 'serve'
    ? { ...sec, rows: [{ stat: 'doubleFaults' }, ...sec.rows, { stat: 'firstServePct' }, { stat: 'firstServeWonPct' }, { stat: 'secondServeWonPct' }] }
    : sec)),
};
