export function navigate(path: string) {
  history.pushState(null, "", path);
  window.dispatchEvent(
    new CustomEvent("location-changed", { detail: { replace: false } }),
  );
}
