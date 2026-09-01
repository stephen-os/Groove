/**
 * The first element of a fixture the test just built.
 *
 * `noUncheckedIndexedAccess` types `items[0]` as possibly undefined, which is
 * right for real code and noise in a test that constructed the array two lines
 * earlier. This says "there is one, and if there is not, say so" — which fails
 * with a sentence rather than a bare TypeError, and unlike `!` it still checks.
 */
export function first<T>(items: readonly T[]): T {
  const item = items[0];
  if (item === undefined) throw new Error('Fixture is empty; expected at least one item.');
  return item;
}
