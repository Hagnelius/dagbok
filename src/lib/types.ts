// Datamodell för dagboken. Alla datum lagras som lokala svenska datumnycklar "YYYY-MM-DD"
// och tider som "HH:mm" (Europe/Stockholm). Tidsstämplar (createdAt m.fl.) är ISO-strängar i UTC.

export type ID = string

export type Sex = 'man' | 'kvinna' | 'ej_angivet'
export type ActivityLevel = 'stillasittande' | 'latt' | 'mattlig' | 'hog'
export type MainGoal = 'viktnedgang' | 'behalla_muskler' | 'kondition' | 'fotbollskondition' | 'hel_match'
export type NutrientKey = 'kcal' | 'protein' | 'fat' | 'carbs'

/** Användarprofil – en enda post med id "me". */
export interface Profile {
  id: 'me'
  age: number
  sex: Sex
  heightCm: number
  startWeightKg: number
  goalWeightKg: number
  /** Önskad takt i kg per vecka (0 = behålla vikten). */
  rateKgPerWeek: number
  activityLevel: ActivityLevel
  trainingSessionsPerWeek: number
  mainGoals: MainGoal[]
  healthNotes: string
  trackedNutrients: NutrientKey[]
  createdAt: string
  updatedAt: string
}

export interface GoalCalculation {
  method: string
  bmr: number
  pal: number
  dailyLifeKcal: number
  plannedTrainingKcalPerDay: number
  tdee: number
  requestedDeficit: number
  appliedDeficit: number
  proteinPerKg: number
  proteinReferenceWeightKg: number
  warnings: string[]
}

/** Mål – historik så att äldre dagar jämförs mot det mål som gällde då. */
export interface Goal {
  id: ID
  validFrom: string // datumnyckel
  mode: 'beraknat' | 'manuellt'
  kcal: number
  protein: number
  fat?: number
  carbs?: number
  calculation?: GoalCalculation
  createdAt: string
}

export type Unit = 'g' | 'ml' | 'dl' | 'st' | 'portion' | 'skiva' | 'msk' | 'tsk' | 'krm'
export const UNITS: Unit[] = ['g', 'st', 'portion', 'skiva', 'dl', 'ml', 'msk', 'tsk', 'krm']

export interface Nutrition {
  kcal: number
  protein: number
  fat?: number
  carbs?: number
}

export type MealType = 'frukost' | 'lunch' | 'middag' | 'mellanmal' | 'dryck'
export const MEALS: MealType[] = ['frukost', 'lunch', 'middag', 'mellanmal', 'dryck']

/** Varifrån ett värde kommer – visas i AI-granskningen och på poster. */
export type ValueOrigin = 'angivet' | 'beraknat' | 'uppskattat' | 'osakert'

/** Eget livsmedel (favoritlivsmedel). Näring anges per en portion om `amount` `unit`. */
export interface Food extends Nutrition {
  id: ID
  name: string
  amount: number
  unit: Unit
  favorite: boolean
  sortOrder: number
  useCount: number
  lastUsedAt?: string
  isDemo?: boolean
  createdAt: string
  updatedAt: string
}

/** Ingrediens i standardmåltid eller recept. Näring avser angiven mängd. */
export interface Ingredient extends Nutrition {
  id: ID
  name: string
  amount: number
  unit: Unit
}

/** Standardmåltid – återkommande kombination. Mallen ändras aldrig när den används. */
export interface MealTemplate {
  id: ID
  name: string
  meal?: MealType
  items: Ingredient[]
  favorite: boolean
  sortOrder: number
  useCount: number
  lastUsedAt?: string
  isDemo?: boolean
  createdAt: string
  updatedAt: string
}

export interface Recipe {
  id: ID
  name: string
  portions: number
  items: Ingredient[]
  note?: string
  favorite: boolean
  sortOrder: number
  useCount: number
  lastUsedAt?: string
  isDemo?: boolean
  createdAt: string
  updatedAt: string
}

export type EntrySource = 'manuell' | 'livsmedel' | 'standardmaltid' | 'recept' | 'ai' | 'kopia' | 'lokal_tolkning'

/** Matpost – en rad i dagboken. Näringsvärdena avser hela posten. */
export interface FoodEntry extends Nutrition {
  id: ID
  date: string
  time: string
  meal: MealType
  name: string
  amount: number
  unit: Unit
  note?: string
  source: EntrySource
  sourceId?: ID
  /** Poster som lades till tillsammans (t.ex. en standardmåltid) delar groupId. */
  groupId?: ID
  groupName?: string
  origin?: ValueOrigin
  aiInterpretationId?: ID
  isDemo?: boolean
  createdAt: string
  updatedAt: string
}

export type ActivityType = 'promenad' | 'lopning' | 'cykling' | 'crosstrainer' | 'gym' | 'fotboll' | 'simning' | 'annat'
export const ACTIVITIES: ActivityType[] = ['promenad', 'lopning', 'cykling', 'crosstrainer', 'gym', 'fotboll', 'simning', 'annat']
export type Intensity = 'lag' | 'medel' | 'hog'

