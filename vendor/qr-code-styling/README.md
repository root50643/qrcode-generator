# Vendored QR Code Styling

This directory contains the browser-capable TypeScript source from the exact
repository requested for this application:

- Repository: https://github.com/oblakstudio/qr-code-styling
- Pinned commit: `29fc080550e3dc1146c50a4d0838f4a3a3ccb87b`
- Upstream package identity: `@oblakstudio/qr-code-styling`, version `1.1.0`
- License: MIT; the upstream notice is preserved in [LICENSE](LICENSE).
- Included: all 26 `src/**/*.ts` files and the upstream license. Demo images,
  tests, release scripts, and old build configuration are intentionally omitted.

The fork's package is configured for GitHub Packages, while its README links to
the differently maintained unscoped npm package. Vendoring this pinned source
keeps this application reproducible without registry credentials or a CDN and
ensures that the requested fork is actually used. Vite bundles this source with
the public npm dependency `qrcode-generator@1.4.4`.

## Local changes

1. `src/core/QRCanvas.ts`: reject the image-loading promise on `image.onerror`.
2. `src/core/QRSVG.ts`: reject the image-loading promise on `image.onerror` and
   remove the debug statement that logged an entire image data URL.
3. Both renderers: map drawing coordinates `(x, y)` to the encoder's
   `isDark(row, column)` as `isDark(y, x)`, including styled-dot neighbor lookups.
   Upstream used `isDark(x, y)`, which transposed the symbol and required scanners
   to recover a mirrored QR code. Masks continue to use drawing coordinates;
   uploaded logos retain their normal orientation.

All other upstream source is unchanged. URL validation, UTF-8 encoding setup,
quiet-zone calculation, logo validation, rendering timeouts, and export checks
live in the application's `src/lib` adapters.

The source supports optional Node rendering through dependency injection. This
application does not supply those options or ship `canvas`, `jsdom`, or
browser Node polyfills. `jsdom` is a development-only test dependency.
Development-only Node type declarations describe the
upstream `Buffer` signatures without adding runtime code.

To update, deliberately choose a new upstream commit, retrieve the same source
and license files, review the upstream diff, reapply the patches above,
update this record, and rerun URL, QR scan, logo, and export checks.
