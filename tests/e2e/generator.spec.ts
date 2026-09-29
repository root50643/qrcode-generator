import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import jsQR from 'jsqr';
import qrcode from 'qrcode-generator';
import sharp from 'sharp';

async function generate(page: Page, value: string) {
  await page.locator('#url-input').fill(value);
  await expect(page.locator('#encoded-url')).toHaveText(new URL(value.includes('://') ? value : `https://${value}`).href);
  await expect(page.locator('#download-png')).toBeEnabled();
  await expect(page.locator('#preview svg')).toBeVisible();
}

async function download(page: Page, format: 'png' | 'svg') {
  const pending = page.waitForEvent('download');
  await page.locator(`#download-${format}`).click();
  const result = await pending;
  expect(result.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
  expect(await result.failure()).toBeNull();
  return readFile((await result.path())!);
}

async function decode(buffer: Buffer) {
  // jsQR's local thresholding is scale-sensitive on large circular modules.
  // Check native resolution first, then a camera-like 512px sample of the same export.
  // Export dimensions and the four-module quiet zone are asserted separately.
  for (const size of [1024, 512]) {
    const { data, info } = await sharp(buffer).resize(size, size).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const result = jsQR(new Uint8ClampedArray(data), info.width, info.height);
    if (result) return result.data;
  }
  throw new Error('The exported QR code should decode with an independent reader at native or camera-like resolution');
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
});

test('starts empty, normalizes URLs, and exports black QR codes with a white quiet zone', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByLabel('Website URL', { exact: true })).toBeEmpty();
  await expect(page.locator('#empty-preview')).toBeVisible();
  await expect(page.locator('#download-png')).toBeDisabled();
  await expect(page.locator('#download-svg')).toBeDisabled();
  await expect(page.locator('#color-input')).toHaveValue('#000000');
  await expect(page.locator('#customize')).not.toHaveAttribute('open');

  await generate(page, 'example.com/path?source=qr&message=hello');
  const png = await download(page, 'png');
  expect((await sharp(png).metadata()).width).toBe(1024);
  expect((await sharp(png).metadata()).height).toBe(1024);
  expect(await decode(png)).toBe('https://example.com/path?source=qr&message=hello');

  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let firstInk = info.width;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * 4;
      if (data[offset] < 128 && data[offset + 1] < 128 && data[offset + 2] < 128) firstInk = Math.min(firstInk, x, y, info.width - x - 1, info.height - y - 1);
    }
  }
  const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height)!;
  const modules = decoded.version * 4 + 17;
  expect(firstInk, 'Four modules of white quiet zone surround the entire QR').toBeGreaterThanOrEqual(Math.floor(info.width * 4 / (modules + 8)) - 1);

  // Some readers repair mirrored codes. Compare actual module centers against
  // the encoder's conventional row/column matrix so decoding cannot hide that bug.
  const model = qrcode(0, 'Q');
  model.addData('https://example.com/path?source=qr&message=hello', 'Byte');
  model.make();
  expect(model.getModuleCount()).toBe(modules);
  const modulePixels = (info.width - firstInk * 2) / modules;
  const mismatchedModules: string[] = [];
  for (let row = 0; row < modules; row++) {
    for (let column = 0; column < modules; column++) {
      const x = Math.floor(firstInk + (column + 0.5) * modulePixels);
      const y = Math.floor(firstInk + (row + 0.5) * modulePixels);
      const actualDark = data[(y * info.width + x) * 4] < 128;
      if (actualDark !== model.isDark(row, column)) mismatchedModules.push(`${row},${column}`);
    }
  }
  expect(mismatchedModules, 'The image must use standard QR orientation, not a mirrored matrix').toEqual([]);
});

test('preserves Unicode and query parameters in both exported formats', async ({ page }) => {
  const input = 'https://例子.台灣/測試?name=繁體中文&emoji=✨#段落';
  await generate(page, input);
  expect(await decode(await download(page, 'png'))).toBe(new URL(input).href);
  const svg = await download(page, 'svg');
  expect(svg.toString()).toContain('<svg');
  expect(await decode(svg)).toBe(new URL(input).href);
});

