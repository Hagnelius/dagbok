import Dexie, { type EntityTable } from 'dexie'
import type {
  AiInterpretation, DayNote, Food, FoodEntry, Goal, MealTemplate, Measurement, Profile,
  Recipe, Settings, Workout, WorkoutTemplate,
} from './types'

/**
 * Lokal databas i IndexedDB (via Dexie). Alla tabeller använder stabila id:n (UUID) så att
 * molnsynkronisering kan läggas till senare utan att datamodellen behöver ändras.
 */
export class DagbokDB extends Dexie {
  profile!: EntityTable<Profile, 'id'>
  goals!: EntityTable<Goal, 'id'>
  foods!: EntityTable<Food, 'id'>
  entries!: EntityTable<FoodEntry, 'id'>
  mealTemplates!: EntityTable<MealTemplate, 'id'>
  recipes!: EntityTable<Recipe, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  workoutTemplates!: EntityTable<WorkoutTemplate, 'id'>
  measurements!: EntityTable<Measurement, 'id'>
  dayNotes!: EntityTable<DayNote, 'date'>
  aiInterpretations!: EntityTable<AiInterpretation, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor(name = 'kost-traningsdagbok') {
    super(name)
    this.version(1).stores({
      profile: 'id',
      goals: 'id, validFrom',
      foods: 'id, name, useCount, sortOrder',
      entries: 'id, date, [date+meal], groupId, sourceId, isDemo',
      mealTemplates: 'id, name, useCount, sortOrder',
      recipes: 'id, name, useCount, sortOrder',
      workouts: 'id, date, activity, isDemo',
      workoutTemplates: 'id, name, useCount, sortOrder',
      measurements: 'id, date, isDemo',
      dayNotes: 'date',
      aiInterpretations: 'id, createdAt',
      settings: 'id',
    })
  }
}

export const db = new DagbokDB()

export const ALL_TABLES = [
  'profile', 'goals', 'foods', 'entries', 'mealTemplates', 'recipes', 'workouts',
  'workoutTemplates', 'measurements', 'dayNotes', 'aiInterpretations', 'settings',
] as const
export type TableName = (typeof ALL_TABLES)[number]

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const nowIso = () => new Date().toISOString()
