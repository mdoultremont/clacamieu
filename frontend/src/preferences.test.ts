import { describe, expect, it, vi } from "vitest";
import { readPreferences, setDefaultPanel } from "./preferences";
import type { HassLike } from "./types";

describe("default panel preference", () => {
  it("reads and merges the full current object before enabling Maison", async () => {
    const callWS = vi
      .fn()
      .mockResolvedValueOnce({
        value: { theme: "dark", other: true, default_panel: "lovelace" },
      })
      .mockResolvedValueOnce(null);
    await setDefaultPanel({ callWS } as unknown as HassLike, "clacamieu", true);
    expect(callWS.mock.calls).toEqual([
      [{ type: "frontend/get_user_data", key: "core" }],
      [
        {
          type: "frontend/set_user_data",
          key: "core",
          value: { theme: "dark", other: true, default_panel: "clacamieu" },
        },
      ],
    ]);
  });
  it("removes only default_panel when disabling", async () => {
    const callWS = vi
      .fn()
      .mockResolvedValueOnce({
        value: { theme: "dark", default_panel: "clacamieu" },
      })
      .mockResolvedValueOnce(null);
    await expect(
      setDefaultPanel({ callWS } as unknown as HassLike, "clacamieu", false),
    ).resolves.toEqual({ theme: "dark" });
    expect(callWS).toHaveBeenLastCalledWith({
      type: "frontend/set_user_data",
      key: "core",
      value: { theme: "dark" },
    });
  });
  it("accepts a missing core preference", async () => {
    await expect(
      readPreferences({
        callWS: vi.fn().mockResolvedValue({ value: null }),
      } as unknown as HassLike),
    ).resolves.toEqual({});
  });
  it("does not write if reading the previous value fails", async () => {
    const callWS = vi.fn().mockRejectedValue(new Error("read failed"));
    await expect(
      setDefaultPanel({ callWS } as unknown as HassLike, "clacamieu", true),
    ).rejects.toThrow("read failed");
    expect(callWS).toHaveBeenCalledOnce();
  });
});
