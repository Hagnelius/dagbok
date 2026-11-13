import type { Nutrition, Unit } from './types'

/**
 * Inbyggd, liten livsmedelslista med UNGEFÄRLIGA näringsvärden per 100 g (vätskor per 100 ml ≈ 100 g).
 * Värdena är avrundade typvärden i nivå med Livsmedelsverkets livsmedelsdatabas och varierar mellan
 * produkter. De används för sökning, för att räkna om mängder och av den lokala (offline) tolkningen.
 * Alla poster som skapas härifrån markeras som "Uppskattat".
 */
export interface DbFood {
  name: string
  aliases: string[]
  per100: Required<Nutrition>
  /** Gram per enhet. "g" (och "ml" för vätskor) är alltid tillgängliga. */
  units: Partial<Record<Unit, number>>
  defaultUnit: Unit
  defaultAmount: number
  liquid?: boolean
}

type Row = [name: string, aliases: string, kcal: number, protein: number, fat: number, carbs: number, units: Partial<Record<Unit, number>>, def: [Unit, number], liquid?: boolean]

const ROWS: Row[] = [
  // Ägg, mejeri
  ['Ägg', 'ägg,agg,kokt ägg,stekt ägg,äggröra', 140, 12.5, 9.7, 0.3, { st: 55 }, ['st', 1]],
  ['Äggvita', 'äggvita,äggvitor', 48, 10.5, 0.1, 0.7, { st: 33, dl: 100 }, ['st', 1]],
  ['Smör', 'smör,smor', 740, 0.6, 82, 0.6, { msk: 14, tsk: 5, krm: 1 }, ['tsk', 1]],
  ['Bregott/margarin', 'bregott,margarin,lätta,flora', 640, 0.5, 70, 0.5, { msk: 14, tsk: 5 }, ['tsk', 1]],
  ['Olivolja', 'olivolja,olja,rapsolja', 900, 0, 100, 0, { msk: 13, tsk: 4.5, dl: 90 }, ['msk', 1]],
  ['Hårdost 28 %', 'riven ost,ost riven,hårdost,ost,präst,herrgård,cheddar,västerbotten', 380, 26, 30, 0.5, { skiva: 10, dl: 40, msk: 6 }, ['skiva', 2]],
  ['Hårdost 17 %', 'mager ost,lätt ost,17 % ost,17% ost', 290, 29, 17, 0.5, { skiva: 10, dl: 40 }, ['skiva', 2]],
  ['Keso', 'keso,cottage cheese,kesella', 98, 12.5, 4, 2.5, { dl: 90, msk: 15 }, ['g', 100]],
  ['Kvarg naturell', 'kvarg,kvark', 62, 11, 0.2, 3.7, { dl: 100, msk: 15 }, ['g', 250]],
  ['Grekisk yoghurt 10 %', 'grekisk yoghurt,turkisk yoghurt', 120, 4, 10, 4, { dl: 100, msk: 15 }, ['dl', 1.5]],
  ['Yoghurt naturell 3 %', 'yoghurt,naturell yoghurt,filmjölk,fil', 60, 3.5, 3, 4.5, { dl: 100 }, ['dl', 2], true],
  ['Mellanmjölk', 'mjölk,mellanmjölk,mjolk', 46, 3.5, 1.5, 4.8, { dl: 100, st: 200 }, ['dl', 2], true],
  ['Lättmjölk', 'lättmjölk,minimjölk', 37, 3.5, 0.5, 4.9, { dl: 100, st: 200 }, ['dl', 2], true],
  ['Havredryck', 'havremjölk,havredryck,oatly', 46, 1, 1.5, 6.5, { dl: 100 }, ['dl', 2], true],
  ['Färskost', 'färskost,philadelphia,cream cheese', 230, 6, 21, 4, { msk: 15, tsk: 5 }, ['msk', 1]],
  ['Färskost light', 'lätt färskost,färskost light', 150, 7.5, 11, 4.5, { msk: 15, tsk: 5 }, ['msk', 1]],
  ['Mozzarella', 'mozzarella', 250, 18, 19, 1, { st: 125 }, ['g', 60]],
  ['Fetaost', 'feta,fetaost,salladsost', 270, 15, 22, 1, { dl: 50 }, ['g', 30]],
  ['Parmesan', 'parmesan', 400, 35, 28, 0, { msk: 5 }, ['msk', 1]],
  ['Vispgrädde', 'grädde,vispgrädde', 375, 2, 40, 3, { dl: 100, msk: 15 }, ['msk', 1], true],
  ['Matlagningsgrädde 15 %', 'matlagningsgrädde,matgrädde', 165, 3, 15, 4, { dl: 100, msk: 15 }, ['dl', 0.5], true],
  ['Crème fraiche', 'crème fraiche,creme fraiche,gräddfil', 330, 2.2, 34, 3, { msk: 15, dl: 100 }, ['msk', 2]],
  // Pålägg & bröd
  ['Skinka (pålägg)', 'skinka,kokt skinka,rökt skinka', 105, 19, 3, 1, { skiva: 9 }, ['skiva', 3]],
  ['Kalkonpålägg', 'kalkon,kalkonpålägg,kycklingpålägg', 95, 19, 1.5, 1, { skiva: 9 }, ['skiva', 3]],
  ['Leverpastej', 'leverpastej', 260, 10, 21, 7, { msk: 15, skiva: 15 }, ['msk', 1]],
  ['Bröd, fullkorn', 'bröd,rågbröd,fullkornsbröd,limpa,brödskiva,smörgås,macka', 250, 8, 3, 45, { skiva: 35, st: 35 }, ['skiva', 1]],
  ['Formfranska', 'formfranska,vitt bröd,rostbröd,toast', 260, 8, 3.5, 48, { skiva: 30, st: 30 }, ['skiva', 1]],
  ['Knäckebröd', 'knäckebröd,knäcke,knackebrod', 340, 9.5, 2, 65, { skiva: 13, st: 13 }, ['skiva', 2]],
  ['Tortillabröd', 'tortilla,wrap,tortillabröd', 300, 8.5, 7, 50, { st: 40 }, ['st', 1]],
  ['Riskaka', 'riskaka,riskakor', 380, 8, 3, 80, { st: 8 }, ['st', 2]],
  // Frukost
  ['Havregryn', 'havregryn,gryn', 370, 13, 7, 58, { dl: 35 }, ['dl', 1]],
  ['Havregrynsgröt', 'gröt,havregrynsgröt,havregröt', 66, 2.3, 1.3, 10, { portion: 230, dl: 100 }, ['portion', 1]],
  ['Müsli', 'müsli,musli,granola', 370, 9, 7, 62, { dl: 40 }, ['dl', 1]],
  ['Flingor', 'flingor,cornflakes', 380, 7, 1, 84, { dl: 12 }, ['dl', 2]],
  // Mättande tillbehör
  ['Ris, kokt', 'ris,kokt ris,jasminris,basmatiris', 130, 2.7, 0.3, 28, { dl: 80, portion: 150 }, ['portion', 1]],
  ['Pasta, kokt', 'pasta,spaghetti,makaroner,penne,nudlar', 150, 5.5, 0.9, 30, { dl: 50, portion: 200 }, ['portion', 1]],
  ['Potatis, kokt', 'potatis,kokt potatis,potatisar', 80, 2, 0.1, 17, { st: 90, portion: 200 }, ['st', 2]],
  ['Potatismos', 'potatismos,mos', 95, 2, 4, 13, { portion: 200, dl: 100 }, ['portion', 1]],
  ['Pommes frites', 'pommes,pommes frites,strips', 300, 3.5, 15, 37, { portion: 150 }, ['portion', 1]],
  ['Bulgur, kokt', 'bulgur,couscous,matvete', 110, 3.5, 0.5, 22, { dl: 70, portion: 150 }, ['portion', 1]],
  // Kött, fisk, protein
  ['Kycklingfilé, tillagad', 'kyckling,kycklingfilé,kycklingbröst,kycklingfile', 150, 31, 2.5, 0, { st: 150, portion: 150 }, ['g', 150]],
  ['Kycklinglårfilé, tillagad', 'kycklinglår,lårfilé', 190, 26, 9.5, 0, { portion: 150 }, ['g', 150]],
  ['Nötfärs, stekt', 'köttfärs,nötfärs,färs', 210, 27, 11, 0, { portion: 125, dl: 60 }, ['g', 125]],
  ['Köttbullar', 'köttbullar,köttbulle', 220, 14, 14, 9, { st: 15, portion: 150 }, ['st', 8]],
  ['Lax, tillagad', 'lax,laxfilé', 200, 22, 12, 0, { portion: 125, st: 125 }, ['g', 125]],
  ['Torsk, tillagad', 'torsk,vit fisk,sej,kolja,fisk', 95, 21, 1, 0, { portion: 125, st: 125 }, ['g', 125]],
  ['Tonfisk i vatten', 'tonfisk', 110, 25, 1, 0, { st: 120 }, ['st', 1]],
  ['Räkor, skalade', 'räkor,räka', 75, 17, 0.8, 0, { dl: 60 }, ['g', 100]],
  ['Fläskfilé', 'fläskfilé,fläsk,kotlett', 140, 23, 5, 0, { portion: 125 }, ['g', 125]],
  ['Bacon, stekt', 'bacon', 470, 32, 37, 1, { skiva: 8 }, ['skiva', 3]],
  ['Falukorv', 'falukorv,korv', 230, 10, 19, 5, { skiva: 25, portion: 125 }, ['g', 125]],
  ['Grillkorv', 'grillkorv,varmkorv,prinskorv', 250, 11, 21, 3, { st: 50 }, ['st', 2]],
  ['Tofu', 'tofu', 120, 13, 7, 2, { portion: 125 }, ['g', 125]],
  ['Bönor, kokta', 'bönor,kidneybönor,svarta bönor,vita bönor', 115, 8, 0.5, 18, { dl: 75 }, ['dl', 1]],
  ['Linser, kokta', 'linser', 115, 9, 0.4, 20, { dl: 80 }, ['dl', 1]],
  ['Kikärtor, kokta', 'kikärtor', 140, 7.5, 2.5, 21, { dl: 70 }, ['dl', 1]],
  ['Hummus', 'hummus', 250, 7, 18, 13, { msk: 15 }, ['msk', 2]],
  // Frukt och grönt
  ['Banan', 'banan,bananer', 95, 1.2, 0.3, 21, { st: 120 }, ['st', 1]],
  ['Äpple', 'äpple,äpplen,apple', 52, 0.3, 0.2, 12, { st: 150 }, ['st', 1]],
  ['Apelsin', 'apelsin,apelsiner,clementin,mandarin', 47, 0.9, 0.1, 10, { st: 150 }, ['st', 1]],
  ['Päron', 'päron', 55, 0.4, 0.1, 13, { st: 150 }, ['st', 1]],
  ['Blåbär', 'blåbär', 50, 0.7, 0.6, 10, { dl: 65 }, ['dl', 1]],
  ['Jordgubbar', 'jordgubbar,jordgubbe', 35, 0.7, 0.3, 7, { dl: 60, st: 12 }, ['dl', 1]],
  ['Vindruvor', 'vindruvor,druvor', 70, 0.6, 0.2, 17, { dl: 70 }, ['dl', 1]],
  ['Tomat', 'tomat,tomater,körsbärstomater', 20, 0.9, 0.2, 3, { st: 100 }, ['st', 1]],
  ['Gurka', 'gurka', 12, 0.7, 0.1, 2, { st: 300, skiva: 8 }, ['g', 50]],
  ['Paprika', 'paprika', 30, 1, 0.3, 5, { st: 150 }, ['st', 0.5]],
  ['Sallad', 'sallad,isbergssallad,ruccola,spenat,grönsallad', 15, 1.3, 0.2, 1.5, { dl: 20, portion: 50 }, ['portion', 1]],
  ['Broccoli', 'broccoli,blomkål', 35, 3, 0.4, 4.5, { portion: 100, dl: 30 }, ['portion', 1]],
  ['Morot', 'morot,morötter', 40, 0.7, 0.2, 8, { st: 70 }, ['st', 1]],
  ['Lök', 'lök,gul lök,rödlök', 40, 1.2, 0.1, 8, { st: 100, msk: 10 }, ['st', 0.5]],
  ['Purjolök', 'purjolök,purjo', 35, 1.5, 0.3, 6, { msk: 6, dl: 40, st: 200 }, ['msk', 2]],
  ['Avokado', 'avokado', 200, 2, 20, 2, { st: 150 }, ['st', 0.5]],
  ['Majs', 'majs', 90, 3, 1.5, 15, { dl: 65, msk: 10 }, ['dl', 0.5]],
  ['Ärtor', 'ärtor,gröna ärtor', 75, 5, 0.4, 10, { dl: 60 }, ['dl', 1]],
  ['Wokgrönsaker', 'wokgrönsaker,grönsaker,frysta grönsaker', 35, 2, 0.3, 5, { portion: 150, dl: 40 }, ['portion', 1]],
  // Snacks och sött
  ['Jordnötssmör', 'jordnötssmör', 600, 25, 50, 12, { msk: 16, tsk: 6 }, ['msk', 1]],
  ['Nötter, blandade', 'nötter,cashew,valnötter,jordnötter', 620, 20, 54, 12, { dl: 60, portion: 30 }, ['portion', 1]],
  ['Mandlar', 'mandlar,mandel', 600, 21, 52, 6, { st: 1.2, dl: 60, portion: 30 }, ['portion', 1]],
  ['Popcorn', 'popcorn', 480, 9, 25, 55, { portion: 30, dl: 1 }, ['portion', 1]],
  ['Mörk choklad 70 %', 'mörk choklad', 580, 8, 42, 34, { st: 10 }, ['st', 2]],
  ['Mjölkchoklad', 'choklad,mjölkchoklad,marabou', 540, 7, 31, 56, { st: 10 }, ['st', 2]],
  ['Chips', 'chips', 540, 6, 34, 50, { portion: 50, dl: 8 }, ['portion', 1]],
  ['Glass', 'glass,vaniljglass', 200, 3.5, 11, 22, { dl: 50, portion: 100 }, ['portion', 1]],
  ['Kanelbulle', 'kanelbulle,bulle,vetebulle', 330, 6.5, 12, 49, { st: 70 }, ['st', 1]],
  ['Kaka/kex', 'kaka,kakor,kex,småkaka,digestive', 480, 6, 22, 64, { st: 15 }, ['st', 2]],
  ['Socker', 'socker,strösocker', 400, 0, 0, 100, { tsk: 4, msk: 12, krm: 1 }, ['tsk', 1]],
  ['Honung', 'honung', 300, 0.3, 0, 82, { tsk: 7, msk: 21 }, ['tsk', 1]],
  ['Sylt', 'sylt,marmelad', 180, 0.4, 0.1, 44, { msk: 20, tsk: 7 }, ['msk', 1]],
  ['Majonnäs', 'majonnäs,majonäs,aioli', 700, 1, 78, 1.5, { msk: 15, tsk: 5 }, ['msk', 1]],
  ['Ketchup', 'ketchup', 110, 1.3, 0.2, 25, { msk: 17 }, ['msk', 1]],
  // Färdiga rätter
  ['Pizza', 'pizza', 250, 11, 9, 30, { st: 400, portion: 400 }, ['st', 1]],
  ['Hamburgare med bröd', 'hamburgare,burgare,burgare', 250, 13, 11, 25, { st: 220 }, ['st', 1]],
  ['Sushi', 'sushi,sushibit', 150, 5.5, 2.5, 26, { st: 30, portion: 300 }, ['st', 10]],
  ['Lasagne', 'lasagne', 160, 8, 8, 13, { portion: 350 }, ['portion', 1]],
  ['Spaghetti med köttfärssås', 'köttfärssås,spaghetti bolognese,bolognese', 140, 7, 5, 16, { portion: 400 }, ['portion', 1]],
  ['Pannkaka', 'pannkaka,pannkakor', 190, 6.5, 8, 22, { st: 70 }, ['st', 2]],
  ['Kebab/tallrik', 'kebab,kebabtallrik', 200, 10, 11, 16, { portion: 500 }, ['portion', 1]],
  // Proteinprodukter
  ['Proteinpulver (vassle)', 'proteinpulver,proteinshake,shake,whey,vassle,proteindrink', 380, 75, 6, 7, { portion: 30, msk: 10 }, ['portion', 1]],
  ['Proteinbar', 'proteinbar,proteinbars', 350, 33, 12, 30, { st: 60 }, ['st', 1]],
  ['Proteinpudding', 'proteinpudding,pudding', 70, 10, 1.5, 4, { st: 200 }, ['st', 1]],
  ['Proteinyoghurt', 'proteinyoghurt,proteinkvarg', 60, 10, 0.3, 4, { st: 200, dl: 100 }, ['st', 1]],
  // Dryck
  ['Kaffe, svart', 'kaffe,svart kaffe,espresso,bryggkaffe', 2, 0.1, 0, 0, { st: 150, dl: 100 }, ['st', 1], true],
  ['Kaffe latte', 'latte,cappuccino,kaffe med mjölk,cafe latte', 45, 3, 1.7, 4.5, { st: 300, dl: 100 }, ['st', 1], true],
  ['Te', 'te', 1, 0, 0, 0.2, { st: 250, dl: 100 }, ['st', 1], true],
  ['Apelsinjuice', 'juice,apelsinjuice', 45, 0.7, 0.1, 10, { st: 200, dl: 100 }, ['st', 1], true],
  ['Läsk', 'läsk,cola,fanta,sprite', 42, 0, 0, 10.5, { st: 330, dl: 100 }, ['st', 1], true],
  ['Läsk, sockerfri', 'lättläsk,cola zero,pepsi max,sockerfri läsk,zero', 0.5, 0, 0, 0.1, { st: 330, dl: 100 }, ['st', 1], true],
  ['Öl 5 %', 'öl,starköl,lager,ipa', 43, 0.4, 0, 3.5, { st: 330, dl: 100 }, ['st', 1], true],
  ['Lättöl', 'lättöl,folköl', 30, 0.3, 0, 4, { st: 330, dl: 100 }, ['st', 1], true],
  ['Vin', 'vin,rödvin,vitt vin,vitvin', 75, 0.1, 0, 2.5, { st: 150, dl: 100 }, ['st', 1], true],
  ['Sportdryck', 'sportdryck,powerade,gatorade', 26, 0, 0, 6.4, { st: 500, dl: 100 }, ['st', 1], true],
  ['Vatten', 'vatten,kranvatten,mineralvatten,bubbelvatten', 0, 0, 0, 0, { st: 250, dl: 100 }, ['st', 1], true],
]

