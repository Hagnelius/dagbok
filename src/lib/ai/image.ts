/**
 * Förbereder ett foto för AI-analys: förminskar till högst 1280 px och kodar om till JPEG.
 * Omkodningen tar bort all metadata (t.ex. GPS-position) från bilden innan något skickas.
 */
export interface PreparedImage {
  mediaType: 'image/jpeg'
  /** Base64 utan "data:"-prefix. */
  data: string
  dataUrl: string
  /** Liten miniatyr (data-URL) som sparas lokalt tillsammans med tolkningen. */
  thumb: string
  blob: Blob
}

async function load(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; done: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { src: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() }
    } catch { /* faller tillbaka på <img> */ }
  }
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  await img.decode()
  return { src: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) }
}

function draw(src: CanvasImageSource, w: number, h: number, maxSide: number, quality: number): string {
  const k = Math.min(1, maxSide / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * k)
  canvas.height = Math.round(h * k)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Bilden kunde inte behandlas.')
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

export async function prepareImage(file: Blob, maxSide = 1280, quality = 0.78): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error('Filen är inte en bild.')
  const img = await load(file)
  try {
    const dataUrl = draw(img.src, img.w, img.h, maxSide, quality)
    const thumb = draw(img.src, img.w, img.h, 240, 0.6)
    const data = dataUrl.slice(dataUrl.indexOf(',') + 1)
    const bin = atob(data)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return { mediaType: 'image/jpeg', data, dataUrl, thumb, blob: new Blob([bytes], { type: 'image/jpeg' }) }
  } finally { img.done() }
}
