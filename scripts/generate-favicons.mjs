import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const PUBLIC = path.join(ROOT, 'public')

const SOURCES = [
  {
    input: 'logo-color-no-bg.png',
    outputBase: 'favicon-light',
    brighten: 1,
  },
  {
    input: 'logo-color-no-bg-dark.png',
    outputBase: 'favicon-dark',
    brighten: 1.55,
  },
]

const D_SLICE_WIDTH = 580

async function extractDLetter(inputPath) {
  const { width, height } = await sharp(inputPath).metadata()
  const slice = await sharp(inputPath)
    .extract({
      left: 0,
      top: 0,
      width: Math.min(D_SLICE_WIDTH, width),
      height,
    })
    .toBuffer()

  return sharp(slice).trim({ threshold: 12 }).toBuffer()
}

async function writeSquareIcon(inputPath, outputPath, size, brighten = 1) {
  const trimmed = await extractDLetter(inputPath)
  const { width, height } = await sharp(trimmed).metadata()
  const side = Math.max(width, height)
  const pad = Math.round(side * 0.04)

  const padLeft = pad + Math.floor((side - width) / 2)
  const padRight = pad + Math.ceil((side - width) / 2)
  const padTop = pad + Math.floor((side - height) / 2)
  const padBottom = pad + Math.ceil((side - height) / 2)

  let squared = await sharp(trimmed)
    .extend({
      top: padTop,
      bottom: padBottom,
      left: padLeft,
      right: padRight,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer()

  if (brighten !== 1) {
    squared = await sharp(squared)
      .modulate({ brightness: brighten, saturation: 1.08 })
      .toBuffer()
  }

  await sharp(squared)
    .resize({
      width: size,
      height: size,
      fit: 'contain',
      position: 'centre',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outputPath)

  const out = await sharp(outputPath).metadata()
  if (out.width !== size || out.height !== size) {
    throw new Error(`${outputPath} is ${out.width}x${out.height}, expected ${size}x${size}`)
  }
}

async function main() {
  await mkdir(PUBLIC, { recursive: true })

  for (const { input, outputBase, brighten } of SOURCES) {
    const inputPath = path.join(PUBLIC, input)
    await writeSquareIcon(inputPath, path.join(PUBLIC, `${outputBase}.png`), 32, brighten)
    console.log(`Wrote ${outputBase}.png (32x32)`)
  }

  const lightPath = path.join(PUBLIC, 'logo-color-no-bg.png')
  await writeSquareIcon(lightPath, path.join(PUBLIC, 'apple-touch-icon.png'), 180)
  console.log('Wrote apple-touch-icon.png (180x180)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