export interface Workout {
  id: ID
  date: string
  time?: string
  activity: ActivityType
  /** Fritt namn för "annat" eller förtydligande, t.ex. "Fotbollsträning". */
  label?: string
  durationMin: number
  intensity: Intensity
  kcal?: number
  /** true = kcal är en uppskattning (MET-beräkning eller AI), false = användaren angav värdet. */
  kcalEstimated: boolean
  distanceKm?: number
  avgHr?: number
  maxHr?: number
  rpe?: number
  note?: string
  source: 'manuell' | 'mall' | 'ai' | 'kopia' | 'lokal_tolkning'
  aiInterpretationId?: ID
  isDemo?: boolean
  createdAt: string
  updatedAt: string
}

export interface WorkoutTemplate {
  id: ID
  name: string
  activity: ActivityType
  label?: string
  durationMin: number
  intensity: Intensity
  favorite: boolean
  sortOrder: number
  useCount: number
  lastUsedAt?: string
  isDemo?: boolean
  createdAt: string
  updatedAt: string
}

/** Viktregistrering och kroppsmått (alla mått valfria utom att minst ett ska anges). */
export interface Measurement {
  id: ID
  date: string
  time: string
  weightKg?: number
  waistCm?: number
  restingHr?: number
  note?: string
  isDemo?: boolean
  createdAt: string
  updatedAt: string
}

/** Dag – anteckning och markering för en dag. */
export interface DayNote {
  date: string
  note: string
  isDemo?: boolean
  updatedAt: string
}

export type AiStatus = 'vantar' | 'godkand' | 'delvis' | 'avbruten'

/** Sparad AI-tolkning tillsammans med ursprunglig text. */
export interface AiInterpretation {
  id: ID
  createdAt: string
  inputText: string
  /** "foto" när tolkningen gjordes från en bild. */
  inputKind?: 'text' | 'foto'
  /** Liten miniatyr av fotot (sparas bara lokalt). */
  imageThumb?: string
  provider: string
  result: AiResult
  status: AiStatus
  acceptedFoodIds?: ID[]
  acceptedWorkoutIds?: ID[]
}

export interface AiFoodItem extends Nutrition {
  name: string
  amount: number
  unit: Unit
  meal: MealType
  date?: string
  time?: string
  /** Ursprung per fält: mängd kan vara angiven medan kcal är beräknad osv. */
  amountOrigin: ValueOrigin
  nutritionOrigin: ValueOrigin
  note?: string
}

export interface AiWorkoutItem {
  activity: ActivityType
  label?: string
  durationMin: number
  intensity: Intensity
  kcal?: number
  date?: string
  time?: string
  distanceKm?: number
  avgHr?: number
  note?: string
  durationOrigin: ValueOrigin
  kcalOrigin: ValueOrigin
}

export interface AiResult {
  foods: AiFoodItem[]
  workouts: AiWorkoutItem[]
  assumptions: string[]
  uncertainties: string[]
  followUpQuestion?: string
}

export type ExerciseCalorieMode = 'separat' | 'andel' | 'alla'
export type WeighInPolicy = 'forsta' | 'senaste' | 'medel'
export type ThemeSetting = 'system' | 'ljust' | 'morkt'
export type AiProviderId = 'lokal' | 'klistra_in' | 'server'

export interface Settings {
  id: 'settings'
  exerciseCalorieMode: ExerciseCalorieMode
  exerciseCaloriePercent: number
  weighInPolicy: WeighInPolicy
  theme: ThemeSetting
  aiProvider: AiProviderId
  aiEndpoint: string
  aiConsentAt?: string
  /** Separat samtycke för att skicka foton till serverfunktionen. */
  aiPhotoConsentAt?: string
  speechRecognition: boolean
  lastBackupAt?: string
  installHintDismissed: boolean
  demoMode: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  exerciseCalorieMode: 'separat',
  exerciseCaloriePercent: 50,
  weighInPolicy: 'forsta',
  theme: 'system',
  aiProvider: 'lokal',
  aiEndpoint: '',
  speechRecognition: false,
  installHintDismissed: false,
  demoMode: false,
}

/** Säkerhetskopia – format för JSON-export/import. */
export interface Backup {
  app: 'kost-traningsdagbok'
  schemaVersion: number
  exportedAt: string
  data: {
    profile: Profile[]
    goals: Goal[]
    foods: Food[]
    entries: FoodEntry[]
    mealTemplates: MealTemplate[]
    recipes: Recipe[]
    workouts: Workout[]
    workoutTemplates: WorkoutTemplate[]
    measurements: Measurement[]
    dayNotes: DayNote[]
    aiInterpretations: AiInterpretation[]
    settings: Settings[]
  }
}
