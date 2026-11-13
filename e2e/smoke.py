"""
End-to-end-test i iPhone-liknande vy (390×844) och datorvy.
Kör: npm run build && npx vite preview --port 4173 &  python3 e2e/smoke.py [skärmbildsmapp]
"""
import sys, re, pathlib, json, threading
from http.server import BaseHTTPRequestHandler, HTTPServer

# Låtsas-AI-server för att testa serverflödet utan riktig AI-tjänst
received = []
class Mock(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("access-control-allow-origin", "*"); self.send_header("access-control-allow-headers", "content-type, authorization")
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        req = json.loads(self.rfile.read(int(self.headers["content-length"])))
        received.append(req)
        if "image" in req:
            body = json.dumps({"foods": [{"name": "Lax, ugnsbakad", "amount": 150, "unit": "g", "kcal": 300, "protein": 33, "meal": "middag", "amountOrigin": "uppskattat", "nutritionOrigin": "uppskattat"},
                                         {"name": "Kokt potatis", "amount": 200, "unit": "g", "kcal": 160, "protein": 4, "meal": "middag", "amountOrigin": "osakert", "nutritionOrigin": "uppskattat"}],
                               "workouts": [], "assumptions": ["Laxen tillagad utan extra fett"], "uncertainties": ["Sås syns inte tydligt"]}).encode()
            self.send_response(200); self._cors(); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(body); return
        body = json.dumps({"foods": [{"name": "Pizza capricciosa", "amount": 1, "unit": "st", "kcal": 850, "protein": 36, "meal": "middag", "amountOrigin": "angivet", "nutritionOrigin": "uppskattat"}],
                           "workouts": [], "assumptions": ["Normalstor pizza"], "uncertainties": [], "followUpQuestion": "Åt du hela pizzan?"}).encode()
        self.send_response(200); self._cors(); self.send_header("content-type", "application/json"); self.end_headers(); self.wfile.write(body)
    def log_message(self, *a): pass
mock = HTTPServer(("127.0.0.1", 8799), Mock); threading.Thread(target=mock.serve_forever, daemon=True).start()
from playwright.sync_api import sync_playwright, expect

URL = "http://127.0.0.1:4173/"
SHOTS = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "e2e-shots"); SHOTS.mkdir(exist_ok=True)
errors = []

