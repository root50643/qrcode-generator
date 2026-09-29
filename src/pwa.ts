import { registerSW } from 'virtual:pwa-register';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PWAOptions {
  getState(): unknown;
  restoreState(state: unknown): void;
  notify(message: string): void;
}

/** Preserve the current editor only when the user explicitly applies an update. */
export function initPWA({ getState, restoreState, notify }: PWAOptions): void {
  const stateKey = `nuu-qr:update-state:${import.meta.env.BASE_URL}`;
  try {
    const saved = sessionStorage.getItem(stateKey);
    if (saved) {
      sessionStorage.removeItem(stateKey);
      const payload = JSON.parse(saved) as { savedAt: number; state: unknown };
      if (Date.now() - payload.savedAt < 10 * 60 * 1000) restoreState(payload.state);
    }
  } catch {
    notify('Your previous edit could not be restored. Please enter your URL again.');
  }

  const installButton = document.querySelector<HTMLButtonElement>('#install-button');
  const installDialog = document.querySelector<HTMLDialogElement>('#install-dialog');
  const installInstructions = document.querySelector<HTMLElement>('#install-instructions');
  const offlineIndicator = document.querySelector<HTMLElement>('#offline-indicator');
  const updateNotice = document.querySelector<HTMLElement>('#pwa-update');
  const updateButton = document.querySelector<HTMLButtonElement>('#update-button');
  const standalone = window.matchMedia('(display-mode: standalone)');
  let installPrompt: InstallPromptEvent | undefined;
  let updateReady = false;
  let updateRequested = false;
  let updatedWorkerIsActive = false;

  const reflectConnection = () => {
    if (offlineIndicator) offlineIndicator.hidden = navigator.onLine;
  };
  reflectConnection();
  window.addEventListener('online', reflectConnection);
  window.addEventListener('offline', reflectConnection);

  const reflectInstallation = () => {
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone;
    if (installButton) installButton.hidden = standalone.matches || Boolean(iosStandalone);
  };
  reflectInstallation();
  standalone.addEventListener('change', reflectInstallation);

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = undefined;
    if (installButton) installButton.hidden = true;
    if (installDialog?.open) installDialog.close();
    notify('NUU QR is installed. Find it on your home screen or in your apps.');
  });

  installButton?.addEventListener('click', async () => {
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = undefined;
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } catch {
        notify('Installation is unavailable right now. Try your browser’s install menu.');
      }
      return;
    }

    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const instructions = isIOS
      ? 'In Safari, tap the Share button, choose Add to Home Screen, then tap Add. Open NUU QR online once to make it available offline.'
      : 'Open your browser menu and choose Install app or Add to Home Screen. If you do not see that option, use a browser that supports installed web apps, such as Chrome or Edge. Open the app online once before using it offline.';
    if (installInstructions) installInstructions.textContent = instructions;
    if (installDialog && !installDialog.open) installDialog.showModal();
    else notify(instructions);
  });
  document.querySelector('#close-install-dialog')?.addEventListener('click', () => installDialog?.close());
  installDialog?.addEventListener('click', (event) => {
    if (event.target !== installDialog) return;
    const rect = installDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
      installDialog.close();
    }
  });

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  let lastUpdateCheck = 0;
  const applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady = true;
      if (updateNotice) updateNotice.hidden = false;
    },
    onNeedReload() {
      // Another open tab may activate the worker. Keep this tab's edit intact
      // until its user also chooses Update, rather than reloading every tab.
      if (updateRequested) {
        window.location.reload();
      } else {
        updatedWorkerIsActive = true;
        updateReady = true;
        if (updateNotice) updateNotice.hidden = false;
      }
    },
    onOfflineReady() {
      notify('Ready when you are. NUU QR now works offline.');
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const checkForUpdate = () => {
        if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - lastUpdateCheck < 60_000) return;
        lastUpdateCheck = Date.now();
        void registration.update().catch(() => { /* Keep the current app usable if the network is interrupted. */ });
      };
      document.addEventListener('visibilitychange', checkForUpdate);
      window.addEventListener('online', checkForUpdate);
    },
    onRegisterError() {
      notify('Offline access could not be enabled. You can still create and download QR codes here.');
    },
  });

  document.querySelector('#dismiss-update-button')?.addEventListener('click', () => {
    if (updateNotice) updateNotice.hidden = true;
  });
  updateButton?.addEventListener('click', async () => {
    if (!updateReady) return;
    try {
      sessionStorage.setItem(stateKey, JSON.stringify({ savedAt: Date.now(), state: getState() }));
    } catch {
      notify('Your browser could not save this edit for the update. Download your QR code and try updating again.');
      return;
    }
    updateButton.disabled = true;
    updateRequested = true;
    try {
      if (updatedWorkerIsActive) window.location.reload();
      else await applyUpdate(true);
    } catch {
      try { sessionStorage.removeItem(stateKey); } catch { /* Storage may be blocked. */ }
      updateRequested = false;
      updateButton.disabled = false;
      notify('The update could not be applied. Your current edit is still here. Please try again.');
    }
  });
}
