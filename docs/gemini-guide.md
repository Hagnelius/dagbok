# Koppla AI-tolkningen till Gemini (gratis)

Den här guiden kopplar appens **Skriv eller prata in** och **Fota maten** till Googles Gemini via en liten serverfunktion på Cloudflare. Båda har gratisnivåer. Det tar ungefär 15 minuter.

Du gör tre saker: skapar en API-nyckel hos Google, lägger upp serverfunktionen på Cloudflare och anger adressen i appen.

> **Varför en serverfunktion?** API-nyckeln får aldrig ligga i själva appen – koden är publik på GitHub. Serverfunktionen håller nyckeln hemlig och tar bara emot anrop från din app.

---

## 1. Skapa en API-nyckel i Google AI Studio

1. Gå till **aistudio.google.com** och logga in med ditt Google-konto.
2. Klicka **Get API key** (eller *API keys* i menyn) och sedan **Create API key**.
3. Kopiera nyckeln och ha den till hands. Den behövs i steg 2.

Inget betalkort behövs för gratisnivån.

**Gratisnivån i korthet**

- Gäller de snabba *Flash*-modellerna och har ett begränsat antal anrop per dag. Gränsen syns när du är inloggad i AI Studio.
- Är kvoten slut visar appen *"AI-tjänstens gratiskvot är slut för stunden"*. Försök senare eller byt till lokal tolkning.
- Läs Googles villkor för hur data i gratisnivån får användas. Enligt sammanställningar av villkoren gäller betalnivåns datavillkor (ingen träning på din data) även gratisnivån för användare i EES, där Sverige ingår – kontrollera själv i AI Studio.

---

## 2. Lägg upp serverfunktionen på Cloudflare

1. Skapa ett gratiskonto på **dash.cloudflare.com** och logga in.
2. Gå till **Workers & Pages** och klicka **Create** → **Create Worker** (mallen *Hello World* går bra).
3. Ge den namnet `dagbok-ai` och klicka **Deploy**.
4. Klicka **Edit code**. Markera all exempelkod och ta bort den.
5. Öppna [server/cloudflare-worker-bundle.js](https://github.com/Hagnelius/dagbok/blob/main/server/cloudflare-worker-bundle.js) på GitHub, klicka **Raw**, markera allt och kopiera.
6. Klistra in koden i Cloudflares redigerare och klicka **Deploy**.
7. Gå tillbaka till Workern och öppna **Settings → Variables and Secrets**. Lägg till:

   | Namn | Typ | Värde |
   |---|---|---|
   | `GEMINI_API_KEY` | **Secret** | Nyckeln från steg 1 |
   | `APP_TOKEN` | **Secret** | En lång kod du hittar på själv (t.ex. från en lösenordsgenerator). Den fungerar som lösenord mellan appen och servern. |
   | `ALLOWED_ORIGIN` | Text | `https://hagnelius.github.io` |

   `AI_MODEL` behövs normalt inte. Standard är `gemini-flash-latest`, som alltid pekar på Googles aktuella Flash-modell. Om du får fel om modellen kan du ange ett modellnamn som AI Studio visar som gratis.

8. Spara/Deploy igen så att inställningarna gäller.
9. Kopiera Workerns adress. Den ser ut ungefär så här: `https://dagbok-ai.<ditt-namn>.workers.dev`

---

## 3. Ställ in appen på telefonen

1. Öppna dagboken → **Inställningar** → **AI-tolkning (text, tal och foto)**.
2. Välj **Egen serverfunktion**.
3. Klistra in Workerns adress under **Serverfunktionens adress**.
4. Skriv samma kod som `APP_TOKEN` under **Åtkomstkod** och tryck **Spara**.
5. Testa: gå till **Skriv eller prata in**, skriv till exempel *"en festis och en kanelbulle"* och tryck **Analysera text**. Första gången frågar appen om det är okej att skicka texten.
6. Testa **Fota maten** på samma sätt. Foton har ett eget samtycke.

Åtkomstkoden sparas bara i telefonen och ingår inte i säkerhetskopior. Gör om steg 3 på varje enhet där du använder appen.

---

## Felsökning

| Det som händer | Trolig orsak och åtgärd |
|---|---|
| *Servern svarade med fel (401)* | Åtkomstkoden i appen stämmer inte med `APP_TOKEN`. |
| *Servern svarade med fel (403)* | `ALLOWED_ORIGIN` är fel. Den ska vara exakt `https://hagnelius.github.io` (utan `/dagbok` och utan snedstreck på slutet). |
| *AI-tjänsten svarade 400 eller 404* | Modellnamnet godtas inte. Ange `AI_MODEL` med en modell som AI Studio visar som gratis. |
| *AI-tjänsten svarade 401/403* | API-nyckeln är fel eller borttagen. Skapa en ny i AI Studio och uppdatera `GEMINI_API_KEY`. |
| *Gratiskvoten är slut* | Vänta (kvoten fylls på) eller använd lokal tolkning under tiden. |

## Stänga av

Välj **Lokal tolkning** i appen. Vill du ta bort allt: radera Workern i Cloudflare och nyckeln i AI Studio.
