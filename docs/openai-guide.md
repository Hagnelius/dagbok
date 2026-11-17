# AI-tolkning med OpenAI (GPT-6 Luna)

Appen skickar text och foton till en egen liten serverfunktion på Cloudflare. Funktionen skickar dem vidare till OpenAI. API-nyckeln finns bara i serverfunktionen, aldrig i appen. Ingenting sparas i dagboken förrän du har granskat och godkänt tolkningen.

## Kostnad

GPT-6 Luna kostar 0,10 dollar per miljon tokens in och 0,50 dollar per miljon tokens ut (november 2026). En tolkning kostar en bråkdel av ett öre, ett foto lite mer. Sätt ändå en månadsgräns hos OpenAI: **platform.openai.com → Settings → Limits**.

## Inställningar i Cloudflare

Gå till Workers & Pages → `dagbok-ai` → **Settings → Variables and Secrets**.

| Namn | Typ | Värde |
|---|---|---|
| `OPENAI_API_KEY` | Secret | Din nyckel från platform.openai.com |
| `APP_TOKEN` | Secret | Valfri lång kod, samma som **Åtkomstkod** i appen |
| `ALLOWED_ORIGIN` | Text | `https://hagnelius.github.io` |
| `AI_PROVIDER` | Text | `openai` |
| `AI_MODEL` | Text, valfri | `gpt-6-luna` (standard) |
| `AI_REASONING` | Text, valfri | `none`, `low` (standard), `medium` eller `high` |

`AI_REASONING` styr hur länge modellen "tänker". `none` ger snabbast svar och `low` en bra balans. Med `medium` eller högre blir svaren långsammare men inte nödvändigtvis bättre för den här uppgiften.

## Uppdatera serverfunktionen

Koden finns i `server/cloudflare-worker-bundle.js`, som byggs från `server/shared.mjs` med `npm run bundle:worker`. Klistra in hela filen under **Edit code** och klicka på **Deploy**.

## Felsökning

Appen visar orsaken när något går fel. Mer detaljer finns under **Observability → Events** för `dagbok-ai`.

- **401** – nyckeln är fel eller borttagen.
- **429** – kvoten eller utgiftstaket är nått.
- **Svarade inte i tid** – försök igen. Om det händer ofta, sätt `AI_REASONING` till `none`.
