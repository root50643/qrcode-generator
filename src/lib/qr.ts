import qrcode from 'qrcode-generator';
import QRCodeStyling from '../../vendor/qr-code-styling/src';
import { normalizeUrl } from './url';

export type DotStyle = 'square' | 'rounded' | 'dots' | 'classy' | 'classy-rounded' | 'extra-rounded';

export interface RenderQROptions {
  url: string;
  color: string;
  style: DotStyle;
  logo?: string;
}

export interface RenderedQR {
  element: HTMLElement | SVGElement;
  png: () => Promise<Blob>;
  svg: () => Promise<Blob>;
}

const OUTPUT_SIZE = 1024;
const DOT_STYLES = new Set<DotStyle>(['square', 'rounded', 'dots', 'classy', 'classy-rounded', 'extra-rounded']);

// The pinned fork otherwise inherits the encoder's legacy single-byte default.
qrcode.stringToBytes = value => Array.from(new TextEncoder().encode(value));

async function withinTime<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('The QR code took too long to render. Try again without a logo.'));
        }, 15_000);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/** Build a finished SVG preview and matching, self-contained 1024px exports. */
export async function renderQR(options: RenderQROptions): Promise<RenderedQR> {
  const url = normalizeUrl(options.url);
  const { color, style } = options;
  const logo = options.logo || undefined;

  if (!/^#[0-9a-f]{6}$/iu.test(color)) {
    throw new Error('Choose a valid QR color.');
  }
  if (!DOT_STYLES.has(style)) {
    throw new Error('Choose a supported QR pattern.');
  }
  if (logo && !/^data:image\/(?:png|jpeg|webp);base64,/iu.test(logo)) {
    throw new Error('Choose a local PNG, JPEG, or WebP logo.');
  }

  const errorCorrectionLevel = logo ? 'H' : 'Q';
  // Version 40 byte-mode limits prevent an unbounded input from blocking the UI.
  const maximumBytes = logo ? 1273 : 1663;
  if (new TextEncoder().encode(url).length > maximumBytes) {
    throw new Error('This URL is too long for a QR code. Try a shorter URL.');
  }

  let moduleCount: number;
  try {
    const model = qrcode(0, errorCorrectionLevel);
    model.addData(url, 'Byte');
    model.make();
    moduleCount = model.getModuleCount();
  } catch {
    throw new Error('This URL is too long for a QR code. Try a shorter URL.');
  }

  // Four quiet modules are part of every export, not just padding around the UI.
  // Rounding the margin up and the library's module size down preserves >=4.
  const margin = Math.ceil((4 * OUTPUT_SIZE) / (moduleCount + 8));
  const code = new QRCodeStyling({
    width: OUTPUT_SIZE,
    height: OUTPUT_SIZE,
    type: 'svg',
    data: url,
    margin,
    image: logo,
    qrOptions: { typeNumber: 0, mode: 'Byte', errorCorrectionLevel },
    dotsOptions: { type: style, color },
    cornersSquareOptions: { type: 'square', color },
    cornersDotOptions: { type: 'square', color },
    backgroundOptions: { color: '#ffffff' },
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: 0.25,
      margin: 8,
      saveAsBlob: false,
    },
  });

  const container = document.createElement('div');
  code.append(container);

  async function exportBlob(extension: 'png' | 'svg'): Promise<Blob> {
    try {
      const blob = await withinTime(code.getRawData(extension));
      if (!(blob instanceof Blob) || blob.size === 0) {
        throw new Error('The QR image could not be exported. Please try again.');
      }
      return blob;
    } catch (error) {
      throw error instanceof Error ? error : new Error('The QR image could not be rendered. Please try again.');
    }
  }

  // getRawData waits for asynchronous logo rendering before exposing the preview.
  await exportBlob('svg');
  const element = container.querySelector('svg');
  if (!element) {
    throw new Error('The QR preview could not be created. Please try again.');
  }
  element.setAttribute('viewBox', `0 0 ${OUTPUT_SIZE} ${OUTPUT_SIZE}`);
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', 'QR code');

  let pngPromise: Promise<Blob> | undefined;
  let svgPromise: Promise<Blob> | undefined;

  return {
    element,
    png: () => pngPromise ??= exportBlob('png'),
    svg: () => svgPromise ??= exportBlob('svg'),
  };
}
