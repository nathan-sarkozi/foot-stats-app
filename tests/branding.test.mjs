import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import sharp from 'sharp'

const root = new URL('../', import.meta.url)
const read = path => readFileSync(new URL(path, root))

test('all app icons are reproducible from the shared navigation and intro mark', () => {
  execFileSync(process.execPath, ['scripts/generate-brand-icons.mjs', '--check'], { cwd: root, stdio: 'pipe' })
})

test('favicon includes real 16, 32 and 48px frames with the stadium palette', async () => {
  const ico = read('src/app/favicon.ico')
  assert.equal(ico.readUInt16LE(0), 0)
  assert.equal(ico.readUInt16LE(2), 1)
  assert.equal(ico.readUInt16LE(4), 3)
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + 16 * index
    const frame = ico.subarray(ico.readUInt32LE(entry + 12), ico.readUInt32LE(entry + 12) + ico.readUInt32LE(entry + 8))
    const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    assert.equal(info.width, size)
    assert.equal(info.height, size)
    assert.deepEqual([...data.subarray(0, 4)], [17, 24, 32, 255])
    assert.ok(data.some((value, offset) => offset % 4 === 0 && value > 180), 'visible citron mark at each favicon size')
  }
})

test('manifest and Apple images are opaque, correctly sized and safe for mobile masks', async () => {
  const manifest = JSON.parse(read('public/manifest.json'))
  assert.equal(manifest.theme_color, '#111820')
  assert.equal(manifest.background_color, '#111820')
  assert.equal(manifest.start_url, '/dashboard')
  assert.equal(manifest.display, 'standalone')
  const images = [{ path: 'src/app/apple-icon.png', size: 180 }, ...manifest.icons.map(icon => {
    assert.equal(icon.type, 'image/png')
    assert.equal(icon.purpose, 'any maskable')
    const [width, height] = icon.sizes.split('x').map(Number)
    assert.equal(width, height)
    return { path: 'public' + icon.src, size: width }
  })]
  assert.deepEqual(images.map(image => image.size), [180, 192, 512])
  for (const { path, size } of images) {
    const { data, info } = await sharp(read(path)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    assert.equal(info.width, size)
    assert.equal(info.height, size)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4
      assert.equal(data[offset + 3], 255, 'no transparent or pre-rounded corners')
      if (Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) > size * 0.4) {
        assert.deepEqual([...data.subarray(offset, offset + 3)], [17, 24, 32], 'mark stays inside maskable safe circle')
      }
    }
  }
})
