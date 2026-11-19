// Where a review looks, and what it has seen. A place is a platform and a theme the design declares, such as
// "ios-dark", and a view is a state in a place: the one thing the review counts, since a state can look right on one
// platform or theme and wrong on another. A view counts as seen once the viewer has shown that state there. Pure: each function reads only its arguments.

type Places = { platforms: string[]; themes: string[]; places: string[] };
export type StateRef = readonly [screen: string, state: string];

/** The places a review must see: each declared platform in each declared theme, in the design's order. */
export function placesOf(platforms: readonly string[], themes: readonly string[]): Places {
  return { platforms: [...platforms], themes: [...themes], places: platforms.flatMap((platform) => themes.map((theme) => `${platform}-${theme}`)) };
}

export function stateKey(screen: string, state: string): string {
  return `${screen}/${state}`;
}

/** The key the seen record holds for a view: a state in a place. */
export function seenKey(screen: string, state: string, place: string): string {
  return `${stateKey(screen, state)}@${place}`;
}

type Next = { screen: string; state: string; place: string; left: number };

/**
 * The next view not seen: first in the place on screen, after the state on screen; then in each other place, starting
 * with the state on screen. `left` counts the views still not seen after this one. Null when every view is seen.
 */
export function nextUnseen(all: readonly StateRef[], current: StateRef, here: string, places: readonly string[], seen: ReadonlySet<string>): Next | null {
  const at = all.findIndex(([screen, state]) => screen === current[0] && state === current[1]);
  const from = Math.max(0, places.indexOf(here));
  const unseen =
    (place: string) =>
    ([screen, state]: StateRef) =>
      !seen.has(seenKey(screen, state, place));
  const left = places.reduce((n, place) => n + all.filter(unseen(place)).length, 0) - 1;
  for (const place of places.includes(here) ? places.slice(from).concat(places.slice(0, from)) : places) {
    const walk = place === here ? all.slice(at + 1).concat(all.slice(0, at + 1)) : all.slice(at).concat(all.slice(0, at));
    const found = walk.find(unseen(place));
    if (found) return { screen: found[0], state: found[1], place, left };
  }
  return null;
}
