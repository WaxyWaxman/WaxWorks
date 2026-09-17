import { describe, expect, it } from "vitest";
import { isCalendarDate, toCalendarDate } from "./calendarDate";
import { dueFor } from "./payables";

/**
 * The date a receiving clerk types is the one that has to compare against every
 * other date in the system. These pin the normalizing, and the two places a
 * date in another shape used to surface: a due date derived off it (E-02 d45),
 * and anything filed or ranged by date.
 */

describe("toCalendarDate", () => {
  it("passes an ISO calendar day through untouched", () => {
    expect(toCalendarDate("2026-09-10")).toBe("2026-09-10");
  });

  it("turns the DD/MM/YYYY the intake form used to collect into one calendar day", () => {
    expect(toCalendarDate("10/09/2026")).toBe("2026-09-10");
    expect(toCalendarDate("1/9/2026")).toBe("2026-09-01");
  });

  it("is blank for a blank date — an intake with no paperwork has none (E-02 d39)", () => {
    expect(toCalendarDate("")).toBe("");
    expect(toCalendarDate("   ")).toBe("");
    expect(toCalendarDate(undefined)).toBe("");
  });

  it("refuses a shape it cannot place, rather than storing it verbatim", () => {
    expect(toCalendarDate("10 Sept 2026")).toBe("");
    expect(toCalendarDate("09/10/26")).toBe("");
    expect(toCalendarDate("2026-9-10")).toBe("");
    expect(toCalendarDate("yesterday")).toBe("");
  });

  it("refuses a day that is not in the calendar, which Date would roll over", () => {
    expect(toCalendarDate("2026-02-31")).toBe("");
    expect(toCalendarDate("31/02/2026")).toBe("");
    expect(toCalendarDate("2026-13-01")).toBe("");
    // Not a leap year: 2026-02-29 does not exist, 2028-02-29 does.
    expect(toCalendarDate("29/02/2026")).toBe("");
    expect(toCalendarDate("29/02/2028")).toBe("2028-02-29");
  });

  it("sorts with the dates already on file — which is the whole point", () => {
    // Stored verbatim, "10/09/2026" sorts BEFORE "2026-01-01", so a row keyed
    // on it falls outside every date range instead of into the wrong one.
    const raw = ["2026-01-01", "10/09/2026", "2026-12-31"].sort();
    expect(raw[0]).toBe("10/09/2026");

    const normalized = ["2026-01-01", toCalendarDate("10/09/2026"), "2026-12-31"].sort();
    expect(normalized).toEqual(["2026-01-01", "2026-09-10", "2026-12-31"]);
  });
});

describe("isCalendarDate", () => {
  it("accepts only YYYY-MM-DD that exists", () => {
    expect(isCalendarDate("2026-09-10")).toBe(true);
    expect(isCalendarDate("2026-02-31")).toBe(false);
    expect(isCalendarDate("10/09/2026")).toBe(false);
    expect(isCalendarDate("")).toBe(false);
  });
});

describe("dueFor with no usable date to run from (E-02 d45)", () => {
  const today = new Date(2026, 8, 16);

  it("derives the due date from an ISO invoice date", () => {
    expect(dueFor("Net 30", "2026-09-10", today).dueDate).toBe("2026-10-10");
    expect(dueFor("End of Month", "2026-09-10", today).dueDate).toBe("2026-09-30");
  });

  it("reports no due date rather than NaN-NaN-NaN when there is no invoice date", () => {
    const due = dueFor("Net 30", "", today);
    expect(due.terms).toBe("Net 30");
    expect(due.dueDate).toBeUndefined();
    expect(due.overdueBy).toBeUndefined();
  });

  it("does the same for a date in any other shape", () => {
    expect(dueFor("Net 30", "10/09/2026", today).dueDate).toBeUndefined();
    expect(dueFor("End of Month", "10/09/2026", today).dueDate).toBeUndefined();
    // COD carries no due date either way, and used to age by NaN days.
    expect(dueFor("COD", "10/09/2026", today).overdueBy).toBeUndefined();
  });
});
