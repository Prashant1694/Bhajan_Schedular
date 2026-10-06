/**
 * Premium Haptic Feedback Engine — Bhajan Planner Native App Experience
 * Dual-layer tactile feedback combining precision linear motor micro-pulses
 * and sub-bass acoustic transients (Web Audio API) for genuine native Apple Taptic
 * & Android Linear Actuator sensation across iOS Safari, Chrome, and PWAs.
 */
(function (window) {
  "use strict";

  // Precision-calibrated linear motor timings (milliseconds)
  // Replaces crude long buzzes with ultra-crisp micro-ticks and shaped harmonic pulses
  var VIBE_PROFILES = {
    selection: [3], // Ultra-light 3ms tick for tabs, pickers, radio chips
    tick: [3], // Alias for selection
    light: [5], // Crisp 5ms mechanical click for standard buttons
    medium: [8], // Solid 8ms snap for primary CTAs and slot actions
    heavy: [14], // Firm 14ms impact for destructive / admin actions
    rigid: [10], // Stiff mechanical stop
    toggle: [4, 16, 6], // Dual-phase switch snap
    success: [4, 30, 8], // Affirmative crescendo double-tap
    warning: [7, 35, 7], // Dual cautionary notch pulses
    error: [8, 25, 8, 25, 12], // Triple crisp reject knock
    pop: [3, 16, 6] // Springy micro-pop
  };

  // Acoustic transient synthesizer parameters (Web Audio API)
  // Delivers physical speaker cone micro-impulses felt in hand (crucial for iOS Safari)
  var AUDIO_PROFILES = {
    selection: { freq: 140, endFreq: 45, duration: 0.007, gain: 0.12, type: "sine" },
    tick: { freq: 140, endFreq: 45, duration: 0.007, gain: 0.12, type: "sine" },
    light: { freq: 125, endFreq: 40, duration: 0.01, gain: 0.18, type: "sine" },
    medium: { freq: 100, endFreq: 30, duration: 0.014, gain: 0.25, type: "sine" },
    heavy: { freq: 85, endFreq: 25, duration: 0.018, gain: 0.32, type: "triangle" },
    rigid: { freq: 110, endFreq: 35, duration: 0.012, gain: 0.22, type: "square" },
    toggle: { freq: 130, endFreq: 50, duration: 0.011, gain: 0.2, type: "sine" },
    success: { freq: 160, endFreq: 220, duration: 0.024, gain: 0.22, type: "sine", double: true },
    warning: { freq: 95, endFreq: 80, duration: 0.016, gain: 0.24, type: "triangle" },
    error: { freq: 75, endFreq: 30, duration: 0.022, gain: 0.28, type: "sawtooth" },
    pop: { freq: 175, endFreq: 90, duration: 0.012, gain: 0.22, type: "sine" }
  };

  var hasVibration = typeof navigator !== "undefined" && "vibrate" in navigator;
  var isEnabled = true;
  var isSoundEnabled = true;
  var lastHapticTime = 0;
  var audioCtx = null;

  // Retrieve user preferences from localStorage
  try {
    var storedVibe = localStorage.getItem("bp_haptics_enabled");
    if (storedVibe !== null) isEnabled = storedVibe === "true";
    var storedSound = localStorage.getItem("bp_haptics_sound");
    if (storedSound !== null) isSoundEnabled = storedSound === "true";
  } catch (_) {}

  // Lazy-initialize Web Audio Context on first user touch/click
  function getAudioContext() {
    if (!audioCtx && typeof window !== "undefined") {
      try {
        var AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          audioCtx = new AudioContextClass();
        }
      } catch (_) {}
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(function () {});
    }
    return audioCtx;
  }

  // Synthesize sub-bass micro-transient impulse
  function playTactileTransient(profileName) {
    if (!isSoundEnabled) return;
    var ctx = getAudioContext();
    if (!ctx) return;

    var profile = AUDIO_PROFILES[profileName] || AUDIO_PROFILES.light;
    var now = ctx.currentTime;

    try {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();

      osc.type = profile.type || "sine";
      osc.frequency.setValueAtTime(profile.freq, now);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(10, profile.endFreq),
        now + profile.duration
      );

      gain.gain.setValueAtTime(profile.gain, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + profile.duration);

      // Play complementary second harmonic for success/pop profiles
      if (profile.double) {
        setTimeout(function () {
          if (!audioCtx) return;
          var t = audioCtx.currentTime;
          var osc2 = audioCtx.createOscillator();
          var gain2 = audioCtx.createGain();
          osc2.type = "sine";
          osc2.frequency.setValueAtTime(260, t);
          osc2.frequency.exponentialRampToValueAtTime(140, t + 0.016);
          gain2.gain.setValueAtTime(profile.gain * 0.9, t);
          gain2.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);
          osc2.connect(gain2);
          gain2.connect(audioCtx.destination);
          osc2.start(t);
          osc2.stop(t + 0.016);
        }, 32);
      }
    } catch (_) {}
  }

  /**
   * Main Haptic Trigger Function
   * Orchestrates both linear hardware motor pulses and acoustic transients
   * with debounce throttling to prevent muddy motor saturation.
   */
  function triggerHaptic(type) {
    if (!isEnabled) return;

    // Minimum 24ms throttle prevents queueing lag during rapid taps
    var now = Date.now();
    if (now - lastHapticTime < 24) return;
    lastHapticTime = now;

    var profileKey = type || "light";
    var pattern = VIBE_PROFILES[profileKey] || VIBE_PROFILES.light;

    // 1. Hardware Motor Vibration (Android, Chrome, supported browsers)
    if (hasVibration) {
      try {
        navigator.vibrate(pattern);
      } catch (_) {}
    }

    // 2. Tactile Audio Transient (iOS Safari physical feel + enhanced Android snap)
    playTactileTransient(profileKey);

    // 3. Propagate to parent window if running inside an embed iframe
    try {
      if (window.parent && window.parent !== window && window.parent.postMessage) {
        window.parent.postMessage({ type: "BP_HAPTIC", profile: profileKey }, "*");
      }
    } catch (_) {}
  }

  // Cross-frame listener (parent App Shell listens for iframe haptic events)
  if (typeof window !== "undefined") {
    window.addEventListener(
      "message",
      function (e) {
        if (e.data && e.data.type === "BP_HAPTIC" && typeof e.data.profile === "string") {
          // Run locally without re-propagating
          var profileKey = e.data.profile;
          if (hasVibration && isEnabled) {
            try {
              navigator.vibrate(VIBE_PROFILES[profileKey] || VIBE_PROFILES.light);
            } catch (_) {}
          }
          playTactileTransient(profileKey);
        }
      },
      { passive: true }
    );
  }

  function setHapticsEnabled(enabled) {
    isEnabled = !!enabled;
    try {
      localStorage.setItem("bp_haptics_enabled", isEnabled ? "true" : "false");
    } catch (_) {}
  }

  function setSoundEnabled(enabled) {
    isSoundEnabled = !!enabled;
    try {
      localStorage.setItem("bp_haptics_sound", isSoundEnabled ? "true" : "false");
    } catch (_) {}
  }

  function isHapticsEnabled() {
    return isEnabled;
  }

  function isTactileSoundEnabled() {
    return isSoundEnabled;
  }

  // Gesture-aware auto-binding: avoids triggering during scroll gestures
  function initAutoHaptics() {
    var touchStartX = 0;
    var touchStartY = 0;
    var activeTarget = null;
    var pointerId = null;

    // Wake audio context on first user touch
    document.addEventListener(
      "pointerdown",
      function (e) {
        getAudioContext();

        // Find closest interactive element
        var target = e.target.closest(
          '[data-haptic], .nav-tab, .native-action-btn, .button, .btn, .btn-live, .deity-card, .filter-chip, .tab-btn, .hub-tab-btn, .sheet-link-pill, .bulletin-view-all-pill, .app-bulletin-card, button, input[type="submit"]'
        );
        if (!target) return;

        activeTarget = target;
        pointerId = e.pointerId;
        touchStartX = e.clientX || 0;
        touchStartY = e.clientY || 0;

        // Direct instant-feedback elements (tabs, toggles, chips) fire immediately
        var isDirectTabOrChip =
          target.classList.contains("nav-tab") ||
          target.classList.contains("hub-tab-btn") ||
          target.classList.contains("tab-btn") ||
          target.classList.contains("filter-chip") ||
          target.classList.contains("native-action-btn") ||
          target.hasAttribute("data-instant-haptic");

        if (isDirectTabOrChip) {
          dispatchTargetHaptic(target);
          activeTarget = null; // Do not re-fire on release
        }
      },
      { passive: true }
    );

    document.addEventListener(
      "pointermove",
      function (e) {
        if (!activeTarget || e.pointerId !== pointerId) return;
        var dx = Math.abs((e.clientX || 0) - touchStartX);
        var dy = Math.abs((e.clientY || 0) - touchStartY);

        // If user drags more than 8 pixels, recognize as a scroll gesture and cancel
        if (dx > 8 || dy > 8) {
          activeTarget = null;
        }
      },
      { passive: true }
    );

    document.addEventListener(
      "pointerup",
      function (e) {
        if (!activeTarget || e.pointerId !== pointerId) {
          activeTarget = null;
          return;
        }
        dispatchTargetHaptic(activeTarget);
        activeTarget = null;
      },
      { passive: true }
    );

    document.addEventListener(
      "pointercancel",
      function () {
        activeTarget = null;
      },
      { passive: true }
    );
  }

  function dispatchTargetHaptic(target) {
    if (!target) return;
    var custom = target.getAttribute("data-haptic");
    if (custom) {
      triggerHaptic(custom);
      return;
    }

    if (target.classList.contains("nav-tab") || target.classList.contains("hub-tab-btn")) {
      triggerHaptic("selection");
    } else if (
      target.classList.contains("native-action-btn") ||
      target.classList.contains("shell-theme-btn")
    ) {
      triggerHaptic("light");
    } else if (
      target.classList.contains("primary") ||
      target.classList.contains("primary-live-btn") ||
      target.classList.contains("singer-hub-hero-cta")
    ) {
      triggerHaptic("medium");
    } else if (
      target.classList.contains("secondary") ||
      target.classList.contains("secondary-live-btn")
    ) {
      triggerHaptic("light");
    } else if (
      target.classList.contains("filter-chip") ||
      target.classList.contains("deity-card")
    ) {
      triggerHaptic("selection");
    } else {
      triggerHaptic("light");
    }
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initAutoHaptics);
    } else {
      initAutoHaptics();
    }
  }

  // Expose comprehensive global API
  window.BPHaptics = {
    trigger: triggerHaptic,
    tick: function () {
      triggerHaptic("selection");
    },
    light: function () {
      triggerHaptic("light");
    },
    medium: function () {
      triggerHaptic("medium");
    },
    heavy: function () {
      triggerHaptic("heavy");
    },
    rigid: function () {
      triggerHaptic("rigid");
    },
    toggle: function () {
      triggerHaptic("toggle");
    },
    success: function () {
      triggerHaptic("success");
    },
    warning: function () {
      triggerHaptic("warning");
    },
    error: function () {
      triggerHaptic("error");
    },
    pop: function () {
      triggerHaptic("pop");
    },
    setEnabled: setHapticsEnabled,
    setSoundEnabled: setSoundEnabled,
    isEnabled: isHapticsEnabled,
    isSoundEnabled: isTactileSoundEnabled,
    PROFILES: VIBE_PROFILES
  };

  // Shortcut convenience
  window.triggerHaptic = triggerHaptic;
})(typeof window !== "undefined" ? window : this);
