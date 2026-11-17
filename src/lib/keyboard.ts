// iPhone öppnar bara tangentbordet om ett textfält får fokus direkt i samband med ett tryck.
// När man trycker på en länk till "Skriv eller prata in" byts sidan först, och då är trycket redan över.
// Lösning: i själva trycket ges ett osynligt textfält fokus (tangentbordet öppnas), och när den nya
// sidan visas flyttas fokus till den riktiga textrutan. Tangentbordet ligger då kvar.

let primer: HTMLInputElement | null = null
let timer: ReturnType<typeof setTimeout> | undefined

/** Anropas direkt i ett tryck (onClick) innan man navigerar till en sida med textruta. */
export function primeKeyboard() {
  if (typeof document === 'undefined') return
  releaseKeyboardPrimer()
  const el = document.createElement('input')
  el.type = 'text'
  el.setAttribute('aria-hidden', 'true')
  el.tabIndex = -1
  // 16 px hindrar iPhone från att zooma in; elementet syns inte men måste kunna få fokus.
  Object.assign(el.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', opacity: '0', fontSize: '16px', border: '0', padding: '0' })
  document.body.appendChild(el)
  el.focus({ preventScroll: true })
  primer = el
  // Säkerhetsnät om ingen textruta tar över fokus.
  timer = setTimeout(releaseKeyboardPrimer, 2000)
}

/** Tar bort det osynliga fältet. Anropas efter att den riktiga textrutan fått fokus. */
export function releaseKeyboardPrimer() {
  if (timer) { clearTimeout(timer); timer = undefined }
  primer?.remove()
  primer = null
}

/** Ger ett textfält fokus med markören sist och tar sedan bort det osynliga fältet. */
export function focusAtEnd(el: HTMLTextAreaElement | HTMLInputElement | null) {
  if (!el) { releaseKeyboardPrimer(); return }
  el.focus({ preventScroll: true })
  const n = el.value.length
  try { el.setSelectionRange(n, n) } catch { /* vissa fälttyper saknar markör */ }
  releaseKeyboardPrimer()
}
