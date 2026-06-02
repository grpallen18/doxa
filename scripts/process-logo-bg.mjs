import sharp from 'sharp'

// A pixel counts as "neutral light" (checkerboard square or outer background)
// when it is bright and close to gray (low color saturation).
function isNeutralLight(r, g, b) {
  const min = Math.min(r, g, b)
  const max = Math.max(r, g, b)
  return min >= 210 && max - min <= 16
}

// Separable square min-filter (erosion) over a boolean mask.
function erode(mask, width, height, radius) {
  const tmp = new Uint8Array(width * height)
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let keep = 1
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nx = x + dx
        if (nx < 0 || nx >= width || !mask[y * width + nx]) {
          keep = 0
          break
        }
      }
      tmp[y * width + x] = keep
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let keep = 1
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy
        if (ny < 0 || ny >= height || !tmp[ny * width + x]) {
          keep = 0
          break
        }
      }
      out[y * width + x] = keep
    }
  }
  return out
}

// Separable square max-filter (dilation) over a boolean mask.
function dilate(mask, width, height, radius) {
  const tmp = new Uint8Array(width * height)
  const out = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hit = 0
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nx = x + dx
        if (nx >= 0 && nx < width && mask[y * width + nx]) {
          hit = 1
          break
        }
      }
      tmp[y * width + x] = hit
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hit = 0
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = y + dy
        if (ny >= 0 && ny < height && tmp[ny * width + x]) {
          hit = 1
          break
        }
      }
      out[y * width + x] = hit
    }
  }
  return out
}

async function removeCheckerboardBackground(inputPath, outputPath) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const { width, height, channels } = info
  const pixels = Buffer.from(data)

  const neutral = new Uint8Array(width * height)
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * channels
    if (
      pixels[offset + 3] !== 0 &&
      isNeutralLight(pixels[offset], pixels[offset + 1], pixels[offset + 2])
    ) {
      neutral[index] = 1
    }
  }

  // Morphological opening keeps only SOLID neutral regions (outer background +
  // checkerboard squares) while dropping thin neutral features such as the
  // bright cores of the starburst rays, so those stay visible.
  const radius = 4
  const opened = dilate(erode(neutral, width, height, radius), width, height, radius)

  for (let index = 0; index < width * height; index += 1) {
    if (opened[index]) {
      pixels[index * channels + 3] = 0
    }
  }

  // Despeckle: drop tiny isolated neutral fragments (leftover square edges)
  // while keeping the large connected starburst structure.
  const minComponentArea = 450
  const labels = new Int32Array(width * height).fill(-1)
  const stack = []
  for (let start = 0; start < width * height; start += 1) {
    if (labels[start] !== -1) continue
    const offset = start * channels
    const isNeutralOpaque =
      pixels[offset + 3] !== 0 &&
      isNeutralLight(pixels[offset], pixels[offset + 1], pixels[offset + 2])
    if (!isNeutralOpaque) {
      labels[start] = -2
      continue
    }

    const component = []
    labels[start] = start
    stack.push(start)
    while (stack.length > 0) {
      const idx = stack.pop()
      component.push(idx)
      const x = idx % width
      const y = (idx - x) / width
      const neighbours = [
        x + 1 < width ? idx + 1 : -1,
        x - 1 >= 0 ? idx - 1 : -1,
        y + 1 < height ? idx + width : -1,
        y - 1 >= 0 ? idx - width : -1,
      ]
      for (const n of neighbours) {
        if (n < 0 || labels[n] !== -1) continue
        const no = n * channels
        if (
          pixels[no + 3] !== 0 &&
          isNeutralLight(pixels[no], pixels[no + 1], pixels[no + 2])
        ) {
          labels[n] = start
          stack.push(n)
        } else {
          labels[n] = -2
        }
      }
    }

    if (component.length < minComponentArea) {
      for (const idx of component) {
        pixels[idx * channels + 3] = 0
      }
    }
  }

  await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toFile(outputPath)
}

const input = process.argv[2] ?? 'public/logo-color-no-bg.png'
const output = process.argv[3] ?? 'public/logo-color-no-bg.png'

await removeCheckerboardBackground(input, output)
console.log(`Wrote transparent logo to ${output}`)
