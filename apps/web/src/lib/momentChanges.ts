/**
 * "A Moment was just created" — told to whatever listing is on screen.
 *
 * Community's composer is a dialog mounted by the shell, above whichever page
 * is open: Home, Explore, a Community Profile, a Moment. It used to follow a
 * share with `router.refresh()`, which re-renders the route but cannot re-run
 * a client listing's own fetch, so the new Moment appeared only after a hard
 * reload. Every Community listing pages through `useMomentPages`, and that hook
 * listens here instead: it asks for its first page again and adds whatever is
 * new at the top, keeping everything already loaded and the reader's place.
 *
 * Nothing else about the Moment travels on this signal. Each listing asks the
 * server, which alone decides whether the new Moment belongs in it — a Moment
 * kept to "Only me" is simply not in any public listing's answer.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function announceMomentCreated() {
  for (const listener of [...listeners]) {
    listener();
  }
}

export function subscribeMomentCreated(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
