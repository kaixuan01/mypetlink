// Installed before Next hydration. The bridge only acts while Merchant
// Management has a dirty draft. Indexes preserve the real Back/Forward trail;
// no duplicate/sentinel history entries or private data are stored.
export const merchantDraftNavigationBootstrap = `(() => {
  if (window.__merchantDraftHistory) return;
  const push = history.pushState.bind(history), replace = history.replaceState.bind(history);
  const bridge = window.__merchantDraftHistory = { index: history.state?.__merchantIndex ?? 0, replace, guard: null };
  replace({ ...history.state, __merchantIndex: bridge.index }, '', location.href);
  history.pushState = (data, title, url) => { bridge.index++; push({ ...data, __merchantIndex: bridge.index }, title, url); };
  history.replaceState = (data, title, url) => replace({ ...data, __merchantIndex: bridge.index }, title, url);
  window.addEventListener('popstate', event => {
    const next = event.state?.__merchantIndex ?? history.state?.__merchantIndex;
    const delta = typeof next === 'number' ? next - bridge.index : 0;
    if (typeof next === 'number') bridge.index = next;
    bridge.guard?.(event, delta);
  }, true);
})();`;

declare global {
  interface Window {
    __merchantDraftHistory?: {
      index: number;
      replace: History["replaceState"];
      guard: ((event: PopStateEvent, delta: number) => void) | null;
    };
  }
}
