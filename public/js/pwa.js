// ============================================================
// PWA Install Handler — Bhajan Planner
// Registers the service worker, intercepts the install prompt,
// shows a custom banner with size info, handles iOS separately
// ============================================================

(function () {
  'use strict';

  // ── Guard: don't run if already installed as standalone ─────
  if (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  ) {
    // Still register the SW for offline support inside the app
    registerServiceWorker();
    return;
  }

  // ── Service Worker Registration ─────────────────────────────
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js', { updateViaCache: 'none' })
          .then((reg) => {
            console.log('[PWA] Service Worker registered – scope:', reg.scope);
            // Check for updates every 60 minutes
            setInterval(() => reg.update(), 60 * 60 * 1000);
          })
          .catch((err) => console.error('[PWA] SW registration failed:', err));
      });
    }
  }

  registerServiceWorker();

  // ── Constants ───────────────────────────────────────────────
  const DISMISS_KEY  = 'pwa-install-dismissed';
  const DISMISS_DAYS = 7;
  const BANNER_DELAY = 2500; // ms before showing banner

  let deferredPrompt = null;

  // ── Helpers ─────────────────────────────────────────────────
  function wasDismissedRecently() {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    const daysSince = (Date.now() - parseInt(ts, 10)) / (1000 * 60 * 60 * 24);
    return daysSince < DISMISS_DAYS;
  }

  function isIOS() {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
    );
  }

  /**
   * Calculate the total size of assets in the service-worker cache.
   * Uses the Storage Estimate API safely, falling back to '< 2 MB'.
   */
  async function getEstimatedSize() {
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const { usage } = await navigator.storage.estimate();
        if (usage > 0) return formatBytes(usage);
      }
    } catch (e) {
      console.warn('[PWA] Could not estimate size:', e);
    }
    return '< 2 MB'; // safe fallback
  }

  function formatBytes(bytes) {
    const mb = bytes / (1024 * 1024);
    if (mb < 1)  return '< 1 MB';
    if (mb < 10) return `~${mb.toFixed(1)} MB`;
    return `~${Math.round(mb)} MB`;
  }

  // ── Banner Show / Hide ──────────────────────────────────────
  function showBanner(customDelay) {
    const overlay = document.getElementById('pwaInstallOverlay');
    if (!overlay) return;

    // Populate size
    getEstimatedSize().then((size) => {
      const el = document.getElementById('pwaBannerSize');
      if (el) el.textContent = size;
    });

    // Show iOS-specific instructions if needed
    if (isIOS()) {
      const iosEl = document.getElementById('pwaIosInstructions');
      const installBtn = document.getElementById('pwaBtnInstall');
      if (iosEl) iosEl.style.display = 'block';
      if (installBtn) installBtn.style.display = 'none';
    }

    const delay = typeof customDelay === 'number' ? customDelay : BANNER_DELAY;
    setTimeout(() => overlay.classList.add('show'), delay);
  }

  function hideBanner() {
    const overlay = document.getElementById('pwaInstallOverlay');
    if (overlay) overlay.classList.remove('show');
  }

  // ── Global trigger for manual install buttons (e.g. footer) ─
  window.triggerPwaInstall = function () {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isStandalone) {
      alert('✅ Bhajan Planner is already installed and running on your device!');
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choice) => {
        console.log('[PWA] Install prompt outcome:', choice.outcome);
        deferredPrompt = null;
        hideBanner();
      });
    } else {
      showBanner(0);
    }
  };

  // ── Wire up footer install button if present ────────────────
  function wireFooterInstallBtn() {
    const btn = document.getElementById('footerPwaInstallBtn');
    if (!btn) return;

    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isStandalone) {
      btn.innerHTML = '<span>✅</span> Installed on Device';
      btn.classList.add('installed');
      btn.disabled = true;
      return;
    }

    if (isIOS()) {
      btn.innerHTML = '<span>📲</span> Install on iPhone / iPad';
    } else {
      btn.innerHTML = '<span>📲</span> Install Bhajan Planner App';
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      window.triggerPwaInstall();
    });
  }

  // ── Intercept Chrome / Edge install prompt ──────────────────
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();          // suppress the browser's mini-infobar
    deferredPrompt = e;

    if (!wasDismissedRecently()) {
      showBanner();
    }
  });

  // ── Wire up banner buttons on DOM ready ─────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const installBtn  = document.getElementById('pwaBtnInstall');
    const dismissBtn  = document.getElementById('pwaBtnDismiss');
    const closeBtn    = document.getElementById('pwaBannerClose');

    wireFooterInstallBtn();

    // Install
    installBtn?.addEventListener('click', async () => {
      if (!deferredPrompt) {
        showBanner(0);
        return;
      }
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log('[PWA] Install prompt outcome:', outcome);
      deferredPrompt = null;
      hideBanner();
    });

    // Dismiss / close
    function dismiss() {
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
      hideBanner();
    }
    dismissBtn?.addEventListener('click', dismiss);
    closeBtn?.addEventListener('click', dismiss);

    // Close on overlay click (outside the banner card)
    const overlay = document.getElementById('pwaInstallOverlay');
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) dismiss();
    });

    // ── iOS: no beforeinstallprompt event, show manual banner ─
    if (isIOS() && !wasDismissedRecently()) {
      setTimeout(() => showBanner(), 4000);
    }
  });

  // ── Track successful install ────────────────────────────────
  window.addEventListener('appinstalled', () => {
    hideBanner();
    deferredPrompt = null;
    const btn = document.getElementById('footerPwaInstallBtn');
    if (btn) {
      btn.innerHTML = '<span>✅</span> Installed on Device';
      btn.disabled = true;
    }
    console.log('[PWA] Bhajan Planner installed successfully!');
  });
})();
