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
    return 5;
  }

  const predictedDiff = predictedHome - predictedAway;
  const actualDiff = actualHome - actualAway;
  const predictedOutcome = Math.sign(predictedDiff);
  const actualOutcome = Math.sign(actualDiff);

  let points = 0;
  if (predictedOutcome === actualOutcome) {
    points += 3;
  }
  if (predictedDiff === actualDiff) {
    points += 1;
  }

  return points;
}
