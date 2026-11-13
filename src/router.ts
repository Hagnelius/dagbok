import { useEffect, useState } from 'react'

/**
 * Minimal hash-router. Hash-adresser gör att appen fungerar offline och på vilken statisk
 * webbserver som helst, utan serverkonfiguration.
 */
export interface Route { path: string; parts: string[]; query: URLSearchParams }

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [p, q] = raw.split('?')
  const path = p.startsWith('/') ? p : '/' + p
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(q ?? '') }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => setRoute(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const url = '#' + to
  if (opts.replace) {
    history.replaceState(null, '', url)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else window.location.hash = to
}

export function goBack(fallback = '/') {
  if (history.length > 1) history.back()
  else navigate(fallback)
}

/** Efter en registrering: visa dagen som registreringen gällde (ersätter registreringsvyn i historiken). */
export function finishTo(date: string, today: string) {
  navigate(date === today ? '/' : `/dag/${date}`, { replace: true })
}
