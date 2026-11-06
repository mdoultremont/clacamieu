import { describe, expect, it } from "vitest";
import { climateTrend } from "./climate-trend";

const at = (s: string) => [{ s, lu: 0 }];

describe("climate trends", () => {
  it("compares with the reading at the start of the last hour", () => {
    expect(climateTrend("co2", at("1500"), 1725, "fr")).toEqual({
      direction: "up",
      delta: "+225",
    });
    expect(climateTrend("temperature", at("18.8"), 18.4, "fr")).toEqual({
      direction: "down",
      delta: "-0,4",
    });
  });
  it("calls small changes steady, per sensor", () => {
    expect(climateTrend("humidity", at("65"), 66, "en")?.direction).toBe(
      "steady",
    );
    expect(climateTrend("co2", at("1700"), 1740, "en")?.direction).toBe(
      "steady",
    );
    expect(climateTrend("temperature", at("20"), 20.2, "en")?.direction).toBe(
      "steady",
    );
  });
  it("has no trend without a past reading", () => {
    expect(climateTrend("pm25", undefined, 12, "en")).toBeNull();
    expect(climateTrend("pm25", at("unavailable"), 12, "en")).toBeNull();
  });
});
