const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_LOGO_DIMENSION = 512;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/** Decode a local image and return an embedded, bounded PNG for safe exports. */
export async function loadLogo(file: File): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type.toLowerCase())) {
    throw new Error('Choose a PNG, JPEG, or WebP image.');
  }
  if (file.size === 0) {
    throw new Error('This image is empty. Choose another image.');
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error('Choose an image smaller than 5 MB.');
  }

  const image = new Image();
  const objectUrl = URL.createObjectURL(file);

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        image.onload = null;
        image.onerror = null;
        reject(new Error('The image took too long to load. Try another image.'));
      }, 10_000);

      image.onload = () => {
        window.clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
        resolve();
      };
      image.onerror = () => {
        window.clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
        reject(new Error('This image could not be opened. Choose another image.'));
      };
      image.src = objectUrl;
    });

    if (image.naturalWidth === 0 || image.naturalHeight === 0) {
      throw new Error('This image has no visible content. Choose another image.');
    }

    const scale = Math.min(1, MAX_LOGO_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    // A transparent square keeps very wide or tall logos clear of negative
    // image margins in the renderer without stretching the original artwork.
    canvas.width = Math.max(width, height);
    canvas.height = canvas.width;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Your browser could not prepare the image.');
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);

    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