def shot(page, name):
    page.screenshot(path=str(SHOTS / f"{name}.png"))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
                        locale="sv-SE", timezone_id="Europe/Stockholm")
    page = ctx.new_page()
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
    page.goto(URL)

    # --- PWA-konfiguration ---
    man = page.request.get(URL + "manifest.webmanifest").json()
    assert man["display"] == "standalone" and man["short_name"] and man["lang"] == "sv-SE"
    assert {i["sizes"] for i in man["icons"]} >= {"192x192", "512x512"} and any(i.get("purpose") == "maskable" for i in man["icons"])
    for i in man["icons"]:
        assert page.request.get(URL + i["src"]).ok
    assert page.request.get(URL + "icons/apple-touch-icon.png").ok
    assert page.locator('link[rel="apple-touch-icon"]').count() == 1
    assert "viewport-fit=cover" in page.locator('meta[name="viewport"]').get_attribute("content")
    assert page.request.get(URL + "sw.js").ok

    # --- Introduktion ---
    expect(page.get_by_role("heading", name="Välkommen")).to_be_visible()
    page.get_by_role("button", name="Fortsätt").click()
    expect(page.get_by_text("Ange en ålder mellan 15 och 100 år.")).to_be_visible()  # validering
    page.get_by_label("Ålder").fill("45")
    page.get_by_label("Längd").fill("182")
    page.get_by_label("Nuvarande vikt").fill("95,5")
    shot(page, "01-intro")
    page.get_by_role("button", name="Fortsätt").click()
    page.get_by_label("Målvikt").fill("85")
    page.get_by_role("radio", name="1 kg").click()
    page.get_by_role("button", name="Fortsätt").click()
    page.get_by_text("Lätt aktiv").click()
    page.get_by_role("button", name="Fortsätt").click()
    page.get_by_role("button", name="Fortsätt").click()
    expect(page.get_by_text("Basalomsättning (BMR)")).to_be_visible()
    expect(page.get_by_text(re.compile("av kroppsvikten per vecka"))).to_be_visible()  # varning vid 1 kg/v för 95 kg? (>1 %)  
    shot(page, "02-mal")
    page.get_by_role("button", name=re.compile("Använd säkrare takt")).click()
    page.get_by_role("button", name="Börja använda appen").click()

    # --- Idag ---
    expect(page.get_by_role("heading", name="Idag")).to_be_visible()
    expect(page.get_by_text("Inget registrerat ännu idag.")).to_be_visible()
    shot(page, "03-idag-tom")

    # --- Snabbregistrering: ett tryck + flerval ---
    page.get_by_role("link", name=re.compile("Snabbregistrera")).click()
    page.get_by_role("button", name="Lägg till Proteinshake direkt").click()
    page.get_by_role("checkbox", name=re.compile("Min vanliga frukost")).check()
    page.get_by_role("checkbox", name=re.compile("Banan")).check()
    page.get_by_role("button", name="Öka antal Banan").click()
    shot(page, "04-snabbval")
    page.get_by_role("button", name=re.compile(r"Lägg till 2 val")).click()
    expect(page.get_by_role("heading", name="Idag")).to_be_visible()
    # frukost-mallen (4 ingredienser) + shake + 2 bananer
    expect(page.get_by_text("Skinka (pålägg)")).to_be_visible()

    # --- Manuell registrering ---
    page.goto(URL + "#/mat/manuell")
    page.get_by_label("Livsmedel eller maträtt").fill("Kycklingwok")
    page.get_by_label("Kalorier").fill("640")
    page.get_by_label("Protein").fill("48")
    page.get_by_role("button", name=re.compile("Lägg till i")).click()
    expect(page.get_by_text("Kycklingwok")).to_be_visible()

    # --- Redigera post och kontrollera att totalsumman uppdateras ---
    page.get_by_text("Kycklingwok").click()
    page.get_by_role("dialog").get_by_label("Kalorier").fill("700")
    page.get_by_role("button", name="Spara", exact=True).click()
    expect(page.get_by_text("700 kcal", exact=True)).to_be_visible()

    # --- Byte av enhet räknar om näringen (mellanmjölk 2 dl → 2 msk) ---
    page.goto(URL + "#/mat/sok")
    page.get_by_label("Sök livsmedel").fill("mellanmjölk")
    page.get_by_role("button", name=re.compile("^Mellanmjölk")).click()
    page.get_by_role("button", name=re.compile("Lägg till i")).click()
    page.get_by_role("button", name=re.compile("^Mellanmjölk 2 dl")).click()
    dlg = page.get_by_role("dialog")
    expect(dlg.get_by_label("Kalorier")).to_have_value("92")
    dlg.get_by_label("Enhet", exact=True).select_option("msk")
    expect(dlg.get_by_label("Kalorier")).to_have_value("14")
    dlg.get_by_label("Mängd", exact=True).fill("")
    dlg.get_by_label("Mängd", exact=True).fill("4")
    expect(dlg.get_by_label("Kalorier")).to_have_value("28")
    dlg.get_by_role("button", name="Spara", exact=True).click()
    expect(page.get_by_text("28 kcal", exact=True)).to_be_visible()

    # --- AI: skriv in, granska, inget sparat förrän godkänt ---
    page.goto(URL + "#/ai")
    page.get_by_label("Beskriv vad du ätit eller hur du tränat").fill("Till lunch åt jag en omelett på tre ägg, 30 gram riven ost, 30 gram keso, en halv tomat, två matskedar purjolök och lite smör. Sedan 45 minuter crosstrainer.")
    page.get_by_role("button", name="Analysera text").click()
    expect(page.get_by_role("heading", name="Granska förslaget")).to_be_visible()
    expect(page.get_by_text("Osäkert").first).to_be_visible()
    shot(page, "05-ai-granska")
    page.get_by_role("checkbox", name="Ta med Purjolök").uncheck()
    page.get_by_role("button", name=re.compile("Spara valda")).click()
    expect(page.get_by_role("heading", name="Idag")).to_be_visible()
    expect(page.get_by_text("Hårdost 28 %")).to_be_visible()
    expect(page.get_by_text("Purjolök")).to_have_count(0)
    expect(page.get_by_text("Crosstrainer").first).to_be_visible()

    # --- AI via serverfunktion: samtycke krävs innan något skickas ---
    page.goto(URL + "#/installningar/ai")
    page.get_by_text("Egen serverfunktion").click()
    page.get_by_label("Serverfunktionens adress").fill("http://127.0.0.1:8799/tolka")
    page.get_by_role("button", name="Spara", exact=True).click()
    page.goto(URL + "#/ai")
    page.get_by_label("Beskriv vad du ätit eller hur du tränat").fill("Pizza till middag")
    page.get_by_role("button", name="Analysera text").click()
    expect(page.get_by_role("dialog", name="Skicka text för tolkning?")).to_be_visible()
    assert len(received) == 0, "Inget får skickas före samtycke"
    page.get_by_role("button", name="Godkänn och skicka").click()
    expect(page.get_by_text("Åt du hela pizzan?")).to_be_visible()
    assert received[0]["text"] == "Pizza till middag" and set(received[0]) <= {"text", "today", "now", "weightKg"}
    page.get_by_role("button", name="Avbryt").click()
    expect(page.get_by_text("Inget sparades")).to_be_visible()

    # --- Fota maten via serverfunktionen: eget samtycke, bild förminskad, granskning ---
    img_page = b.new_page(viewport={"width": 1600, "height": 1200})
    img_page.set_content('<div style="width:1600px;height:1200px;background:radial-gradient(circle,#f4a261 0 30%,#2a9d8f 31% 60%,#eee 61%)"></div>')
    img_path = str(SHOTS / "test-maltid.jpg"); img_page.screenshot(path=img_path, type="jpeg"); img_page.close()
    page.goto(URL + "#/ai?lage=foto")
    expect(page.get_by_role("heading", name="Fota maten")).to_be_visible()
    page.get_by_label("Ta foto eller välj bild").set_input_files(img_path)
    expect(page.get_by_alt_text("Valt foto av måltiden")).to_be_visible()
    page.get_by_label("Kommentar (valfritt)").fill("stekt i lite smör")
    n_before = len(received)
    page.get_by_role("button", name="Analysera foto").click()
    expect(page.get_by_role("dialog", name="Skicka foto för analys?")).to_be_visible()
    assert len(received) == n_before, "Inget foto får skickas före samtycke"
    shot(page, "14-foto-samtycke")
    page.get_by_role("button", name="Godkänn och skicka").click()
    expect(page.get_by_role("heading", name="Granska förslaget")).to_be_visible()
    req = received[-1]
    assert req["image"]["mediaType"] == "image/jpeg" and req["text"] == "stekt i lite smör"
    import base64, io, struct
    raw = base64.b64decode(req["image"]["data"])
    assert raw[:2] == b"\xff\xd8" and len(raw) < 600_000, "Bilden ska vara förminskad JPEG"
    expect(page.get_by_alt_text("Fotot som analyserades")).to_be_visible()
    shot(page, "15-foto-granska")
    page.get_by_role("button", name=re.compile("Godkänn och spara allt")).click()
    expect(page.get_by_text("Lax, ugnsbakad")).to_be_visible()

    page.goto(URL + "#/installningar/ai")
    page.get_by_text("Lokal tolkning").first.click()

    # --- Träning via mall ---
    page.goto(URL + "#/traning")
    page.get_by_role("button", name="Spara 60 min gym, medel").click()
    expect(page.get_by_text(re.compile(r"2 pass"))).to_be_visible()

    # --- Vikt ---
    page.goto(URL + "#/vikt")
    page.get_by_label("Vikt", exact=True).fill("94,8")
    page.get_by_role("button", name="Spara", exact=True).click()
    expect(page.get_by_text("Senaste vikt")).to_be_visible()
    shot(page, "06-vikt")

    page.goto(URL)
    page.wait_for_timeout(300)
    shot(page, "07-idag")
    page.mouse.wheel(0, 900); page.wait_for_timeout(200)
    shot(page, "08-idag-scroll")

    # --- Demodata, analys, historik ---
    page.goto(URL + "#/installningar")
    page.get_by_role("button", name="Visa demodata").click()
    page.get_by_role("dialog").get_by_role("button", name="Lägg till", exact=True).click()
    expect(page.get_by_text("Demodata visas.")).to_be_visible()
    page.goto(URL + "#/analys")
    expect(page.get_by_text("Kalorier per dag")).to_be_visible()
    page.get_by_role("radio", name="Månad").click()
    page.wait_for_timeout(300)
    shot(page, "09-analys")
    page.goto(URL + "#/historik")
    expect(page.get_by_text("Veckor")).to_be_visible()
    shot(page, "10-historik")
    page.goto(URL + "#/vikt"); page.wait_for_timeout(300)
    page.mouse.wheel(0, 700); page.wait_for_timeout(200)
    shot(page, "11-vikt-diagram")

    # --- Mörkt läge ---
    page.goto(URL + "#/installningar")
    page.get_by_role("radio", name="Mörkt").click()
    expect(page.locator("html")).to_have_class(re.compile("dark"))
    page.goto(URL); page.wait_for_timeout(300)
    shot(page, "12-idag-mork")

    # --- Offline efter första laddningen ---
    page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null", timeout=10000)
    ctx.set_offline(True)
    page.reload()
    expect(page.get_by_role("heading", name="Idag")).to_be_visible()
    expect(page.get_by_text("Offline – allt sparas lokalt som vanligt.")).to_be_visible()
    page.goto(URL + "#/analys")  # lat-laddad vy ska också fungera offline
    expect(page.get_by_text("Kalorier per dag")).to_be_visible()
    ctx.set_offline(False)

    # --- Rensa testdata, riktiga poster finns kvar ---
    page.goto(URL + "#/installningar")
    page.get_by_role("button", name="Rensa all testdata").click()
    expect(page.get_by_text("All testdata är borttagen")).to_be_visible()
    page.goto(URL)
    expect(page.get_by_text("Kycklingwok")).to_be_visible()
    expect(page.get_by_text("Demodata visas.")).to_have_count(0)

    # --- Dator ---
    desk = b.new_page(viewport={"width": 1280, "height": 900})
    desk.goto(URL)
    desk.wait_for_timeout(500)
    desk.screenshot(path=str(SHOTS / "13-dator.png"))
    b.close()

real = [e for e in errors if "favicon" not in e]
if real:
    print("FEL I KONSOLEN:\n" + "\n".join(real)); sys.exit(1)
print("E2E OK")
