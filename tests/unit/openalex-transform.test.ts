import { describe, expect, it } from "vitest";
import { publicationDate } from "@/lib/openalex-transform";

describe("publicationDate", () => {
  it("keeps an ordinary date", () => {
    expect(publicationDate("2019-05-02", null, false)).toBe("2019-05-02");
    expect(publicationDate("2017-12-04", "1706.03762", true)).toBe("2017-12-04");
  });

  it("replaces a re-deposit date far after the arXiv submission month", () => {
    expect(publicationDate("2025-08-23", "1706.03762", true)).toBe("2017-06-01");
  });

  it("allows up to a year between preprint and publication", () => {
    expect(publicationDate("2018-06-01", "1706.03762", true)).toBe("2018-06-01");
    expect(publicationDate("2018-06-02", "1706.03762", true)).toBe("2017-06-01");
  });

  it("leaves journal versions alone even when they appear years after the preprint", () => {
    expect(publicationDate("2016-06-06", "1506.01497", false)).toBe("2016-06-06");
  });

  it("falls back to the arXiv month when there is no date", () => {
    expect(publicationDate(null, "2103.00020", true)).toBe("2021-03-01");
  });

  it("treats impossible dates as missing and ignores old-style ids", () => {
    expect(publicationDate("0001-01-01", null, false)).toBeNull();
    expect(publicationDate("2024-01-01", "hep-th/9901001", true)).toBe("2024-01-01");
  });
});
