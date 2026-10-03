/**
 * Sri Sathya Sai Seva Organisation • Gandhinagar Samiti
 * Phase 2: The Prasanthi Mandir & Sarva Dharma Dawn Engine
 * Session-Guarded (Once Per Session) + Instant Skip + Ethereal Fade-Out
 */
(function () {
  const loader = document.getElementById("loader-overlay");
  if (!loader) return;

  // Session guard: if already shown in this tab/session, dismiss immediately with 0 delay
  try {
    if (sessionStorage.getItem("mandir_splash_seen") === "1") {
      document.body.classList.remove("loading-lock");
      if (loader.parentNode) loader.parentNode.removeChild(loader);
      return;
    }
    // Mark as seen for this session
    sessionStorage.setItem("mandir_splash_seen", "1");
  } catch (e) {}

  const canvas = document.getElementById("loader-starfield");
  const img1 = document.getElementById("mandir-img-1");
  const img2 = document.getElementById("mandir-img-2");
  const progressBar = document.getElementById("loader-progress-bar");
  const progressNum = document.getElementById("loader-progress-num");
  const statusText = document.getElementById("loader-status-text");
  const quoteText = document.getElementById("loader-quote-text");
  const skipBtn = document.getElementById("loader-skip-btn");

  // Normal loading time (1.8 seconds)
  const MIN_TIME = 1800;
  const HARD_TIMEOUT = 4500;
  const startTime = Date.now();

  // Devotional Milestones
  const milestones = [
    { pct: 0,  text: "CONNECTING TO PRASANTHI NILAYAM SANCTUM..." },
    { pct: 30, text: "HARMONIZING 1,024+ MANDIR MASTER BHAJANS..." },
    { pct: 52, text: "OPENING SAI KULWANT HALL SANCTUM SANCTORUM..." },
    { pct: 78, text: "PREPARING DEVOTEE SONGBOOK & REPERTOIRE..." },
    { pct: 94, text: "SANCTUARY ALIGNED. WELCOME WITH LOVING SAI RAM..." }
  ];

  // Uplifting Bhagawan Sri Sathya Sai Baba Quotes
  const quotes = [
    "Love All • Serve All — Help Ever • Hurt Never",
    "Life is a Song • Sing It to Bhagawan",
    "Bhajans purify the mind and cleanse the atmosphere",
    "Where there is Faith, there is Love; Where there is Love, there is Peace",
    "Start the Day with Love • Fill the Day with Love • End the Day with Love",
    "Let the heart sing, not merely the lips"
  ];

  if (quoteText) {
    quoteText.textContent = quotes[Math.floor(Math.random() * quotes.length)];
  }

  // Lock scroll
  document.body.classList.add("loading-lock");

  // Instant Skip on button click
  if (skipBtn) {
    skipBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dismissLoader();
    });
  }

  // ==========================================================================
  // MANDIR IMAGE CROSS-FADE LOGIC
  // ==========================================================================
  let switchedToSecond = false;
  function handleMandirTransition(currentProgress) {
    if (!switchedToSecond && currentProgress >= 50) {
      switchedToSecond = true;
      if (img1 && img2) {
        img1.classList.remove("active");
        img2.classList.add("active");
      }
    }
  }

  // ==========================================================================
  // DAWN CELESTIAL STARDUST CANVAS SIMULATION
  // ==========================================================================
  let animFrameId = null;
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext("2d");
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    function onResize() {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }
    window.addEventListener("resize", onResize);

    const particles = [];
    const PARTICLE_COUNT = Math.min(36, Math.floor(window.innerWidth / 28));

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 2 + 0.8,
        speedY: Math.random() * 0.5 + 0.25,
        speedX: (Math.random() - 0.5) * 0.25,
        opacity: Math.random() * 0.5 + 0.2,
        pulseSpeed: Math.random() * 0.03 + 0.015,
        pulseAngle: Math.random() * Math.PI * 2
      });
    }

    function renderParticles() {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.y -= p.speedY;
        p.x += Math.sin(p.pulseAngle) * p.speedX;
        p.pulseAngle += p.pulseSpeed;

        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;

        const currentOpacity = p.opacity * (0.7 + 0.3 * Math.sin(p.pulseAngle));

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(217, 138, 43, ${currentOpacity})`;
        ctx.shadowColor = "#f59e0b";
        ctx.shadowBlur = 4;
        ctx.fill();
      }

      ctx.shadowBlur = 0;
      animFrameId = requestAnimationFrame(renderParticles);
    }

    animFrameId = requestAnimationFrame(renderParticles);
  }

  // ==========================================================================
  // PROGRESS LOOP & SMOOTH AMBIENT FADE-OUT
  // ==========================================================================
  let isDismissed = false;

  function updateProgress() {
    if (isDismissed) return;

    const elapsed = Date.now() - startTime;
    const rawRatio = Math.min(1, elapsed / MIN_TIME);
    const easedProgress = Math.floor(rawRatio * 100);

    if (progressBar) progressBar.style.width = `${easedProgress}%`;
    if (progressNum) progressNum.textContent = `${easedProgress}%`;

    // Cross-fade mandir photo at 50%
    handleMandirTransition(easedProgress);

    // Start background fade-out as loading nears completion (at ~78%)
    if (easedProgress >= 78) {
      loader.classList.add("fade-out-start");
    }

    // Update status text
    if (statusText) {
      for (let i = milestones.length - 1; i >= 0; i--) {
        if (easedProgress >= milestones[i].pct) {
          if (statusText.textContent !== milestones[i].text) {
            statusText.textContent = milestones[i].text;
          }
          break;
        }
      }
    }

    if (elapsed < MIN_TIME) {
      requestAnimationFrame(updateProgress);
    } else {
      dismissLoader();
    }
  }

  requestAnimationFrame(updateProgress);

  // ==========================================================================
  // DISMISS & CLEANUP (Smooth Ethereal Dissolve)
  // ==========================================================================
  function dismissLoader() {
    if (isDismissed) return;
    isDismissed = true;

    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (progressBar) progressBar.style.width = "100%";
    if (progressNum) progressNum.textContent = "100%";

    // Smooth exit dissolve into the application
    loader.classList.add("dismissing");
    document.body.classList.remove("loading-lock");

    setTimeout(() => {
      if (loader && loader.parentNode) {
        loader.parentNode.removeChild(loader);
      }
    }, 650);
  }

  // Fallback safety timeout
  setTimeout(dismissLoader, HARD_TIMEOUT);

  // Handle bfcache
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) dismissLoader();
  });
})();