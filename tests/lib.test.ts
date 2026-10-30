import { describe, it, expect } from "vitest";
import { safeCsv, attendeeSchema, money } from "../src/lib";
describe("export and attendee boundaries", () => {
  it("neutralizes spreadsheet formulas and quotes", () => {
    const csv = safeCsv([['=HYPERLINK("x")', "+1", "@SUM(A1)", "ordinary"]]);
    expect(csv).toContain('"\'=HYPERLINK(""x"")"');
    expect(csv).toContain('"\'+1"');
    expect(csv).toContain('"\'@SUM(A1)"');
  });
  it("requires eight digit DNI and a full name", () => {
    expect(
      attendeeSchema.safeParse({
        name: "Ana Pérez",
        dni: "01234567",
        birth: "2000-01-01",
      }).success,
    ).toBe(true);
    expect(
      attendeeSchema.safeParse({ name: "A", dni: "123", birth: "yesterday" })
        .success,
    ).toBe(false);
  });
  it("formats integer cents as PEN", () =>
    expect(money(6500)).toContain("65.00"));
});
