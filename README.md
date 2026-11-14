# Kost- och träningsdagbok

En personlig kost- och träningsdagbok byggd som en Progressive Web App (PWA) för iPhone. Appen är på svenska, fungerar offline, lagrar allt lokalt på enheten och är gjord för att användas flera gånger om dagen – snabbt och med en hand.

**Öppna appen:** <https://hagnelius.github.io/dagbok/> – öppna i Safari på iPhone och välj Dela → Lägg till på hemskärmen.

**Fokus:** viktnedgång med bibehållen muskelmassa, bättre kondition och fotbollsform. Appen visar trender och veckosnitt snarare än att bedöma enskilda dagar.

---

## Innehåll

1. [Vad appen gör](#vad-appen-gör)
2. [Kom igång lokalt](#kom-igång-lokalt)
3. [Produktionsbygge och tester](#produktionsbygge-och-tester)
4. [Öppna appen på iPhone och lägga den på hemskärmen](#öppna-appen-på-iphone)
5. [Driftsättning](#driftsättning)
6. [Datalagring och integritet](#datalagring-och-integritet)
7. [Säkerhetskopiering](#säkerhetskopiering)
8. [AI-integration](#ai-integration)
9. [Beräkningar](#beräkningar)
10. [Teknisk arkitektur och datamodell](#teknisk-arkitektur-och-datamodell)
11. [Antaganden och begränsningar](#antaganden-och-begränsningar)

---

## Vad appen gör

| Vy | Innehåll |
|---|---|
| **Idag** | Kalorier och protein mot dagens mål med progressindikatorer, en träningsstapel för extrakalorier från dagens träning, kvarvarande värden, träning, senaste vikt, kort neutral återkoppling, 7-dagarssnitt, snabbknappar, dagens måltider (frukost, lunch, middag, mellanmål, dryck), träningspass, mått och dagsanteckning. Bläddra mellan dagar med pilarna. |
| **Lägg till (+)** | Snabbregistrera · Mat · Träning · Vikt och mått · Skriv eller prata in. |
| **Snabbregistrera** | Mest använda överst (lär sig av lokal användning), standardmåltider, favoritlivsmedel, recept och senast registrerade. Ett tryck på **+** lägger till direkt; kryssa flera och justera antal med −/+ för att lägga till allt på en gång. |
| **Mat** | Sök (egna livsmedel, tidigare registreringar och en inbyggd lista med ~110 vanliga livsmedel), manuell registrering och kopiering av måltider eller hela dagar från tidigare dagar. |
| **Träning** | Snabbval från mallar (ett tryck sparar), eller formulär med aktivitet, tid, intensitet, valfri förbrukning, distans, puls och upplevd ansträngning (1–10). |
| **Vikt och mått** | Vikt, midjemått, vilopuls och anteckning. Senaste vikt, förändring sedan start, senaste 7 och 30 dagarna, rullande 7-dagarssnitt, avstånd till målvikt och diagram. |
| **Skriv eller prata in** | Stort textfält för vanlig svenska (fungerar med iPhones diktering). Tolkas till ett förslag som granskas, ändras och godkänns helt eller delvis innan något sparas. |
| **Fota maten** | Ta ett foto (eller välj en bild) och skriv ev. en kommentar. AI gör en uppskattning av livsmedel och mängder som granskas och bekräftas på samma sätt. |
| **Historik** | Kalender med markeringar för mat, träning och vikt, veckosammanfattningar och sökning i hela historiken. |
| **Analys** | Dag, vecka, månad eller eget intervall: snitt för kalorier och protein, registrerade dagar, proteinmål nått, kalorier mot mål, träningspass, total tid, fördelning per aktivitet och vikttrend – med diagram och tabellvy. |
| **Favoriter och mallar** | Livsmedel, standardmåltider, recept (räknas om per portion) och träningsmallar. Skapa, redigera, duplicera, ta bort, ändra ordning och markera som favorit. |
| **Inställningar** | Profil och mål (med transparent beräkning), hantering av träningskalorier, vägningsregel, tema, AI, export/import, CSV, demoläge, radering och installationsinstruktion. |

Övrigt: ljust och mörkt läge, offlinestöd, iPhone safe areas, tryckytor på minst 44 × 44 punkter, inga zoomande formulärfält, ångra vid borttagning och tydlig bekräftelse efter varje registrering.

---

## Kom igång lokalt

Krav: **Node.js 20 eller senare** (testat med Node 22).

```bash
npm install
npm run dev
```

Öppna adressen som visas (normalt <http://localhost:5173>). Första gången visas introduktionen där du anger dina uppgifter och får ett förslag på mål.

> Service workern (offlinestödet) är bara aktiv i produktionsbygget, inte i `npm run dev`.

## Produktionsbygge och tester

```bash
npm run build      # typkontroll + bygge till dist/
npm run preview    # serverar dist/ på http://localhost:4173

npm run lint       # oxlint
npm run typecheck  # TypeScript
npm test           # enhetstester (Vitest) + test av AI-serverfunktionen
npm run check      # allt ovan + bygge
```

**End-to-end-test** (kräver Python och Playwright med Chromium):

```bash
npm run build && npm run preview &
npm run test:e2e   # skärmbilder hamnar i e2e-shots/
```

E2E-testet går igenom hela appen i en iPhone-stor vy (390 × 844): introduktion med validering, snabbregistrering, manuell registrering, redigering, AI-flödet (lokalt och via en låtsasserver – inklusive att inget skickas före samtycke och att inget sparas före godkännande), träning, vikt, demodata, analys, historik, mörkt läge, offline efter första laddningen, PWA-manifest och ikoner samt datorvy.

Enhetstesterna täcker bland annat: summering av kalorier och protein, recept per portion, att veckosnitt inte räknar dagar utan data som nolldagar, att redigering och borttagning uppdaterar totalsummor, kopiering mellan dagar, vikttrend och flera vägningar per dag, svensk tidszon över sommartidsbyten, export → import, avvisning av ogiltiga säkerhetskopior, CSV-format, tolkning av exempeltexterna och att AI-förslag inte sparas utan godkännande.

---

## Öppna appen på iPhone

En PWA måste serveras över **HTTPS** för att kunna installeras och fungera offline. Enklast är att driftsätta den (se nedan) och öppna adressen i Safari.

**Lägg till på hemskärmen:**

1. Öppna appens adress i **Safari** på iPhone.
2. Tryck på **Dela** (fyrkanten med pil uppåt).
3. Välj **Lägg till på hemskärmen** och tryck **Lägg till**.
4. Starta appen från hemskärmsikonen. Den öppnas i helskärm, utan Safaris adressfält, och fungerar offline.

Appen visar en diskret påminnelse om detta i Safari tills den är installerad eller du stänger påminnelsen.

**Snabbtest i lokalt nätverk:** `npm run dev` startar med `--host`, så du kan öppna `http://<datorns-ip>:5173` från iPhone i samma wifi. Appen fungerar då, men utan offlinestöd och installation (iOS kräver HTTPS för service workers).

> **Viktigt om iOS:** En installerad hemskärmsapp har sin egen lagring, skild från Safari. Data som registrerats i Safari följer inte med till hemskärmsappen. Installera först och börja registrera sedan – eller flytta data med export/import.

---

## Driftsättning

Appen är en helt statisk webbplats (mappen `dist/`) och kan läggas på valfri statisk webbhotell med HTTPS. Den använder relativa sökvägar och hash-adresser, så ingen serverkonfiguration behövs.

**GitHub Pages (förberett):**

1. Lägg projektet i ett GitHub-repo.
2. Gå till *Settings → Pages* och välj *Source: GitHub Actions*.
3. Pusha till `main`. Arbetsflödet `.github/workflows/deploy.yml` kör lint, typkontroll, tester och bygge och publicerar sedan.
4. Appen nås på `https://<användarnamn>.github.io/<repo>/`.

**Andra alternativ:** Netlify, Cloudflare Pages eller Vercel – byggkommando `npm run build`, publiceringsmapp `dist`.

Uppdateringar hämtas automatiskt: service workern laddar ned den nya versionen i bakgrunden och den används nästa gång appen startas.

---

## Datalagring och integritet

- All data lagras **lokalt i webbläsarens IndexedDB** på enheten (via Dexie). Det finns inget konto, ingen server och ingen molnlagring.
- Appen begär *beständig lagring* (`navigator.storage.persist`) för att minska risken att webbläsaren rensar data.
- Ingen data lämnar enheten, med ett enda undantag: om du själv aktiverar AI-läget *Egen serverfunktion* skickas den text du ber om att få tolkad (se nedan).
- Hälsouppgifter du skriver i introduktionen sparas bara som en lokal anteckning och skickas aldrig till AI.
- Testdata (demoläge) märks med `isDemo: true`, visas med en tydlig banderoll och kan rensas med en knapp utan att riktiga registreringar påverkas.

**Risk för dataförlust:** data kan försvinna om webbläsardata raderas, om hemskärmsappen tas bort eller om iOS rensar lagring för appar som inte använts på länge. Gör säkerhetskopior regelbundet.

## Säkerhetskopiering

Under *Inställningar → Data och säkerhetskopiering*:

- **Exportera säkerhetskopia (JSON)** – all data i en fil. På iPhone öppnas delningsmenyn så att filen kan sparas i *Filer* eller iCloud Drive. Datum för senaste säkerhetskopia visas.
- **Importera säkerhetskopia** – filen valideras först (format, version, id:n, datum och obligatoriska fält). Du ser vad filen innehåller och måste bekräfta innan befintlig data ersätts. Importen sker i en transaktion – allt eller inget.
- **Exportera CSV** – mat, träning eller vikt för valfri period (semikolon och decimalkomma för svenska Excel/Numbers).
- **Radera all lokal data** – med dubbel bekräftelse.

AI-serverns åtkomstkod ingår inte i säkerhetskopian.

---

## AI-integration

Funktionen **Skriv eller prata in** är fristående från resten av appen. Allt annat fungerar utan AI. Oavsett metod gäller:

- Resultatet sparas **aldrig direkt**. En granskningsvy visar varje post med markeringarna *Angivet*, *Beräknat*, *Uppskattat* och *Osäkert*. Du kan ändra namn, mängd (näring räknas om), kalorier, protein, måltid, aktivitet, tid och intensitet, avmarkera poster, godkänna allt eller delar, eller avbryta.
- Antaganden och osäkerheter visas. En kort följdfråga ställs bara när en saknad uppgift påverkar beräkningen mycket.
- Ursprunglig text sparas tillsammans med tolkningen och dess status (*ej granskad*, *godkänd*, *delvis godkänd*, *avbruten*), och varje skapad post länkas till tolkningen.
- Alla svar valideras och rensas i klienten (`normalizeAiResult`) innan de visas.

Välj metod under *Inställningar → AI-tolkning*:

### 1. Lokal tolkning (standard)

Regelbaserad tolkning direkt på enheten, utan nätverk. Förstår svenska meningar med mängd, enhet och livsmedel (t.ex. *”tre ägg”, ”30 gram riven ost”, ”en halv tomat”, ”två matskedar purjolök”, ”lite smör”*), måltid (*”till lunch”*), *”igår”* och träning med tid och intensitet (*”45 minuter crosstrainer och sedan 45 minuter gym med medelintensitet”*). Näringsvärden kommer från den inbyggda livsmedelslistan. Okända livsmedel visas som osäkra poster där du fyller i värden.

### 2. Klistra in AI-svar

Appen skapar en färdig instruktion med din text. Kopiera den till valfri AI-tjänst (t.ex. Claude-appen), kopiera svaret och klistra in det i appen. Ingen nyckel behövs och inget skickas automatiskt.

### 3. Egen serverfunktion

För full AI-tolkning direkt i appen. **API-nyckeln ligger bara på servern – aldrig i klientkoden.**

Det som skickas från appen är endast: texten (max 2 000 tecken), dagens datum och klockslag samt senaste vikt (för träningskalorier). Första gången visas en dialog som förklarar exakt vad som skickas och vart; inget skickas förrän du godkänt. Samtycket kan återkallas.

**Driftsätta på Cloudflare Workers** (gratisnivån räcker):

```bash
cd server
npx wrangler login
# Redigera wrangler.toml: ALLOWED_ORIGIN = din apps adress, t.ex. https://namn.github.io
npx wrangler secret put ANTHROPIC_API_KEY   # din API-nyckel
npx wrangler secret put APP_TOKEN           # valfri lång slumpkod
npx wrangler deploy
```

Ange sedan Workerns adress (t.ex. `https://dagbok-ai.<konto>.workers.dev`) och åtkomstkoden i appen under *Inställningar → AI-tolkning → Egen serverfunktion*.

**Lokalt för test:**

```bash
ANTHROPIC_API_KEY=... ALLOWED_ORIGIN=http://localhost:5173 npm run ai-server
# adress i appen: http://localhost:8787/tolka
```

Miljövariabler:

| Variabel | Beskrivning |
|---|---|
| `ANTHROPIC_API_KEY` | Nyckel för Anthropic (standard). |
| `AI_PROVIDER` | `anthropic` (standard) eller `openai`. |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` | För OpenAI eller annan OpenAI-kompatibel tjänst. |
| `AI_MODEL` | Modellnamn. Ange en aktuell modell från leverantörens dokumentation. |
| `ALLOWED_ORIGIN` | Kommaseparerade adresser som får anropa funktionen (CORS + kontroll). |
| `APP_TOKEN` | Valfri åtkomstkod som appen skickar som `Authorization: Bearer`. |

Servern validerar indata, begränsar textlängden, loggar aldrig texten och nekar anrop från andra adresser eller med fel åtkomstkod.

**Lägga till en annan leverantör i appen:** implementera gränssnittet `AiProvider` i `src/lib/ai/providers.ts`.

### Fota maten

Fotoläget nås via **+ → Fota maten**, snabbknappen på Idag eller fliken **Foto** i Skriv eller prata in.

- Bilden förminskas i telefonen till högst 1 280 px och kodas om till JPEG. Det tar bort all metadata, t.ex. GPS-position.
- Med **Egen serverfunktion** skickas bilden, din kommentar, datum/tid och senaste vikt till servern. Ett separat samtycke för foton krävs första gången.
- Utan server används **Klistra in AI-svar**: appen kopierar en instruktion, du delar fotot till t.ex. Claude-appen, skickar och klistrar tillbaka svaret.
- Den lokala tolkningen kan inte analysera bilder.
- En liten miniatyr sparas lokalt tillsammans med tolkningen; originalbilden sparas inte.
- Fotouppskattningar är grova – särskilt dolda fetter, såser och portionsstorlek. Justera i granskningen.

### Diktering

Textfältet fungerar med tangentbordets **mikrofonknapp** på iPhone, som alltid är huvudvägen. Texten sparas som utkast om du lämnar vyn. Som valfri förbättring kan en knapp för webbläsarens taligenkänning slås på under Inställningar (avstängd som standard, eftersom ljudet kan behandlas av webbläsarens leverantör).

---

## Beräkningar

All logik finns i `src/lib/` och visas transparent i appen.

**Energimål** (`calc.ts`):

1. Basalomsättning enligt **Mifflin–St Jeor**: `10 × vikt + 6,25 × längd − 5 × ålder + s` där s = +5 (man), −161 (kvinna) eller −78 (ej angivet, medelvärde).
2. × aktivitetsfaktor för vardagen *utan träning*: 1,2 / 1,35 / 1,5 / 1,65.
3. + planerad träning: pass per vecka × 300 kcal ÷ 7 – endast när träningskalorier *inte* läggs till budgeten (annars skulle träningen räknas två gånger).
4. − underskott: takt (kg/vecka) × 7 700 kcal ÷ 7, **begränsat** till högst 25 % av energibehovet och aldrig under max(BMR, 1 500 kcal för män / 1 200 kcal för kvinnor).
5. Neutral varning om takten överstiger 1 % av kroppsvikten per vecka, om underskottet har begränsats eller om målvikten ger BMI < 18,5 – med en knapp för att använda en säkrare takt.

**Protein:** 1,8 g/kg referensvikt (2,0 g/kg när *behålla muskelmassa* valts och underskott finns). Referensvikt = målvikten om den är lägre än nuvarande vikt. **Fett** ≈ 30 % av energin, **kolhydrater** = resten. Du kan alltid ange egna mål i stället. Mål sparas med giltighetsdatum så att äldre dagar jämförs mot det mål som gällde då.

**Byte av mängd eller enhet** (`units.ts`): näringsvärdena räknas om proportionellt. Mellan volymenheter (dl, msk = 15 ml, tsk = 5 ml, krm, ml) räknas det direkt; mellan t.ex. st och g används livsmedelslistans gramvikter. Går det inte (okänt livsmedel från st till g) visas en uppmaning att kontrollera värdena. Egna inskrivna värden blir nytt utgångsläge.

**Träningskalorier** (`exercise.ts`): nettoförbrukning = (MET − 1) × kroppsvikt × timmar, med MET-värden per aktivitet och intensitet. Visas alltid som uppskattning (≈) om du inte angett eget värde. Inställningen styr om de visas separat, läggs till med vald andel (standard 75 %) eller läggs till helt. Den tillagda delen visas som en egen träningsstapel: grundmålet fylls först, därefter träningsstapeln, och det som går över båda visas som överskott.

**Snitt och trender** (`stats.ts`): dagar utan registrerad mat räknas **inte** som nolldagar. Pågående dag räknas inte in i veckosnitt om du inte väljer det. Vid flera vägningar samma dag används dagens första (eller senaste/medel enligt inställning). Viktförändringar jämför rullande 7-dagarssnitt.

**Återkoppling** (`feedback.ts`): lokala, förutsägbara regler – ingen generativ AI. Kort och saklig, utan värderande ord om mat.

---

## Teknisk arkitektur och datamodell

**Teknik:** React 19 · TypeScript · Vite · Tailwind CSS 4 · Dexie (IndexedDB) · Recharts · vite-plugin-pwa (Workbox) · Vitest · Playwright.

```
src/
  App.tsx              Skal, navigation, tema, routing
  router.ts            Minimal hash-router (fungerar offline och på statisk hosting)
  hooks.ts             Reaktiva data-hooks (useDay, useSettings …)
  components/          UI-komponenter, diagram, redigeringsformulär
  pages/               Vyer: Idag/Dag, Lägg till mat, Träning, Vikt, AI, Historik, Analys, Favoriter, Inställningar, Introduktion
  lib/
    types.ts           Datamodell
    db.ts              IndexedDB-schema
    repo.ts            Dataoperationer (lägg till, redigera, kopiera, mallar …)
    calc.ts            Mål och säkerhetsgränser
    exercise.ts        MET-uppskattning
    nutrition.ts       Summering, recept, dagsbudget
    stats.ts           Period-, vecko- och viktstatistik
    feedback.ts        Regelbaserad återkoppling
    backup.ts          Export, validering, import, CSV
    foodDb.ts          Inbyggd livsmedelslista
    demo.ts            Demodata och startfavoriter
    ai/                Leverantörsabstraktion, lokal tolkning, prompt, validering, godkännande
server/                AI-serverfunktion (Cloudflare Worker + lokal Node-server)
e2e/                   End-to-end-test
```

**Datamodell** (`src/lib/types.ts`) – alla poster har stabila UUID:n, datum lagras som svenska datumnycklar (`YYYY-MM-DD`, Europe/Stockholm) och tider som `HH:mm`:

| Objekt | Tabell | Kommentar |
|---|---|---|
| Användarprofil | `profile` | En post (`id: "me"`). |
| Mål | `goals` | Historik med `validFrom`, läge (beräknat/manuellt) och beräkningsdetaljer. |
| Dag | `dayNotes` | Dagsanteckning per datum. Totalsummor beräknas från posterna. |
| Livsmedel | `foods` | Egna favoritlivsmedel med näring per angiven mängd. |
| Matpost / Måltid | `entries` | En rad i dagboken med måltidstyp. Poster som lagts till tillsammans delar `groupId`. Ursprung (`origin`) och källa (`source`) sparas. |
| Standardmåltid | `mealTemplates` | Mall med ingredienser; ändras aldrig när den används. |
| Recept / Ingrediens | `recipes` | Ingredienser + antal portioner. |
| Träningspost | `workouts` | Inklusive `kcalEstimated`. |
| Träningsmall | `workoutTemplates` | |
| Viktregistrering / Kroppsmått | `measurements` | Vikt, midja och vilopuls i samma post (alla valfria). |
| AI-tolkning | `aiInterpretations` | Ursprunglig text, leverantör, resultat, status och id:n för godkända poster. |
| Inställningar | `settings` | En post. |
| Säkerhetskopia | (fil) | `Backup` med `schemaVersion`. |

Användningsfrekvens (`useCount`, `lastUsedAt`) sparas på mallar och livsmedel och används för att visa de mest använda valen först.

**Förberett för synkronisering:** UUID:n, `createdAt`/`updatedAt` på alla poster och ett versionerat exportformat gör att en synkroniseringsdel kan läggas till senare utan att datamodellen behöver byggas om.

---

## Antaganden och begränsningar

**Antaganden och designval**

- Hash-adresser (`#/…`) i stället för vanliga sökvägar, så att appen fungerar på vilken statisk hosting som helst och offline.
- Standard för träningskalorier är *lägg till en andel* med 75 %. Den andelen av dagens uppskattade träning blir en egen grön stapel under protein, som fylls först när du ätit upp grundmålet. Planerad träning räknas då inte in i grundmålet. Väljer du *visa separat* ingår din vanliga träning i stället i grundmålet och stapeln visas inte.
- Vid flera vägningar samma dag används dagens första som standard – den är mest jämförbar mellan dagar.
- En dag räknas som registrerad om den har minst en matpost (även om summan är 0 kcal).
- Ett par startfavoriter (proteinshake, banan, *Min vanliga frukost* m.fl.) och träningsmallar skapas efter introduktionen. De är vanliga, redigerbara favoriter – inte demodata.
- Näringsvärden i den inbyggda listan är avrundade typvärden och varierar mellan produkter.

**Begränsningar**

- Data finns bara på en enhet. Ingen automatisk synkronisering mellan iPhone och dator – använd export/import.
- iOS kan i sällsynta fall rensa lagring för webbappar som inte använts på länge. Säkerhetskopiera.
- Ingen streckkodsläsare och ingen fullständig livsmedelsdatabas – den inbyggda listan har cirka 110 vanliga livsmedel.
- Den lokala tolkningen är regelbaserad och klarar enkla meningar bäst. Sammansatta rätter (*”en ostomelett”*) kräver serverfunktionen eller manuella värden.
- Inga push-påminnelser.
- Webbläsarens taligenkänning fungerar inte i alla webbläsare; tangentbordets diktering fungerar alltid.
- E2E-testerna körs i Chromium med iPhone-storlek; slutlig kontroll bör göras i Safari på en riktig iPhone.
- Energiberäkningar är uppskattningar och **inte medicinsk rådgivning**.
