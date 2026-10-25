import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "@/lib/rrf";

describe("reciprocal rank fusion", () => {
  it("scores 1/(60+rank) per list and sums across lists", () => {
    const [top] = reciprocalRankFusion([
      [1, 2],
      [1, 3],
    ]);
    expect(top.id).toBe(1);
    expect(top.score).toBeCloseTo(2 / 61, 10);
    expect(top.ranks).toEqual([1, 1]);
  });

  it("lets a document found by both lists beat one ranked first by a single list", () => {
    const fused = reciprocalRankFusion([
      [10, 20],
      [30, 20],
    ]);
    expect(fused[0].id).toBe(20);
    expect(
      fused
        .map((f) => f.id)
        .slice(1)
        .sort(),
    ).toEqual([10, 30]);
  });

  it("records missing ranks as null and ignores duplicates within a list", () => {
    const fused = reciprocalRankFusion([[5, 5, 6], []]);
    expect(fused.find((f) => f.id === 5)).toMatchObject({ ranks: [1, null] });
    expect(fused.find((f) => f.id === 5)?.score).toBeCloseTo(1 / 61, 10);
  });
});