test('all six dot styles stay readable', async ({ page }) => {
  await generate(page, 'https://nuu.app/');
  await page.locator('#customize summary').click();
  const values = await page.locator('#dot-style option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(values).toHaveLength(6);
  for (const value of values) {
    await test.step(value, async () => {
      await page.locator('#dot-style').selectOption(value);
      await expect(page.locator('#download-png')).toBeEnabled();
      expect(await decode(await download(page, 'png')), `Style ${value}`).toBe('https://nuu.app/');
    });
  }
});

test('embeds an uploaded logo in self-contained exports, warns on light colors, and resets', async ({ page }) => {
  await generate(page, 'https://nuu.app/?from=logo');
  await page.locator('#customize summary').click();
  const logo = await sharp({ create: { width: 80, height: 80, channels: 4, background: '#22d3ee' } }).png().toBuffer();
  await page.locator('#logo-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logo });
  await expect(page.locator('#remove-logo')).toBeVisible();
  await expect(page.locator('#download-svg')).toBeEnabled();
  const svg = await download(page, 'svg');
  const svgText = svg.toString();
  expect(svgText).toMatch(/data:image\/(png|webp|jpeg);base64,/);
  expect(svgText).not.toMatch(/(?:href|xlink:href)=["'](?:https?:|blob:)/);
  expect(await decode(svg)).toBe('https://nuu.app/?from=logo');
  expect(await decode(await download(page, 'png'))).toBe('https://nuu.app/?from=logo');

  await page.locator('#color-input').fill('#eeeeee');
  await expect(page.locator('#color-warning')).toBeVisible();
  await page.locator('#reset-style').click();
  await expect(page.locator('#color-input')).toHaveValue('#000000');
  await expect(page.locator('#color-warning')).toBeHidden();
  await expect(page.locator('#remove-logo')).toBeHidden();
  await expect(page.locator('#url-input')).toHaveValue('https://nuu.app/?from=logo');
});

test('rejects unsupported, damaged, or oversized logo files without losing the QR', async ({ page }) => {
  await generate(page, 'https://nuu.app/');
  await page.locator('#customize summary').click();
  const invalidFiles = [
    { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), message: /PNG.*JPEG.*WebP/i },
    { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image'), message: /could not be opened|invalid image|damaged/i },
    { name: 'huge.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1), message: /5 MB/i },
  ];
  for (const { message, ...file } of invalidFiles) {
    await page.locator('#logo-input').setInputFiles(file);
    await expect(page.getByRole('alert').filter({ hasText: message }).first()).toBeVisible();
    await expect(page.locator('#remove-logo')).toBeHidden();
  }
  expect(await decode(await download(page, 'png'))).toBe('https://nuu.app/');
});

test('disables stale downloads while a logo is loading and renders the latest URL after loading', async ({ page }) => {
  await generate(page, 'https://nuu.app/before-logo');
  await page.locator('#customize summary').click();
  await page.evaluate(() => {
    const original = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
    const pending: { image: HTMLImageElement; src: string }[] = [];
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      ...original,
      set(this: HTMLImageElement, src: string) {
        if (src.startsWith('blob:')) pending.push({ image: this, src });
        else original.set!.call(this, src);
      },
    });
    (window as unknown as { releaseLogo: () => void }).releaseLogo = () => {
      Object.defineProperty(HTMLImageElement.prototype, 'src', original);
      for (const item of pending) original.set!.call(item.image, item.src);
    };
  });
  const logo = await sharp({ create: { width: 80, height: 80, channels: 4, background: '#22d3ee' } }).png().toBuffer();
  await page.locator('#logo-input').setInputFiles({ name: 'delayed.png', mimeType: 'image/png', buffer: logo });
  await expect(page.locator('#logo-name')).toHaveText(/Preparing your logo/);
  await expect(page.locator('#download-png')).toBeDisabled();
  await expect(page.locator('#download-svg')).toBeDisabled();
  await page.locator('#url-input').fill('https://nuu.app/changed-during-logo');
  await page.locator('#dot-style').selectOption('rounded');
  await expect(page.locator('#download-png')).toBeDisabled();
  await expect(page.locator('#download-svg')).toBeDisabled();
  await expect(page.locator('#preview svg')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { releaseLogo: () => void }).releaseLogo());
  await expect(page.locator('#download-svg')).toBeEnabled();
  await expect(page.locator('#encoded-url')).toHaveText('https://nuu.app/changed-during-logo');
  const svg = await download(page, 'svg');
  expect(svg.toString()).toMatch(/data:image\/(png|webp|jpeg);base64,/);
  expect(await decode(svg)).toBe('https://nuu.app/changed-during-logo');
});

test('rapid edits, invalid values, capacity errors, and clearing never leave downloadable stale content', async ({ page }) => {
  await generate(page, 'https://example.com/first');
  await page.locator('#url-input').fill('https://example.com/second');
  await page.locator('#url-input').fill('https://example.com/final');
  await expect(page.locator('#encoded-url')).toHaveText('https://example.com/final');
  expect(await decode(await download(page, 'png'))).toBe('https://example.com/final');

  for (const invalid of ['javascript:alert(1)', 'ftp://example.com', `https://example.com/?q=${'x'.repeat(5000)}`]) {
    await page.locator('#url-input').fill(invalid);
    await expect(page.locator('#input-error')).toBeVisible();
    await expect(page.locator('#download-png')).toBeDisabled();
    await expect(page.locator('#download-svg')).toBeDisabled();
    await expect(page.locator('#preview svg')).toHaveCount(0);
  }
  await generate(page, 'https://nuu.app/');
  await page.getByRole('button', { name: 'Clear URL', exact: true }).click();
  await expect(page.locator('#url-input')).toBeEmpty();
  await expect(page.locator('#download-png')).toBeDisabled();
  await expect(page.locator('#preview svg')).toHaveCount(0);
  await expect(page.locator('#empty-preview')).toBeVisible();
});

test('pastes clipboard contents and gives useful feedback when permission is denied', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => 'https://example.com/pasted' } });
  });
  await page.getByRole('button', { name: 'Paste from clipboard', exact: true }).click();
  await expect(page.locator('#url-input')).toHaveValue('https://example.com/pasted');
  await expect(page.locator('#download-png')).toBeEnabled();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => { throw new DOMException('Permission denied', 'NotAllowedError'); } } });
  });
  await page.getByRole('button', { name: 'Paste from clipboard', exact: true }).click();
  await expect(page.getByText(/paste.*(manually|Ctrl|⌘)|clipboard.*(denied|access|permission)/i).last()).toBeVisible();
  await expect(page.locator('#url-input')).toHaveValue('https://example.com/pasted');
});

