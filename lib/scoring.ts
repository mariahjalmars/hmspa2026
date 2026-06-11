export function calculatePoints(
  predictedHome: number,
  predictedAway: number,
  actualHome: number | null,
  actualAway: number | null
) {
  if (actualHome === null || actualAway === null) {
    return 0;
  }

  if (predictedHome === actualHome && predictedAway === actualAway) {
    return 4;
  }

  const predictedOutcome = Math.sign(predictedHome - predictedAway);
  const actualOutcome = Math.sign(actualHome - actualAway);

  return predictedOutcome === actualOutcome ? 1 : 0;
}
