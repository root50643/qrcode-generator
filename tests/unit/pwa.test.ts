// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initPWA } from '../../src/pwa';

const sw = vi.hoisted(() => ({
  options: undefined as {
    immediate: boolean;
    onNeedRefresh(): void;
    onNeedReload(): void;
    onOfflineReady(): void;
    onRegisterError(): void;
  } | undefined,
  applyUpdate: vi.fn<() => Promise<void>>(),
  register: vi.fn(),
}));

vi.mock('virtual:pwa-register', () => ({
  registerSW: (options: NonNullable<typeof sw.options>) => {
    sw.options = options;
    sw.register(options);
    return sw.applyUpdate;
  },
}));

const state = {
  url: 'https://example.com/hello?name=NUU',
  color: '#5933a3',
  style: 'rounded',
  logo: 'data:image/png;base64,example',
};
const stateKey = 'nuu-qr:update-state:/';
let reload: ReturnType<typeof vi.fn>;
let events: EventTarget;
let media: EventTarget & { matches: boolean };
let browser: {
  onLine: boolean;
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  serviceWorker?: object;
};

function start() {
  const options = { getState: vi.fn(() => state), restoreState: vi.fn(), notify: vi.fn() };
  initPWA(options);
  return options;
}

function button(id: string) {
  return document.querySelector<HTMLButtonElement>(`#${id}`)!;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('PROD', true);
  vi.stubEnv('BASE_URL', '/');
  sessionStorage.clear();
  sw.options = undefined;
  sw.applyUpdate.mockResolvedValue(undefined);
  events = new EventTarget();
  media = Object.assign(new EventTarget(), { matches: false });
  reload = vi.fn();
  browser = {
    onLine: true,
    userAgent: 'Mozilla/5.0 Chrome/145.0.0.0',
    platform: 'Win32',
    maxTouchPoints: 0,
    serviceWorker: {},
  };
  // jsdom cannot navigate/reload or emulate an install prompt. Keep its real
  // document and storage, and replace only those browser integration boundaries.
  vi.stubGlobal('window', {
    location: { reload },
    matchMedia: vi.fn(() => media),
    addEventListener: events.addEventListener.bind(events),
  });
  vi.stubGlobal('navigator', browser);
  document.body.innerHTML = `
    <button id="install-button">Install app</button>
    <span id="offline-indicator" hidden>Offline mode</span>
    <aside id="pwa-update" hidden>
      <button id="update-button">Update now</button>
      <button id="dismiss-update-button">Later</button>
    </aside>
    <dialog id="install-dialog">
      <p id="install-instructions"></p>
      <button id="close-install-dialog">Close</button>
    </dialog>`;
  const dialog = document.querySelector<HTMLDialogElement>('#install-dialog')!;
  dialog.showModal = vi.fn(() => dialog.setAttribute('open', ''));
  dialog.close = vi.fn(() => dialog.removeAttribute('open'));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('explicit PWA updates', () => {
  it('prompts without saving or reloading, then preserves the design before applying an accepted update', async () => {
    const options = start();
    expect(sw.register).toHaveBeenCalledOnce();
    expect(sw.options!.immediate).toBe(true);

    sw.options!.onNeedRefresh();
    expect(document.querySelector<HTMLElement>('#pwa-update')!.hidden).toBe(false);
    expect(sw.applyUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(options.getState).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);

    button('dismiss-update-button').click();
    expect(document.querySelector<HTMLElement>('#pwa-update')!.hidden).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    sw.options!.onNeedRefresh();
    button('update-button').click();
    await vi.waitFor(() => expect(sw.applyUpdate).toHaveBeenCalledWith(true));
    expect(JSON.parse(sessionStorage.getItem(stateKey)!)).toEqual({ savedAt: expect.any(Number), state });
    expect(button('update-button').disabled).toBe(true);
    expect(reload).not.toHaveBeenCalled();

    sw.options!.onNeedReload();
    expect(reload).toHaveBeenCalledOnce();

    const nextLaunch = start();
    expect(nextLaunch.restoreState).toHaveBeenCalledExactlyOnceWith(state);
    expect(sessionStorage.getItem(stateKey)).toBeNull();
    expect(start().restoreState).not.toHaveBeenCalled();
  });

  it('keeps this editor open when another tab updates, until this tab also accepts', () => {
    const options = start();
    sw.options!.onNeedReload();
    expect(reload).not.toHaveBeenCalled();
    expect(options.getState).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLElement>('#pwa-update')!.hidden).toBe(false);

    button('update-button').click();
    expect(JSON.parse(sessionStorage.getItem(stateKey)!).state).toEqual(state);
    expect(reload).toHaveBeenCalledOnce();
    expect(sw.applyUpdate).not.toHaveBeenCalled();
  });

  it('does not activate an update if the edit cannot be preserved', () => {
    const options = start();
    sw.options!.onNeedRefresh();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is full', 'QuotaExceededError');
    });
    button('update-button').click();
    expect(sw.applyUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(button('update-button').disabled).toBe(false);
    expect(options.notify).toHaveBeenCalledWith(expect.stringContaining('could not save this edit'));
  });

  it('keeps the editor usable and removes the temporary snapshot if updating fails', async () => {
    const options = start();
    sw.applyUpdate.mockRejectedValue(new Error('Worker unavailable'));
    sw.options!.onNeedRefresh();
    button('update-button').click();
    await vi.waitFor(() => expect(button('update-button').disabled).toBe(false));
    expect(sessionStorage.getItem(stateKey)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    expect(options.notify).toHaveBeenCalledWith(expect.stringContaining('update could not be applied'));
  });

  it('discards an expired snapshot instead of unexpectedly restoring an old URL', () => {
    sessionStorage.setItem(stateKey, JSON.stringify({ savedAt: Date.now() - 11 * 60_000, state }));
    const options = start();
    expect(options.restoreState).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(stateKey)).toBeNull();
  });

  it('recovers from a malformed saved edit', () => {
    sessionStorage.setItem(stateKey, 'invalid JSON');
    const options = start();
    expect(options.restoreState).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(stateKey)).toBeNull();
    expect(options.notify).toHaveBeenCalledWith(expect.stringContaining('could not be restored'));
    expect(sw.register).toHaveBeenCalledOnce();
  });

  it('isolates temporary edits between a Pages subdirectory and the domain root', () => {
    sessionStorage.setItem(stateKey, JSON.stringify({ savedAt: Date.now(), state }));
    vi.stubEnv('BASE_URL', '/qrcode-generator/');
    const options = start();
    expect(options.restoreState).not.toHaveBeenCalled();
    sw.options!.onNeedRefresh();
    button('update-button').click();
    expect(sessionStorage.getItem('nuu-qr:update-state:/qrcode-generator/')).not.toBeNull();
    expect(sessionStorage.getItem(stateKey)).not.toBeNull();
  });

  it('does not register a service worker during development', () => {
    vi.stubEnv('PROD', false);
    start();
    expect(sw.register).not.toHaveBeenCalled();
  });
});