test('the installed production app opens and exports QR codes offline', async ({ page, context }) => {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await context.setOffline(true);
  try {
    const offline = await context.newPage();
    await offline.goto('./', { waitUntil: 'domcontentloaded' });
    await generate(offline, 'https://example.com/offline');
    expect(await decode(await download(offline, 'png'))).toBe('https://example.com/offline');
    await offline.close();
  } finally {
    await context.setOffline(false);
  }
});

test('the manifest uses English and the current deployment scope', async ({ page, baseURL }) => {
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) throw new Error('Missing web app manifest');
    return (await fetch(link.href)).json();
  });
  const base = new URL(baseURL!).pathname;
  expect(manifest.lang).toBe('en');
  expect(manifest.start_url).toBe(base);
  expect(manifest.scope).toBe(base);
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  const unavailable = await page.evaluate(async (icons: { src: string }[]) => {
    const results = await Promise.all(icons.map(async (icon) => ({ src: icon.src, ok: (await fetch(icon.src)).ok })));
    return results.filter((result) => !result.ok);
  }, manifest.icons);
  expect(unavailable).toEqual([]);
});

for (const width of [360, 390, 768, 1440]) {
  test(`fits ${width}px screens and supports keyboard editing`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await generate(page, 'https://nuu.app/');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('#url-input').focus();
    await expect(page.locator('#url-input')).toBeFocused();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText('https://nuu.app/keyboard');
    await expect(page.locator('#encoded-url')).toHaveText('https://nuu.app/keyboard');
    await page.locator('#customize summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#customize')).toHaveAttribute('open');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (width === 390) {
      await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
}

test('captures actual desktop and mobile README images when requested', async ({ page }) => {
  test.skip(process.env.UPDATE_SCREENSHOTS !== '1', 'Opt-in documentation screenshots');
  await generate(page, 'https://nuu.app');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect(page.locator('#toast')).toBeHidden();
  await page.locator('#url-input').blur();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'docs/images/desktop.png', fullPage: true, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/images/mobile.png', fullPage: true, animations: 'disabled' });
});
