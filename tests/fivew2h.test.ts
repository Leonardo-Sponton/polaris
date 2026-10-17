import { describe, expect, it } from "vitest";
import { emptyBlock, format, isEmpty, join, split } from "../src/data/fivew2h";

const BLOCK = `## 5W2H
- **What:** A shelf app
- **Why:** I lose track of books
- **Where:** Phone
- **When:** November
- **Who:** Me
- **How:** React
- **How much:** 20 hours
`;

describe("5W2H block", () => {
  it("round-trips the Markdown format", () => {
    const { rest, block } = split(`Draft text\n\n${BLOCK}`);
    expect(rest).toBe("Draft text\n");
    expect(block!.values).toMatchObject({ What: "A shelf app", "How much": "20 hours" });
    expect(join(rest, block)).toBe(`Draft text\n\n${BLOCK}`);
  });

  it("keeps the sections after it and moves the block to the end", () => {
    const body = `Intro\n\n${BLOCK}\n## Risks\n\nTime\n`;
    const { rest, block } = split(body);
    expect(rest).toBe("Intro\n\n## Risks\n\nTime\n");
    expect(join(rest, block)).toBe(`Intro\n\n## Risks\n\nTime\n\n${BLOCK}`);
  });

  it("accepts hand-written variants and keeps unknown lines", () => {
    const { block } = split("## 5w2h\n* **what**: thing\n- **Who:**\nsome note\n");
    expect(block!.values.What).toBe("thing");
    expect(block!.values.Who).toBe("");
    expect(block!.extra).toBe("some note");
    expect(format(block!)).toContain("- **What:** thing\n");
    expect(format(block!)).toMatch(/- \*\*How much:\*\*\n\nsome note\n$/);
  });

  it("has no block when there is no heading", () => {
    expect(split("text ## 5W2H inline")).toEqual({ rest: "text ## 5W2H inline", block: null });
    expect(join("x", null)).toBe("x");
    expect(isEmpty(emptyBlock())).toBe(true);
    expect(join("", emptyBlock())).toBe(format(emptyBlock()));
  });
});
