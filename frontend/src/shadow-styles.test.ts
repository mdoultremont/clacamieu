import { expect, it } from "vitest";
import { installStyles } from "./shadow-styles";

it("hoists property and font rules once while keeping theme and app rules private", () => {
  document.getElementById("clacamieu-global")?.remove();
  const css = '@font-face {font-family: Test; src: url(/font.woff2)} @property --tw-shadow {syntax: "*"; inherits: false; initial-value: 0 0 #0000} :host {--background: #09090b} .card {color: white}';
  const first = document.createElement("div").attachShadow({ mode: "open" });
  const second = document.createElement("div").attachShadow({ mode: "open" });
  installStyles(first, css);
  installStyles(second, css);
  expect(document.querySelectorAll("#clacamieu-global")).toHaveLength(1);
  expect(document.getElementById("clacamieu-global")?.textContent).toContain("@property --tw-shadow");
  expect(document.getElementById("clacamieu-global")?.textContent).not.toContain(":host");
  expect(first.querySelector("style")?.textContent).toContain(":host");
  expect(first.querySelector("style")?.textContent).not.toContain("@font-face");
});
