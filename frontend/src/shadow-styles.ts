export function installStyles(shadow: ShadowRoot, css: string): void {
  const globals: string[] = [];
  const scoped = css.replace(/@(?:property\s+[^\s{]+|font-face)\s*\{[^{}]*\}/g, (rule) => {
    globals.push(rule);
    return "";
  });
  // Font faces and property registrations are ignored inside shadow roots by WebKit and Chromium.
  if (!document.getElementById("clacamieu-global")) {
    const style = document.createElement("style");
    style.id = "clacamieu-global";
    style.textContent = globals.join("\n");
    document.head.append(style);
  }
  const style = document.createElement("style");
  style.textContent = scoped;
  shadow.append(style);
}
