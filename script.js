(() => {
  "use strict";


  const API_BASE = "http://127.0.0.1:8000";

  const form = document.getElementById("predict-form");
  const submitBtn = document.getElementById("submit-btn");
  const resetBtn = document.getElementById("reset-btn");
  const errorRetryBtn = document.getElementById("error-retry-btn");

  const stateIdle = document.getElementById("state-idle");
  const stateLoading = document.getElementById("state-loading");
  const stateResult = document.getElementById("state-result");
  const stateError = document.getElementById("state-error");

  const scoreNumberEl = document.getElementById("score-number");
  const scoreBandEl = document.getElementById("score-band");
  const scoreContextEl = document.getElementById("score-context");
  const gaugeFill = document.getElementById("gauge-fill");
  const errorCopyEl = document.getElementById("error-copy");

  const GAUGE_ARC_LENGTH = 314; // approx pi * r(100)

  // ---------------------------------------------------------
  // Draw tick marks on gauges
  // ---------------------------------------------------------
  function drawTicks() {
    document.querySelectorAll(".gauge-ticks").forEach((g) => {
      g.innerHTML = "";
      const cx = 120, cy = 140, rOuter = 100, rInner = 90;
      for (let i = 0; i <= 10; i += 2) {
        const angle = Math.PI - (i / 10) * Math.PI;
        const x1 = cx + rOuter * Math.cos(angle);
        const y1 = cy - rOuter * Math.sin(angle);
        const x2 = cx + rInner * Math.cos(angle);
        const y2 = cy - rInner * Math.sin(angle);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x1.toFixed(1));
        line.setAttribute("y1", y1.toFixed(1));
        line.setAttribute("x2", x2.toFixed(1));
        line.setAttribute("y2", y2.toFixed(1));
        g.appendChild(line);
      }
    });
  }
  drawTicks();

  // ---------------------------------------------------------
  // Segmented control (stress_level)
  // ---------------------------------------------------------
  const segGroup = document.getElementById("stress_level_group");
  const stressHiddenInput = document.getElementById("stress_level");
  if (segGroup && stressHiddenInput) {
    segGroup.querySelectorAll(".seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        segGroup.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        stressHiddenInput.value = btn.dataset.value;
        clearFieldError(stressHiddenInput);
      });
    });
  }

  // ---------------------------------------------------------
  // Field error helpers
  // ---------------------------------------------------------
  function fieldWrapper(input) {
    return input ? input.closest(".field") : null;
  }

  function setFieldError(input, message) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.add("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = message;
  }

  function clearFieldError(input) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.remove("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = "";
  }

  function clearAllErrors() {
    if (!form) return;
    form.querySelectorAll(".field").forEach((f) => f.classList.remove("field-error"));
    form.querySelectorAll(".error-msg").forEach((m) => (m.textContent = ""));
  }

  // ---------------------------------------------------------
  // Client-side validation
  // ---------------------------------------------------------
  function validate(payload) {
    const errors = [];

    const numericChecks = [
      ["Age", 10, 100],
      ["Avg_Daily_Usage_Hours", 0, 24],
      ["Daily_Unlocks", 0, 500],
      ["Study_Hours", 0, 24],
      ["Physical_Activity_Hours", 0, 24],
      ["Sleep_Hours_Per_Night", 0, 24],
    ];

    numericChecks.forEach(([key, min, max]) => {
      const input = document.getElementById(key.toLowerCase());
      const val = payload[key];
      if (val === "" || val === null || Number.isNaN(val)) {
        errors.push([input, "This field is required."]);
      } else if (val < min || val > max) {
        errors.push([input, `Must be between ${min} and ${max}.`]);
      }
    });

    ["Gender", "Country", "Academic_Level", "Most_Used_Platform", "Purpose_Of_Use"].forEach((key) => {
      const input = document.getElementById(key.toLowerCase());
      if (!payload[key] || String(payload[key]).trim() === "") {
        errors.push([input, "This field is required."]);
      }
    });

    if (!payload.Stress_Level) {
      errors.push([stressHiddenInput, "Pick a stress level."]);
    }

    return errors;
  }

  function getVal(fd, key) {
    return fd.get(key) ?? fd.get(key.toLowerCase()) ?? "";
  }

  // ---------------------------------------------------------
  // Gather form data matching FastAPI model contract
  // ---------------------------------------------------------
  function collectPayload() {
    const fd = new FormData(form);

    const ageRaw = getVal(fd, "age");
    const usageRaw = getVal(fd, "avg_daily_usage_hours");
    const unlocksRaw = getVal(fd, "daily_unlocks");
    const studyRaw = getVal(fd, "study_hours");
    const activityRaw = getVal(fd, "physical_activity_hours");
    const sleepRaw = getVal(fd, "sleep_hours_per_night");

    return {
      Age: ageRaw === "" ? NaN : parseInt(ageRaw, 10),
      Gender: String(getVal(fd, "gender")),
      Country: String(getVal(fd, "country")).trim(),
      Academic_Level: String(getVal(fd, "academic_level")),
      Most_Used_Platform: String(getVal(fd, "most_used_platform")),
      Purpose_Of_Use: String(getVal(fd, "purpose_of_use")),
      Avg_Daily_Usage_Hours: usageRaw === "" ? NaN : parseFloat(usageRaw),
      Daily_Unlocks: unlocksRaw === "" ? NaN : parseInt(unlocksRaw, 10), // strict integer
      Study_Hours: studyRaw === "" ? NaN : parseFloat(studyRaw),
      Physical_Activity_Hours: activityRaw === "" ? NaN : parseFloat(activityRaw),
      Sleep_Hours_Per_Night: sleepRaw === "" ? NaN : parseFloat(sleepRaw),
      Stress_Level: String(getVal(fd, "stress_level")),
    };
  }

  // ---------------------------------------------------------
  // UI state management
  // ---------------------------------------------------------
  function showState(name) {
    [stateIdle, stateLoading, stateResult, stateError].forEach((el) => {
      if (el) el.hidden = true;
    });
    const target = { idle: stateIdle, loading: stateLoading, result: stateResult, error: stateError }[name];
    if (target) target.hidden = false;
  }

  function setSubmitting(isSubmitting) {
    if (submitBtn) {
      submitBtn.disabled = isSubmitting;
      submitBtn.classList.toggle("loading", isSubmitting);
    }
  }

  // ---------------------------------------------------------
  // Dynamic Score Tiering & Red/Amber/Green Colors
  // ---------------------------------------------------------
  function bandFor(score) {
    // Low Score (0 - 4.0): Red (Strained)
    if (score <= 4.0) {
      return {
        color: "#D9534F",
        label: "Signal: Strained (Low)",
        context: "Your responses suggest elevated strain right now. Small shifts in sleep or screen time can go a long way.",
      };
    }
    // Mid Score (4.1 - 7.0): Amber (Moderate)
    if (score <= 7.0) {
      return {
        color: "#E3B341",
        label: "Signal: Balanced (Moderate)",
        context: "Your rhythm looks fairly steady, with some room to recover and reset.",
      };
    }
    // High Score (7.1 - 10.0): Green (Strong)
    return {
      color: "#4C9A78",
      label: "Signal: Strong (Healthy)",
      context: "Your habits point to a well-supported, resilient baseline. Keep it up.",
    };
  }

  function renderResult(score) {
    const clamped = Math.max(0, Math.min(10, score));
    const { color, label, context } = bandFor(clamped);

    if (scoreNumberEl) {
      scoreNumberEl.textContent = clamped.toFixed(1);
      scoreNumberEl.style.color = color;
    }
    if (scoreBandEl) {
      scoreBandEl.textContent = label;
      scoreBandEl.style.color = color;
    }
    if (scoreContextEl) scoreContextEl.textContent = context;

    if (gaugeFill) {
      gaugeFill.style.stroke = color;
      gaugeFill.style.transition = "none";
      gaugeFill.style.strokeDashoffset = String(GAUGE_ARC_LENGTH);

      requestAnimationFrame(() => {
        gaugeFill.style.transition = "stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)";
        const offset = GAUGE_ARC_LENGTH * (1 - clamped / 10);
        gaugeFill.style.strokeDashoffset = String(offset);
      });
    }

    showState("result");
  }

  function renderError(copy) {
    if (errorCopyEl) errorCopyEl.textContent = copy;
    showState("error");
  }

  // ---------------------------------------------------------
  // FastAPI 422 Handler
  // ---------------------------------------------------------
  function applyServerValidationErrors(detail) {
    if (!Array.isArray(detail)) return false;
    let matched = false;
    detail.forEach((err) => {
      const field = Array.isArray(err.loc) ? err.loc[err.loc.length - 1] : null;
      if (!field) return;

      const input = document.getElementById(field.toLowerCase());
      const target = field.toLowerCase() === "stress_level" ? stressHiddenInput : input;
      if (target) {
        setFieldError(target, err.msg || "Invalid value.");
        matched = true;
      }
    });
    return matched;
  }

  // ---------------------------------------------------------
  // Form submission
  // ---------------------------------------------------------
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); // Stop default browser refresh
      clearAllErrors();

      const payload = collectPayload();
      const clientErrors = validate(payload);

      if (clientErrors.length > 0) {
        clientErrors.forEach(([input, msg]) => input && setFieldError(input, msg));
        clientErrors[0][0]?.focus?.();
        return;
      }

      setSubmitting(true);
      showState("loading");

      try {
        const res = await fetch(`${API_BASE}/predict`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.status === 422) {
          const body = await res.json().catch(() => null);
          const matched = body && applyServerValidationErrors(body.detail);
          renderError(
            matched
              ? "The API rejected a few fields. Details are marked in red."
              : "The API rejected this submission. Please verify your inputs."
          );
          return;
        }

        if (!res.ok) {
          let detailMsg = `The API responded with status ${res.status}.`;
          const body = await res.json().catch(() => null);
          if (body && typeof body.detail === "string") detailMsg = body.detail;
          renderError(detailMsg);
          return;
        }

        const data = await res.json();
        const score = Number(data.predicted_mental_health_score);
        if (Number.isNaN(score)) {
          renderError("The API responded, but the score was missing or malformed.");
          return;
        }

        renderResult(score);
      } catch (err) {
        renderError(`Couldn't connect to ${API_BASE}. Make sure the backend server is running and CORS is enabled.`);
      } finally {
        setSubmitting(false);
      }
    });

    form.querySelectorAll("input, select").forEach((el) => {
      el.addEventListener("input", () => clearFieldError(el));
      el.addEventListener("change", () => clearFieldError(el));
    });
  }

  if (resetBtn) resetBtn.addEventListener("click", () => showState("idle"));
  if (errorRetryBtn) errorRetryBtn.addEventListener("click", () => showState("idle"));
})();