export const FOOD_DB: DbFood[] = ROWS.map(([name, aliases, kcal, protein, fat, carbs, units, def, liquid]) => ({
  name,
  aliases: aliases.split(',').map((a) => a.trim().toLowerCase()),
  per100: { kcal, protein, fat, carbs },
  units: withSpoonUnits({ g: 1, ...(liquid ? { ml: 1, dl: 100 } : {}), ...units }, !!liquid),
  defaultUnit: def[0],
  defaultAmount: def[1],
  liquid,
}))

/**
 * Fyller i sked- och kryddmått utifrån deciliter (1 msk = 15 ml, 1 tsk = 5 ml, 1 krm = 1 ml),
 * så att t.ex. "2 msk mjölk" kan räknas fram. Uttryckligen angivna värden behålls.
 */
function withSpoonUnits(units: Partial<Record<Unit, number>>, liquid: boolean): Partial<Record<Unit, number>> {
  const out = { ...units }
  const gPerDl = out.dl ?? (liquid ? 100 : undefined)
  if (gPerDl !== undefined) {
    out.msk ??= Math.round(gPerDl * 0.15 * 10) / 10
    out.tsk ??= Math.round(gPerDl * 0.05 * 10) / 10
    out.krm ??= Math.round(gPerDl * 0.01 * 100) / 100
    if (liquid) out.ml ??= gPerDl / 100
  }
  return out
}

