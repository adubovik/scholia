import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadingSurface } from "@/components/ReadingSurface";

describe("ReadingSurface", () => {
  it("renders the title and each paragraph sliced from source text by offsets", () => {
    const sourceText = "First para.\n\nSecond para.";
    render(
      <ReadingSurface
        title="Russell"
        sourceText={sourceText}
        paragraphs={[
          { charStart: 0, charEnd: 11 },
          { charStart: 13, charEnd: 25 },
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Russell" })).toBeDefined();
    expect(screen.getByText("First para.")).toBeDefined();
    expect(screen.getByText("Second para.")).toBeDefined();
  });
});
