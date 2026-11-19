// The earlier rounds the tool wrote into the page: which of their comments are still open. Pure.

type RoundItem = { id?: string; done?: boolean; screen?: string; state?: string };
type Round = { round: number | string; items: RoundItem[] };

/** The rounds a page config holds, with anything that is not a round left out. */
export function roundsOf(config: unknown): Round[] {
  return Array.isArray(config) ? config.filter((round): round is Round => Boolean(round) && Array.isArray((round as Round).items)) : [];
}

/** The rounds before this one. */
export function roundsBefore(rounds: readonly Round[], round: number): Round[] {
  return rounds.filter((earlier) => (Number(earlier.round) || 0) < round);
}

/** The items still open from the rounds before this one, each as its round's number. */
export function earlierOpen(rounds: readonly Round[], round: number): number[] {
  return roundsBefore(rounds, round).flatMap((earlier) => earlier.items.filter((it) => !it.done).map(() => Number(earlier.round)));
}
