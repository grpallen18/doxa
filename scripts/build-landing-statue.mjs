/**
 * Derives the landing-page statue from the source artwork: mirrored to face
 * left, bottom third cropped off, transparent margins trimmed so CSS object
 * positioning lands on the figure itself, and an alpha ramp on the lower
 * portion so it dissolves into the marble background.
 *
 *   node scripts/build-landing-statue.mjs
 *
 * Source stays untouched at public/landing-plato-statue.png.
 */
/**
 * Alpha above which a pixel counts as visible artwork. Side margins are trimmed
 * against the faded result rather than the source: the robe flares widest right
 * where the ramp erases it, so measuring the source leaves a band of invisible
 * pixels on each side that CSS object-position still treats as the figure.
 */
const VISIBLE_ALPHA = 40
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const SOURCE = 'public/landing-plato-statue.png'
const OUTPUT = 'public/landing-plato-statue-faded.png'
/**
 * Same frame as OUTPUT but with the alpha ramp left off, so the hero can apply
 * the dissolve as a static CSS mask instead. The reveal animation sweeps across
 * this one: a moving edge crossing a baked alpha ramp attenuates twice and
 * reads as two separate fades, which the uniform artwork avoids.
 */
const OUTPUT_SOLID = 'public/landing-plato-statue-solid.png'

/** Fraction of the original height kept (bottom third removed). */
const KEEP_HEIGHT = 2 / 3
/**
 * Where the alpha ramp starts, as a fraction of the cropped height. The ramp is
 * long and finishes just shy of the frame: the hero clips the last few pixels,
 * so the figure has to be gone before the true bottom edge.
 */
const FADE_START = 0.38

const browser = await chromium.launch()
const page = await browser.newPage()

const { dataUrl, solidDataUrl, report } = await page.evaluate(
  async ({ b64, keepHeight, fadeStart, visibleAlpha }) => {
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = 'data:image/png;base64,' + b64
    })

    const srcWidth = img.naturalWidth
    const srcHeight = Math.round(img.naturalHeight * keepHeight)

    // Measure the artwork's true bounds so the exported frame has no dead space.
    const probe = document.createElement('canvas')
    probe.width = srcWidth
    probe.height = srcHeight
    const probeCtx = probe.getContext('2d')
    probeCtx.drawImage(img, 0, 0, srcWidth, srcHeight, 0, 0, srcWidth, srcHeight)
    const { data } = probeCtx.getImageData(0, 0, srcWidth, srcHeight)

    const ALPHA_FLOOR = 8
    let minX = srcWidth
    let maxX = -1
    let minY = srcHeight
    for (let y = 0; y < srcHeight; y++) {
      for (let x = 0; x < srcWidth; x++) {
        if (data[(y * srcWidth + x) * 4 + 3] <= ALPHA_FLOOR) continue
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
      }
    }
    if (maxX < 0) throw new Error('Source artwork is fully transparent')

    // Bottom is intentionally not trimmed — the crop edge is where the fade lands.
    const cropX = minX
    const cropY = minY
    const width = maxX - minX + 1
    const height = srcHeight - minY

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    const drawMirrored = (target) => {
      target.save()
      target.translate(width, 0)
      target.scale(-1, 1)
      target.drawImage(img, cropX, cropY, width, height, 0, 0, width, height)
      target.restore()
    }

    // Keep an un-faded copy so both exports share one frame of reference.
    const solid = document.createElement('canvas')
    solid.width = width
    solid.height = height
    drawMirrored(solid.getContext('2d'))

    drawMirrored(ctx)

    const fadeTop = Math.round(height * fadeStart)
    const gradient = ctx.createLinearGradient(0, fadeTop, 0, height)
    gradient.addColorStop(0, 'rgba(0,0,0,0)')
    gradient.addColorStop(0.25, 'rgba(0,0,0,0.2)')
    gradient.addColorStop(0.5, 'rgba(0,0,0,0.5)')
    gradient.addColorStop(0.72, 'rgba(0,0,0,0.8)')
    gradient.addColorStop(0.88, 'rgba(0,0,0,0.96)')
    gradient.addColorStop(1, 'rgba(0,0,0,1)')

    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = gradient
    ctx.fillRect(0, fadeTop, width, height - fadeTop)
    ctx.globalCompositeOperation = 'source-over'

    // Re-trim the sides against what survived the fade.
    const faded = ctx.getImageData(0, 0, width, height).data
    let visMinX = width
    let visMaxX = -1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (faded[(y * width + x) * 4 + 3] < visibleAlpha) continue
        if (x < visMinX) visMinX = x
        if (x > visMaxX) visMaxX = x
      }
    }
    if (visMaxX < 0) throw new Error('Faded artwork is fully transparent')

    const outWidth = visMaxX - visMinX + 1
    // Both exports are trimmed to the faded bounds so they stay interchangeable
    // in CSS: same aspect ratio, same figure placement inside the frame.
    const crop = (source) => {
      const out = document.createElement('canvas')
      out.width = outWidth
      out.height = height
      out
        .getContext('2d')
        .drawImage(source, visMinX, 0, outWidth, height, 0, 0, outWidth, height)
      return out.toDataURL('image/png')
    }

    // Row-by-row ink profile of the faded artwork, used to derive the reveal's
    // keyframe spacing. See the statue-btt keyframes in tailwind.config.ts.
    const fadedData = ctx.getImageData(visMinX, 0, outWidth, height).data
    const PROFILE_STEPS = 50
    const profile = []
    for (let step = 0; step <= PROFILE_STEPS; step++) {
      // Average a band rather than a single row, so the profile is not thrown
      // off by whichever row a sample happens to land on.
      const from = Math.round((step / PROFILE_STEPS) * (height - 1))
      const to = Math.min(height - 1, Math.round(((step + 0.5) / PROFILE_STEPS) * (height - 1)))
      let sum = 0
      let n = 0
      for (let y = from; y <= to; y++) {
        for (let x = 0; x < outWidth; x++) {
          sum += fadedData[(y * outWidth + x) * 4 + 3]
          n++
        }
      }
      profile.push(+(sum / n / 255).toFixed(4))
    }

    return {
      dataUrl: crop(canvas),
      solidDataUrl: crop(solid),
      report: {
        beforeTrim: `${width}x${height}`,
        afterTrim: `${outWidth}x${height}`,
        trimmedLeft: visMinX,
        trimmedRight: width - 1 - visMaxX,
        fadeTopPct: +((fadeTop / height) * 100).toFixed(3),
        alphaProfile: profile,
      },
    }
  },
  {
    b64: readFileSync(SOURCE).toString('base64'),
    keepHeight: KEEP_HEIGHT,
    fadeStart: FADE_START,
    visibleAlpha: VISIBLE_ALPHA,
  }
)

await browser.close()

writeFileSync(OUTPUT, Buffer.from(dataUrl.split(',')[1], 'base64'))
writeFileSync(OUTPUT_SOLID, Buffer.from(solidDataUrl.split(',')[1], 'base64'))
console.log(`Wrote ${OUTPUT} and ${OUTPUT_SOLID}`, report)