/** Hittar ett livsmedel i listan på exakt namn eller alias. */
export function findDbFood(name: string): DbFood | undefined {
  const n = name.trim().toLowerCase()
  return FOOD_DB.find((f) => f.name.toLowerCase() === n) ?? FOOD_DB.find((f) => f.aliases.includes(n))
}

/** Gram för en mängd, eller undefined om enheten inte är känd för livsmedlet. */
export function gramsFor(food: DbFood, amount: number, unit: Unit): number | undefined {
  const g = food.units[unit]
  return g === undefined ? undefined : amount * g
}

export function nutritionFor(food: DbFood, amount: number, unit: Unit): Nutrition | undefined {
  const g = gramsFor(food, amount, unit)
  if (g === undefined) return undefined
  const f = g / 100
  const r1 = (x: number) => Math.round(x * f * 10) / 10
  return { kcal: Math.round(food.per100.kcal * f), protein: r1(food.per100.protein), fat: r1(food.per100.fat), carbs: r1(food.per100.carbs) }
}

const norm = (s: string) => s.toLowerCase().normalize('NFC').trim()

/** Enkel sökning: träff i början av namn/alias rankas högst. */
export function searchFoodDb(query: string, limit = 12): DbFood[] {
  const q = norm(query)
  if (!q) return []
  const scored: Array<[number, DbFood]> = []
  for (const f of FOOD_DB) {
    const names = [f.name.toLowerCase(), ...f.aliases]
    let best = 0
    for (const n of names) {
      if (n === q) best = Math.max(best, 100)
      else if (n.startsWith(q)) best = Math.max(best, 80 - n.length / 10)
      else if (n.includes(q)) best = Math.max(best, 50 - n.length / 10)
    }
    if (best > 0) scored.push([best, f])
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map((x) => x[1])
}

/** Hittar det livsmedel vars alias ger längst ordträff i texten. Returnerar position för träffen. */
export function findFoodInText(text: string): { food: DbFood; index: number; alias: string } | undefined {
  const t = ' ' + norm(text).replace(/[.,!?;:]/g, ' ') + ' '
  let best: { food: DbFood; index: number; alias: string } | undefined
  for (const f of FOOD_DB) {
    for (const a of f.aliases) {
      // Matcha hela ord, tillåt böjningsändelser (t.ex. "skinkan", "bananer").
      const re = new RegExp(`(^|[\\s])${escapeRe(a)}(?:en|na|er|ar|or|n|et|t|s)?(?=[\\s])`, 'u')
      const m = re.exec(t)
      if (m && (!best || a.length > best.alias.length)) best = { food: f, index: m.index + m[1].length - 1, alias: a }
    }
  }
  return best
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