describe('installation and connection guidance', () => {
  it('shows English iPhone instructions and closes the help dialog', () => {
    browser.userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
    start();
    button('install-button').click();
    const dialog = document.querySelector<HTMLDialogElement>('#install-dialog')!;
    expect(dialog.open).toBe(true);
    expect(document.querySelector('#install-instructions')!.textContent).toContain('In Safari, tap the Share button');
    expect(document.querySelector('#install-instructions')!.textContent).toContain('Add to Home Screen');
    button('close-install-dialog').click();
    expect(dialog.open).toBe(false);
  });

  it('shows browser-menu guidance when no native install prompt is available', () => {
    start();
    button('install-button').click();
    expect(document.querySelector('#install-instructions')!.textContent).toContain('Open your browser menu');
    expect(document.querySelector<HTMLDialogElement>('#install-dialog')!.open).toBe(true);
  });

  it('only opens the native install prompt in response to a click', async () => {
    start();
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    events.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    button('install-button').click();
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledOnce());
    expect(document.querySelector<HTMLDialogElement>('#install-dialog')!.open).toBe(false);
  });

  it('hides installation controls inside an installed app', () => {
    media.matches = true;
    start();
    expect(button('install-button').hidden).toBe(true);
  });

  it('reflects offline and online connection events', () => {
    start();
    const indicator = document.querySelector<HTMLElement>('#offline-indicator')!;
    expect(indicator.hidden).toBe(true);
    browser.onLine = false;
    events.dispatchEvent(new Event('offline'));
    expect(indicator.hidden).toBe(false);
    browser.onLine = true;
    events.dispatchEvent(new Event('online'));
    expect(indicator.hidden).toBe(true);
  });
});
