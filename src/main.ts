import "./style.css";
import { mountIcons } from "./icons";
import { normalizeUrl } from "./lib/url";
import { loadLogo } from "./lib/logo";
import { renderQR, type DotStyle } from "./lib/qr";
import { initPWA } from "./pwa";

mountIcons();
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const input = $<HTMLInputElement>("url-input");
const colorInput = $<HTMLInputElement>("color-input");
const styleInput = $<HTMLSelectElement>("dot-style");
const logoInput = $<HTMLInputElement>("logo-input");
const pngButton = $<HTMLButtonElement>("download-png");
const svgButton = $<HTMLButtonElement>("download-svg");
const pasteButton = $<HTMLButtonElement>("paste-button");
const preview = $("preview");
let logo: string | undefined;
let logoName = "";
let logoPending = false;
let logoRevision = 0;
let revision = 0;
let renderTimer: ReturnType<typeof setTimeout>;
let toastTimer: ReturnType<typeof setTimeout>;
let rendered: Awaited<ReturnType<typeof renderQR>> | undefined;
const patterns: DotStyle[] = [
  "square",
  "rounded",
  "dots",
  "classy",
  "classy-rounded",
  "extra-rounded",
];

function notify(message: string) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, 5500);
}
function showInputError(message = "") {
  $("input-error").textContent = message;
  $("input-error").hidden = !message;
  input.setAttribute("aria-invalid", String(Boolean(message)));
}
function setStatus(message: string, ready = false) {
  $("preview-status").textContent = message;
  $("preview-status").classList.toggle("ready", ready);
}
function invalidate() {
  ++revision;
  clearTimeout(renderTimer);
  rendered = undefined;
  pngButton.disabled = true;
  svgButton.disabled = true;
  preview.replaceChildren();
  preview.hidden = true;
  $("empty-preview").hidden = false;
  $("encoded-url").hidden = true;
  $("encoded-url").textContent = "";
  $("preview-caption").textContent = "Made for screens. Ready for print.";
  $("clear-button").hidden = !input.value;
  showInputError();
}
function scheduleRender(delay = 180) {
  invalidate();
  if (logoPending) {
    setStatus("Preparing logo…");
    return;
  }
  if (!input.value.trim()) {
    setStatus("Awaiting a link");
    return;
  }
  setStatus("Creating…");
  const current = revision;
  renderTimer = setTimeout(async () => {
    let url: string;
    try {
      url = normalizeUrl(input.value);
    } catch (error) {
      if (current !== revision) return;
      showInputError(
        error instanceof Error ? error.message : "Enter a valid website URL.",
      );
      setStatus("Check your link");
      return;
    }
    try {
      const result = await renderQR({
        url,
        color: colorInput.value,
        style: styleInput.value as DotStyle,
        logo,
      });
      if (current !== revision) return;
      rendered = result;
      preview.replaceChildren(result.element);
      preview.hidden = false;
      $("empty-preview").hidden = true;
      $("encoded-url").textContent = url;
      $("encoded-url").hidden = false;
      $("preview-caption").textContent = "SCAN TO OPEN";
      pngButton.disabled = false;
      svgButton.disabled = false;
      setStatus("Ready to share", true);
    } catch (error) {
      if (current !== revision) return;
      showInputError(
        error instanceof Error
          ? error.message
          : "We could not create this QR code. Try a shorter link.",
      );
      setStatus("Unable to create");
    }
  }, delay);
}
function updateColorUI() {
  $("color-value").textContent = colorInput.value.toUpperCase();
  const rgb = colorInput.value.match(/[a-f0-9]{2}/gi)!.map((value) => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  $("color-warning").hidden = 1.05 / (luminance + 0.05) >= 4.5;
  document
    .querySelectorAll<HTMLButtonElement>("[data-color]")
    .forEach((button) => {
      const selected = button.dataset.color === colorInput.value;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
}
function updateLogoUI() {
  $("logo-name").textContent = logo ? logoName || "Your logo" : "Add your logo";
  $("logo-caption").textContent = logo
    ? "Stored on your device only"
    : "PNG, JPG or WebP · up to 5 MB";
  $("remove-logo").hidden = !logo;
  $("logo-error").hidden = true;
  logoInput.disabled = false;
}
input.addEventListener("input", () => scheduleRender());
$("clear-button").addEventListener("click", () => {
  input.value = "";
  scheduleRender(0);
  input.focus();
});
pasteButton.addEventListener("click", async () => {
  pasteButton.disabled = true;
  try {
    if (!navigator.clipboard?.readText)
      throw new Error("Clipboard unavailable");
    const value = await navigator.clipboard.readText();
    if (!value.trim()) {
      notify("Your clipboard has no text to paste.");
      return;
    }
    input.value = value.trim();
    scheduleRender(0);
    input.focus();
    notify("Link pasted from your clipboard.");
  } catch {
    notify(
      "Clipboard access is unavailable. Please paste manually into the Website URL field.",
    );
    input.focus();
  } finally {
    pasteButton.disabled = false;
  }
});
colorInput.addEventListener("input", () => {
  updateColorUI();
  scheduleRender();
});
styleInput.addEventListener("change", () => scheduleRender(0));
document
  .querySelectorAll<HTMLButtonElement>("[data-color]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      colorInput.value = button.dataset.color!;
      updateColorUI();
      scheduleRender(0);
    });
  });
