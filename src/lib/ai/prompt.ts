/**
 * Instruktion till en språkmodell. Används både av serverfunktionen och av läget "Klistra in AI-svar".
 * Endast användarens text, dagens datum och (valfritt) kroppsvikt skickas – inga andra personuppgifter.
 */
export function buildPrompt(text: string, today: string, now: string, weightKg?: number, photo = false): string {
  const intro = photo
    ? `Du analyserar ett bifogat foto av en måltid och gör en realistisk uppskattning av vad den innehåller, som JSON.
Bedöm livsmedel och mängder utifrån det som syns (tallrikens storlek, bestick och förpackningar ger skala).
Mängder och näring från fotot är "uppskattat", eller "osakert" om du är osäker. Det användaren skriver i texten nedan är "angivet" och går före bilden.
Tänk på dolda kalorier (olja, smör, sås, dressing) och nämn dem som antaganden. Ställ en följdfråga om något avgörande inte syns.`
    : 'Du tolkar en svensk dagboksanteckning om mat och/eller träning till JSON.'
  return `${intro}
Dagens datum: ${today}. Klockan: ${now}.${weightKg ? ` Kroppsvikt: ${weightKg} kg (för att uppskatta träningskalorier).` : ''}

Svara ENDAST med JSON enligt detta schema:
{
  "foods": [{
    "name": "livsmedel på svenska", "amount": number, "unit": "g|ml|dl|st|portion|skiva|msk|tsk|krm",
    "kcal": number, "protein": number, "fat": number, "carbs": number,
    "meal": "frukost|lunch|middag|mellanmal|dryck",
    "date": "YYYY-MM-DD (om nämnt)", "time": "HH:mm (om nämnt)",
    "amountOrigin": "angivet|uppskattat|osakert", "nutritionOrigin": "beraknat|uppskattat|osakert",
    "note": "kort kommentar vid behov"
  }],
  "workouts": [{
    "activity": "promenad|lopning|cykling|crosstrainer|gym|fotboll|simning|annat", "label": "valfri beskrivning",
    "durationMin": number, "intensity": "lag|medel|hog", "kcal": number,
    "date": "YYYY-MM-DD", "time": "HH:mm", "distanceKm": number, "avgHr": number, "note": "",
    "durationOrigin": "angivet|uppskattat|osakert", "kcalOrigin": "uppskattat|osakert"
  }],
  "assumptions": ["antaganden du gjort, på svenska"],
  "uncertainties": ["osäkerheter, på svenska"],
  "followUpQuestion": "EN kort fråga endast om en saknad uppgift har stor betydelse för beräkningen, annars utelämna"
}

Regler:
- Dela upp måltider i enskilda livsmedel. Näringsvärden avser den angivna mängden, inte per 100 g.
- Använd svenska typvärden (Livsmedelsverket) och var realistisk. Ange "angivet" endast för sådant som står i texten.
- Träningskalorier är nettoförbrukning utöver vila och alltid "uppskattat".
- Hitta inte på mat eller träning som inte nämns.

${photo ? 'Användarens kommentar till fotot' : 'Text'}:
"""${text.slice(0, 2000) || '(ingen kommentar)'}"""`
}
