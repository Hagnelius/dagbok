import type { ActivityType, Intensity } from './types'

/**
 * Uppskattad energiförbrukning vid träning med MET-värden (Compendium of Physical Activities, avrundat).
 * Vi räknar NETTOförbrukning: (MET − 1) × kroppsvikt × timmar, dvs. energin utöver vila,
 * eftersom vilan redan ingår i basalomsättningen. Resultatet är alltid en uppskattning.
 */
export const MET: Record<ActivityType, Record<Intensity, number>> = {
  promenad: { lag: 2.8, medel: 3.5, hog: 4.8 },
  lopning: { lag: 7.0, medel: 9.0, hog: 11.0 },
  cykling: { lag: 4.0, medel: 6.8, hog: 10.0 },
  crosstrainer: { lag: 5.0, medel: 6.8, hog: 9.0 },
  gym: { lag: 3.5, medel: 5.0, hog: 6.0 },
  fotboll: { lag: 5.0, medel: 7.0, hog: 10.0 },
  simning: { lag: 5.0, medel: 7.0, hog: 9.8 },
  annat: { lag: 3.0, medel: 5.0, hog: 7.0 },
}

export function estimateWorkoutKcal(activity: ActivityType, intensity: Intensity, durationMin: number, weightKg: number): number {
  if (!(durationMin > 0) || !(weightKg > 0)) return 0
  const met = MET[activity][intensity]
  return Math.round(((met - 1) * weightKg * durationMin) / 60 / 5) * 5
}