logoInput.addEventListener("change", async () => {
  const file = logoInput.files?.[0];
  if (!file) return;
  const current = ++logoRevision;
  logoPending = true;
  scheduleRender(0);
  logoInput.disabled = true;
  $("logo-error").hidden = true;
  $("logo-name").textContent = "Preparing your logo…";
  try {
    const data = await loadLogo(file);
    if (current !== logoRevision) return;
    logoPending = false;
    logo = data;
    logoName = file.name;
    updateLogoUI();
    scheduleRender(0);
  } catch (error) {
    if (current !== logoRevision) return;
    logoPending = false;
    updateLogoUI();
    $("logo-error").textContent =
      error instanceof Error
        ? error.message
        : "This image could not be opened. Please try another file.";
    $("logo-error").hidden = false;
    scheduleRender(0);
  } finally {
    if (current === logoRevision) {
      logoInput.disabled = false;
      logoInput.value = "";
    }
  }
});
$("remove-logo").addEventListener("click", () => {
  ++logoRevision;
  logoPending = false;
  logo = undefined;
  logoName = "";
  logoInput.value = "";
  updateLogoUI();
  scheduleRender(0);
});
$("reset-style").addEventListener("click", () => {
  ++logoRevision;
  logoPending = false;
  colorInput.value = "#000000";
  styleInput.value = "square";
  logo = undefined;
  logoName = "";
  logoInput.value = "";
  updateColorUI();
  updateLogoUI();
  scheduleRender(0);
  notify("Appearance reset to classic black and white.");
});
async function download(format: "png" | "svg") {
  if (!rendered) return;
  const source = rendered;
  const current = revision;
  pngButton.disabled = true;
  svgButton.disabled = true;
  try {
    const blob = await source[format]();
    if (current !== revision) return;
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `nuu-qr.${format}`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    notify(`Your ${format.toUpperCase()} is ready. Check your downloads.`);
  } catch {
    notify("The download could not be prepared. Please try again.");
  } finally {
    if (current === revision && rendered) {
      pngButton.disabled = false;
      svgButton.disabled = false;
    }
  }
}
pngButton.addEventListener("click", () => void download("png"));
svgButton.addEventListener("click", () => void download("svg"));

initPWA({
  getState: () => ({
    url: input.value,
    color: colorInput.value,
    style: styleInput.value,
    logo,
    logoName,
    customize: $<HTMLDetailsElement>("customize").open,
  }),
  restoreState: (state: unknown) => {
    if (!state || typeof state !== "object") return;
    const saved = state as Record<string, unknown>;
    if (typeof saved.url === "string") input.value = saved.url;
    if (typeof saved.color === "string" && /^#[a-f\d]{6}$/i.test(saved.color))
      colorInput.value = saved.color;
    if (patterns.includes(saved.style as DotStyle))
      styleInput.value = saved.style as string;
    if (
      typeof saved.logo === "string" &&
      /^data:image\/(png|jpeg|webp);base64,/.test(saved.logo)
    )
      logo = saved.logo;
    if (typeof saved.logoName === "string") logoName = saved.logoName;
    $<HTMLDetailsElement>("customize").open = saved.customize === true;
    updateColorUI();
    updateLogoUI();
    scheduleRender(0);
  },
  notify,
});
