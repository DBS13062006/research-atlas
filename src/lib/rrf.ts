// Reciprocal Rank Fusion (Cormack et al., 2009): combine ranked lists by summing 1 / (k + rank).
// A document ranked well by either list rises; k = 60 damps the influence of the very top ranks.
export const RRF_K = 60;

export type Fused = { id: number; score: number; ranks: (number | null)[] };

export function reciprocalRankFusion(lists: number[][], k = RRF_K): Fused[] {
  const fused = new Map<number, Fused>();
  lists.forEach((list, li) => {
    list.forEach((id, i) => {
      const entry = fused.get(id) ?? { id, score: 0, ranks: lists.map(() => null) };
      if (entry.ranks[li] === null) {
        entry.ranks[li] = i + 1;
        entry.score += 1 / (k + i + 1);
      }
      fused.set(id, entry);
    });
  });
  return [...fused.values()].sort((a, b) => b.score - a.score || a.id - b.id);
}
