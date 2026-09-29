import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import qrcode from 'qrcode-generator';
import { renderQR, type DotStyle } from '../../src/lib/qr';

const dom = new JSDOM();
const styles: DotStyle[] = ['square', 'rounded', 'dots', 'classy', 'classy-rounded', 'extra-rounded'];

beforeAll(() => {
  vi.stubGlobal('window', dom.window);
  vi.stubGlobal('document', dom.window.document);
});

afterAll(() => {
  vi.unstubAllGlobals();
  dom.window.close();
});

describe('QR symbol orientation', () => {
  it.each(styles)('renders %s with standard row/column orientation', async style => {
    const url = 'https://nuu.app/';
    const reference = qrcode(0, 'Q');
    reference.addData(url, 'Byte');
    reference.make();

    const rendered = await renderQR({ url, style, color: '#000000' });
    const blob = await rendered.svg();
    const { data, info } = await sharp(Buffer.from(await blob.arrayBuffer()))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Read each module from the actual rasterized export. A decoder alone can
    // miss this regression because many scanners repair mirrored QR symbols.
    const count = reference.getModuleCount();
    const margin = Math.ceil((4 * info.width) / (count + 8));
    const moduleSize = Math.floor((info.width - 2 * margin) / count);
    const start = Math.floor((info.width - count * moduleSize) / 2);
    const mismatches: Array<{ row: number; column: number }> = [];
    const finderOrigins = [[0, 0], [0, count - 7], [count - 7, 0]];

    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        const x = start + column * moduleSize + Math.floor(moduleSize / 2);
        const y = start + row * moduleSize + Math.floor(moduleSize / 2);
        const isDark = data[(y * info.width + x) * info.channels] < 128;
        // The rounded outer finder frames intentionally clip their four tips.
        const roundedTip = finderOrigins.some(([r, c]) =>
          [0, 6].includes(row - r) && [0, 6].includes(column - c));
        const expectedDark = reference.isDark(row, column) && !roundedTip;
        if (isDark !== expectedDark) mismatches.push({ row, column });
      }
    }

    expect(mismatches).toEqual([]);
  });
});
