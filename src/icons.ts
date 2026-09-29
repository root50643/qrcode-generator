const paths: Record<string, string> = {
  link: '<path d="m10 13 4-4m-6 7-1 1a4.24 4.24 0 0 1-6-6l4-4a4.24 4.24 0 0 1 6 0m2 2 1-1a4.24 4.24 0 0 1 6 6l-4 4a4.24 4.24 0 0 1-6 0" transform="translate(1 -1)"/>',
  clipboard:
    '<rect x="5" y="5" width="14" height="16" rx="2"/><rect x="9" y="2" width="6" height="5" rx="1"/><path d="M9 12h6m-6 4h4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  sliders:
    '<path d="M4 7h4m4 0h8M4 17h8m4 0h4"/><circle cx="10" cy="7" r="2"/><circle cx="14" cy="17" r="2"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-5-5-7 8-3-3-3 3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  shield:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"/><path d="M14 2v6h6m-11 5-2 2 2 2m6-4 2 2-2 2"/>',
  install:
    '<rect x="6" y="3" width="12" height="18" rx="3"/><path d="M12 6v8m-3-3 3 3 3-3m-4 7h2"/>',
  wifi: '<path d="M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0m-3 4h.01"/>',
  infinity:
    '<path d="M12 12c-2-3-3-5-6-5a5 5 0 0 0 0 10c3 0 4-2 6-5s3-5 6-5a5 5 0 0 1 0 10c-3 0-4-2-6-5Z"/>',
  spark:
    '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z"/>',
  github:
    '<path d="M9 19c-4 1-4-2-6-2m12 5v-4a3.5 3.5 0 0 0-1-2.7c3.3-.4 6.8-1.6 6.8-7.3a5.7 5.7 0 0 0-1.5-4 5.3 5.3 0 0 0-.1-4s-1.2-.4-4.2 1.5a14.6 14.6 0 0 0-7.6 0C4.5-.4 3.2 0 3.2 0A5.3 5.3 0 0 0 3.1 4a5.7 5.7 0 0 0-1.5 4c0 5.7 3.5 6.9 6.8 7.3A3.5 3.5 0 0 0 7.4 18v4" transform="translate(1 1) scale(.9)"/>',
};
export function mountIcons() {
  document.querySelectorAll<HTMLElement>("[data-icon]").forEach((el) => {
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[el.dataset.icon ?? ""] ?? ""}</svg>`;
  });
}
