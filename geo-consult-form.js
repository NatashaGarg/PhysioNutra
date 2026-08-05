/*
  PhysioNutra consultation forms: geo-switch + shared slot booking
  -------------------------------------------------------------------
  Visitors browsing from India see the "Book Consultation" form.
  Visitors browsing from anywhere else see the "Book Online Consultation"
  form (email required, country/timezone/video platform, no home-visit).

  Both forms now share ONE real booking backend (a Google Apps Script Web
  App backed by a Google Sheet — see AppsScript-Code.gs for setup). This is
  what prevents double-booking: if an Indian patient and a foreign patient
  both try to grab the same time slot, only the first submission wins —
  the second is told the slot was just taken and must pick another.

  ⚠ REQUIRED SETUP: replace APPS_SCRIPT_URL below with your own deployed
  Apps Script Web App URL (see AppsScript-Code.gs for the one-time setup
  steps). Until you do, slot lists will show but booking submissions will
  fail silently against a placeholder URL — swap it in before going live.

  Geo detection: free IP lookup (https://ipapi.co/json/), no API key
  needed. Cached in sessionStorage. If it fails/times out, we silently
  keep showing the default India form — nothing breaks.

  MANUAL OVERRIDES (for testing):
    yoursite.com/?consult=foreign   (forces the online/foreign form)
    yoursite.com/?consult=india     (forces the in-clinic/India form)
*/

(function () {
  "use strict";

  // ⚠ REPLACE THIS with your deployed Apps Script Web App URL (ends in /exec)
  var APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwjM1zEvNAbPf7DhVQauGPrJxuoHouXSJ6hVjifFyj0fzXAVTExSRoifh4kTbJmn1wt/exec";

  var CACHE_KEY = "pn_visitor_country";
  var FETCH_TIMEOUT_MS = 3000;
  var bookedSlots = {}; // { "<ms>": true }

  // ── Geo form switch ──

  function getUrlOverride() {
    var params = new URLSearchParams(window.location.search);
    return params.get("consult"); // "foreign" | "india" | null
  }

  function showForeignForm() {
    var india = document.getElementById("consult-india");
    var foreign = document.getElementById("consult-foreign");
    if (india) india.hidden = true;
    if (foreign) foreign.hidden = false;
  }

  function showIndiaForm() {
    var india = document.getElementById("consult-india");
    var foreign = document.getElementById("consult-foreign");
    if (foreign) foreign.hidden = true;
    if (india) india.hidden = false;
  }

  function resolveAndApply() {
    var override = getUrlOverride();
    if (override === "foreign") { showForeignForm(); return; }
    if (override === "india") { showIndiaForm(); return; }

    var cached = null;
    try { cached = sessionStorage.getItem(CACHE_KEY); } catch (e) {}
    if (cached) {
      if (cached !== "IN") showForeignForm();
      return;
    }

    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS) : null;

    fetch("https://ipapi.co/json/", { signal: controller ? controller.signal : undefined })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var code = data && data.country_code ? data.country_code : "";
        try { sessionStorage.setItem(CACHE_KEY, code); } catch (e) {}
        if (code && code !== "IN") showForeignForm();
      })
      .catch(function () {})
      .finally(function () { if (timeoutId) clearTimeout(timeoutId); });
  }

  // ── Shared booked-slots backend ──

  function refreshBookedSlots() {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.indexOf("PASTE_YOUR") === 0) {
      return Promise.resolve(); // not configured yet — slots just won't be filtered
    }
    return fetch(APPS_SCRIPT_URL)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        bookedSlots = {};
        (data.booked || []).forEach(function (ms) { bookedSlots[String(ms)] = true; });
      })
      .catch(function () {
        // Backend unreachable — proceed without conflict-filtering rather than blocking the form.
      });
  }

  function fetchWithTimeout_(url, options, timeoutMs) {
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
    var opts = Object.assign({}, options, controller ? { signal: controller.signal } : {});
    return fetch(url, opts).finally(function () { if (timeoutId) clearTimeout(timeoutId); });
  }

  // Creating a per-booking payment link involves this script calling out to
  // Razorpay's API, which can take several seconds. That round trip
  // occasionally gets interrupted (slow connection, a known Google quirk
  // with anonymous Apps Script Web App responses, etc.) even though the
  // backend finishes the booking successfully a moment later. To avoid
  // showing someone a false "something went wrong" for a booking that
  // actually went through, we: (1) allow a generous 20s timeout before
  // giving up, and (2) if a request does fail, look up the REAL record for
  // this slot directly (rather than guessing) — if it exists, we recover
  // the actual bookingId and paymentLink instead of just inferring success.
  function lookupBookingBySlot(slotMs) {
    var url = APPS_SCRIPT_URL + "?lookupSlot=" + encodeURIComponent(slotMs);
    return fetchWithTimeout_(url, {}, 10000)
      .then(function (res) { return res.json(); })
      .catch(function () { return { found: false }; });
  }

  function submitBooking(payload) {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.indexOf("PASTE_YOUR") === 0) {
      return Promise.resolve({ ok: false, reason: "not_configured" });
    }

    function attempt() {
      return fetchWithTimeout_(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) }, 20000)
        .then(function (res) { return res.json(); });
    }

    return attempt().catch(function () {
      // First attempt's response didn't come back — check the sheet directly
      // for the real record before assuming failure.
      return lookupBookingBySlot(payload.slotMs).then(function (found) {
        if (found.found) {
          return { ok: true, recovered: true, bookingId: found.bookingId, paymentLink: found.paymentLink };
        }
        // Genuinely not found yet — wait briefly (in case it's still mid-flight), retry the lookup once more.
        return new Promise(function (resolve) { setTimeout(resolve, 2500); })
          .then(function () { return lookupBookingBySlot(payload.slotMs); })
          .then(function (found2) {
            if (found2.found) {
              return { ok: true, recovered: true, bookingId: found2.bookingId, paymentLink: found2.paymentLink };
            }
            // Still nothing — try submitting fresh once more (maybe it truly never went through).
            return attempt().catch(function () { return { ok: false, reason: "network_error" }; });
          });
      });
    });
  }

  // ── Time slot generation (shared math, IST clinic hours) ──
  // Clinic is India-based and does not observe DST, so IST = UTC+5:30 always.
  var CLINIC_TZ = "Asia/Kolkata";
  var CLINIC_UTC_OFFSET_MS = (5 * 60 + 30) * 60000;
  var BUSINESS_START_MIN = 9 * 60;              // 9:00 AM IST (both audiences)
  var INDIA_BUSINESS_END_MIN = 20 * 60 + 30;    // 8:30 PM IST (last slot starts at 8:00 PM) — in-clinic/video hours
  var FOREIGN_BUSINESS_END_MIN = 23 * 60;       // 11:00 PM IST (last slot starts at 10:30 PM) — wider window for overseas time zones
  var SLOT_MINUTES = 30;

  function istPartsFromDate(d) {
    var fmt = new Intl.DateTimeFormat("en-GB", { timeZone: CLINIC_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
    var parts = fmt.formatToParts(d);
    var o = {};
    parts.forEach(function (p) { o[p.type] = p.value; });
    return { year: +o.year, month: +o.month, day: +o.day };
  }

  function istDateToUTCms(year, month, day, hour, minute) {
    return Date.UTC(year, month - 1, day, hour, minute) - CLINIC_UTC_OFFSET_MS;
  }

  function addDaysToIstDate(parts, days) {
    var anchorMs = istDateToUTCms(parts.year, parts.month, parts.day, 12, 0);
    return istPartsFromDate(new Date(anchorMs + days * 86400000));
  }

  function generateSlots(isEmergency, businessEndMin) {
    var endMin = businessEndMin || INDIA_BUSINESS_END_MIN;
    var nowMs = Date.now();
    var todayIst = istPartsFromDate(new Date());
    var minMs = isEmergency ? nowMs : nowMs + 24 * 60 * 60000;
    var daysToScan = isEmergency ? 1 : 7;
    var slots = [];

    for (var d = 0; d < daysToScan; d++) {
      var dayParts = d === 0 ? todayIst : addDaysToIstDate(todayIst, d);
      for (var t = BUSINESS_START_MIN; t < endMin; t += SLOT_MINUTES) {
        var h = Math.floor(t / 60);
        var m = t % 60;
        var slotMs = istDateToUTCms(dayParts.year, dayParts.month, dayParts.day, h, m);
        if (slotMs < minMs) continue;
        if (bookedSlots[String(slotMs)]) continue; // already booked by someone (India or foreign)
        slots.push(slotMs);
      }
      if (!isEmergency && slots.length >= 80) break;
    }
    return slots;
  }

  function istDayKey(ms) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  }

  function groupSlotsByIstDay(slots) {
    var map = {};
    var order = [];
    slots.forEach(function (ms) {
      var key = istDayKey(ms);
      if (!map[key]) { map[key] = []; order.push(key); }
      map[key].push(ms);
    });
    return order.map(function (key) { return { key: key, slots: map[key] }; });
  }

  function dayPillLabel(key, sampleMs) {
    var todayKey = istDayKey(Date.now());
    var tomorrowKey = istDayKey(Date.now() + 86400000);
    if (key === todayKey) return "Today";
    if (key === tomorrowKey) return "Tomorrow";
    return new Intl.DateTimeFormat("en-US", { timeZone: CLINIC_TZ, weekday: "short", month: "short", day: "numeric" }).format(new Date(sampleMs));
  }

  function istTimeStr(ms) {
    return new Intl.DateTimeFormat("en-US", { timeZone: CLINIC_TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ms));
  }

  function localTimeStr(ms, displayTz) {
    try {
      return new Intl.DateTimeFormat("en-US", { timeZone: displayTz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ms));
    } catch (e) {
      return "";
    }
  }

  // Renders a "pick a day, then pick a time" widget instead of a long scrolling
  // dropdown. Already-booked slots never reach here — they're filtered out of
  // `slots` upstream by generateSlots(). Selection is stored on a hidden
  // <input> (value = slot ms, data-label = human label used in the booking
  // payload/notes) so the rest of the submit logic doesn't need to change shape.
  function renderSlotPicker(opts) {
    var datesEl = document.getElementById(opts.datesEl);
    var timesEl = document.getElementById(opts.timesEl);
    var emptyEl = opts.emptyEl ? document.getElementById(opts.emptyEl) : null;
    var hiddenInput = document.getElementById(opts.hiddenInput);
    if (!datesEl || !timesEl || !hiddenInput) return;

    hiddenInput.value = "";
    hiddenInput.removeAttribute("data-label");

    if (!opts.slots.length) {
      datesEl.innerHTML = "";
      timesEl.innerHTML = "";
      if (emptyEl) { emptyEl.hidden = false; emptyEl.textContent = opts.emptyText || "No slots available right now — please call us directly"; }
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    var groups = groupSlotsByIstDay(opts.slots);

    function selectSlot(btn, ms, label) {
      timesEl.querySelectorAll(".time-slot-btn.selected").forEach(function (b) { b.classList.remove("selected"); });
      btn.classList.add("selected");
      hiddenInput.value = String(ms);
      hiddenInput.setAttribute("data-label", label);
    }

    function renderTimesForGroup(idx) {
      var g = groups[idx];
      timesEl.innerHTML = "";
      hiddenInput.value = "";
      hiddenInput.removeAttribute("data-label");
      g.slots.forEach(function (ms) {
        var ist = istTimeStr(ms);
        var showBoth = opts.alwaysShowBoth || (opts.displayTz && opts.displayTz !== CLINIC_TZ);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "time-slot-btn";
        var label;
        if (showBoth) {
          var local = localTimeStr(ms, opts.displayTz);
          btn.innerHTML = '<span class="slot-local">' + (local || ist) + '</span><span class="slot-ist">' + ist + ' IST</span>';
          label = (local ? local + " your time" : ist) + " (" + ist + " IST)";
        } else {
          btn.innerHTML = '<span class="slot-local">' + ist + '</span>';
          label = ist + " IST";
        }
        btn.addEventListener("click", function () { selectSlot(btn, ms, label); });
        timesEl.appendChild(btn);
      });
    }

    datesEl.innerHTML = "";
    groups.forEach(function (g, idx) {
      var pill = document.createElement("button");
      pill.type = "button";
      pill.className = "date-pill" + (idx === 0 ? " selected" : "");
      pill.textContent = dayPillLabel(g.key, g.slots[0]);
      pill.addEventListener("click", function () {
        datesEl.querySelectorAll(".date-pill.selected").forEach(function (b) { b.classList.remove("selected"); });
        pill.classList.add("selected");
        renderTimesForGroup(idx);
      });
      datesEl.appendChild(pill);
    });
    renderTimesForGroup(0);
  }

  // ── India form: timezone + slots ──

  function populateIndiaSlots() {
    var slots = generateSlots(false, INDIA_BUSINESS_END_MIN);
    renderSlotPicker({
      datesEl: "slot-dates", timesEl: "slot-times", emptyEl: "slot-empty",
      hiddenInput: "slot", slots: slots, displayTz: CLINIC_TZ, alwaysShowBoth: false,
      emptyText: "No slots available right now — please call us directly"
    });
  }

  function wireIndiaModeToggle() {
    var radios = document.querySelectorAll('input[name="mode-india"]');
    var extras = document.getElementById("india-online-extras");
    var submitBtn = document.querySelector("#appointment-form .submit-btn");
    if (!radios.length || !extras) return;

    function refresh() {
      var selected = document.querySelector('input[name="mode-india"]:checked');
      var isOnline = selected && selected.value === "online";
      extras.hidden = !isOnline;
      if (submitBtn) submitBtn.textContent = isOnline ? "Book Online Consultation" : "Book Consultation";
      if (isOnline) populateIndiaSlots();
    }

    radios.forEach(function (r) { r.addEventListener("change", refresh); });
    refresh();
  }

  function wireIndiaFormSubmit() {
    var form = document.getElementById("appointment-form");
    var success = document.getElementById("form-success");
    if (!form || !success) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var modeRadio = document.querySelector('input[name="mode-india"]:checked');
      var isOnline = modeRadio && modeRadio.value === "online";

      var name = document.getElementById("name").value;
      var phone = document.getElementById("phone").value;
      var email = document.getElementById("email").value;
      var service = document.getElementById("service").value;

      if (!isOnline) {
        // Original simple flow: no slot, no advance payment, just forward to the Google Form.
        var clinicBtn = form.querySelector('button[type="submit"]');
        if (clinicBtn) {
          if (clinicBtn.disabled) return;
          clinicBtn.disabled = true;
          clinicBtn.textContent = "Booking\u2026";
        }
        var gform = new FormData(form);
        fetch(form.action, { method: "POST", mode: "no-cors", body: gform }).finally(function () {
          form.style.display = "none";
          success.style.display = "block";
          if (typeof gtag !== "undefined") {
            gtag("event", "form_submit", { event_category: "lead", event_label: "Homepage Appointment Form" });
          }
        });
        return;
      }

      // Online consultation flow: needs a slot + goes through the shared booking backend.
      var slotInput = document.getElementById("slot");
      var slotMs = slotInput ? slotInput.value : "";
      var slotLabel = slotInput ? (slotInput.getAttribute("data-label") || "-") : "-";
      var platformRadio = document.querySelector('input[name="platform-india"]:checked');
      var platform = platformRadio ? platformRadio.value : "-";
      var problemEl = document.getElementById("problem");
      var problem = problemEl ? problemEl.value.trim() : "";

      if (!slotMs) {
        alert("Please select a time slot.");
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        if (submitBtn.disabled) return; // already submitting — ignore extra clicks
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.textContent;
        submitBtn.textContent = "Booking\u2026 this can take a few seconds";
      }

      var payload = {
        name: name, phone: phone, email: email, country: "India",
        service: service, slotMs: slotMs, slotLabel: slotLabel,
        platform: platform, emergency: false, fee: "\u20b9500 advance",
        amountPaise: 50000, currency: "INR", problem: problem
      };

      submitBooking(payload).then(function (result) {
        if (result.ok) {
          bookedSlots[String(slotMs)] = true;
          var gform = new FormData();
          gform.append("entry.1869350848", name);
          gform.append("entry.1797725802", phone);
          gform.append("entry.350143632", email);
          gform.append("entry.2005620554", "[Online] " + service + " | Slot: " + slotLabel + " | Platform: " + platform + (problem ? " | Problem: " + problem : ""));
          fetch(form.action, { method: "POST", mode: "no-cors", body: gform }).catch(function () {});

          form.style.display = "none";
          success.style.display = "block";
          var successText = document.getElementById("form-success-text");
          var payWrap = document.getElementById("india-pay-now-wrap");
          var payLink = document.getElementById("india-pay-now");
          if (result.paymentLink && payWrap && payLink) {
            if (successText) successText.textContent = "Booking received! Complete your \u20b9500 advance payment below to confirm your slot.";
            payLink.href = result.paymentLink;
            payWrap.style.display = "block";
          } else if (successText) {
            successText.textContent = "Booking received! We'll send your \u20b9500 payment link shortly — if you don't hear from us in a few minutes, please WhatsApp or call us to confirm.";
          }
          if (typeof gtag !== "undefined") {
            gtag("event", "form_submit", { event_category: "lead", event_label: "Homepage Appointment Form" });
          }
        } else if (result.reason === "slot_taken") {
          alert("Sorry, that slot was just booked by someone else. Please pick another.");
          populateIndiaSlots();
        } else {
          alert("Something went wrong submitting your booking. Please try again or call us directly.");
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBtn.dataset.originalText || "Book Consultation";
        }
      });
    });
  }

  // ── Foreign form: timezone + slots + emergency toggle ──

  // Best-guess timezone per country in the "Country" dropdown, so selecting a
  // country auto-updates "Your Timezone" — the person can still override it
  // manually (large countries like the US span several zones).
  var COUNTRY_TZ_MAP = {
    "United States": "America/New_York",
    "United Kingdom": "Europe/London",
    "Canada": "America/Toronto",
    "Australia": "Australia/Sydney",
    "United Arab Emirates": "Asia/Dubai"
  };

  function populateTimezone() {
    var select = document.getElementById("tz-f");
    if (!select) return;
    var detected = "";
    try { detected = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    var common = [
      "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto",
      "Europe/London", "Europe/Berlin", "Asia/Dubai", "Australia/Sydney"
    ];
    if (detected && common.indexOf(detected) === -1) common.unshift(detected);
    select.innerHTML = "";
    common.forEach(function (tz) {
      var opt = document.createElement("option");
      opt.value = tz;
      opt.textContent = tz === detected ? tz + " (detected)" : tz;
      if (tz === detected) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function applyCountryTzDefault() {
    var countrySelect = document.getElementById("country-f");
    var tzSelect = document.getElementById("tz-f");
    if (!countrySelect || !tzSelect) return;
    var mapped = COUNTRY_TZ_MAP[countrySelect.value];
    if (mapped) {
      var hasOption = Array.prototype.some.call(tzSelect.options, function (o) { return o.value === mapped; });
      if (!hasOption) {
        var opt = document.createElement("option");
        opt.value = mapped;
        opt.textContent = mapped;
        tzSelect.appendChild(opt);
      }
      tzSelect.value = mapped;
    }
    populateForeignSlots();
  }

  function populateForeignSlots() {
    var tzSelect = document.getElementById("tz-f");
    var emergencyCheckbox = document.getElementById("emergency-f");
    var isEmergency = !!(emergencyCheckbox && emergencyCheckbox.checked);
    var displayTz = (tzSelect && tzSelect.value) || (function () {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; }
    })();
    var slots = generateSlots(isEmergency, FOREIGN_BUSINESS_END_MIN);
    renderSlotPicker({
      datesEl: "slot-dates-f", timesEl: "slot-times-f", emptyEl: "slot-empty-f",
      hiddenInput: "slot-f", slots: slots, displayTz: displayTz, alwaysShowBoth: true,
      emptyText: "No same-day slots left today — please WhatsApp us directly"
    });
  }

  function wireForeignEmergencyAndSlots() {
    var checkbox = document.getElementById("emergency-f");
    var tzSelect = document.getElementById("tz-f");
    var slotLabel = document.getElementById("slot-label-f");
    var feeNote = document.getElementById("fee-note-f");
    var paymentNote = document.getElementById("payment-note-text-f");

    function refresh() {
      var isEmergency = !!(checkbox && checkbox.checked);
      if (slotLabel) slotLabel.textContent = isEmergency ? "Today's Available Slot (30 min)" : "Preferred Time Slot (24+ hrs from now, 30 min)";
      if (feeNote) feeNote.textContent = isEmergency
        ? "Consultation fee: USD 50 (same-day/emergency), billed in your local currency at checkout."
        : "Consultation fee: USD 35, billed in your local currency at checkout.";
      if (paymentNote) paymentNote.textContent = isEmergency
        ? "This is a same-day/emergency booking. Full payment of USD 50 is required in advance to confirm your slot. You'll get a secure payment link right after you submit."
        : "Full payment of USD 35 is required in advance to confirm your booking. You'll get a secure payment link right after you submit.";
      populateForeignSlots();
    }

    if (checkbox) checkbox.addEventListener("change", refresh);
    if (tzSelect) tzSelect.addEventListener("change", populateForeignSlots);
    var countrySelect = document.getElementById("country-f");
    if (countrySelect) countrySelect.addEventListener("change", applyCountryTzDefault);
    refresh();
  }

  function wireForeignFormSubmit() {
    var form = document.getElementById("appointment-form-foreign");
    var success = document.getElementById("form-success-foreign");
    if (!form || !success) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var name = document.getElementById("name-f").value;
      var email = document.getElementById("email-f").value;
      var country = document.getElementById("country-f").value;
      var phoneCode = document.getElementById("phone-code-f").value;
      var phone = document.getElementById("phone-f").value;
      // If "Other" was chosen in the code dropdown, don't prepend the literal
      // word "Other" to the phone number — just use what they typed as-is
      // (they may have included their own country code manually).
      var fullPhone = (phoneCode === "Other" ? "" : phoneCode + " ") + phone;
      var service = document.getElementById("service-f").value;
      var tz = document.getElementById("tz-f").value;
      var slotInput = document.getElementById("slot-f");
      var slotMs = slotInput ? slotInput.value : "";
      var slotLabel = slotInput ? (slotInput.getAttribute("data-label") || "-") : "-";
      var platform = form.querySelector('input[name="platform-f"]:checked');
      platform = platform ? platform.value : "";
      var emergencyCheckbox = document.getElementById("emergency-f");
      var isEmergency = emergencyCheckbox && emergencyCheckbox.checked;
      var problemEl = document.getElementById("problem-f");
      var problem = problemEl ? problemEl.value.trim() : "";

      if (!slotMs) {
        alert("Please select a time slot.");
        return;
      }

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        if (submitBtn.disabled) return; // already submitting — ignore extra clicks
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.textContent;
        submitBtn.textContent = "Booking\u2026 this can take a few seconds";
      }

      var payload = {
        name: name, phone: fullPhone, email: email, country: country,
        service: service, slotMs: slotMs, slotLabel: slotLabel + " (tz ref: " + tz + ")",
        platform: platform, emergency: !!isEmergency, fee: isEmergency ? "USD 50" : "USD 35",
        amountPaise: isEmergency ? 5000 : 3500, currency: "USD", problem: problem
      };

      submitBooking(payload).then(function (result) {
        if (result.ok) {
          bookedSlots[String(slotMs)] = true;
          // Also forward to the original Google Form (folded into one note field) for existing notifications.
          var serviceNote = (isEmergency ? "[EMERGENCY/SAME-DAY, USD 50] " : "[Online, USD 35] ") + (service || "General consultation") +
            " | Country: " + country + " | Slot: " + slotLabel + " (tz ref: " + tz + ")" + " | Platform: " + platform +
            (problem ? " | Problem: " + problem : "");
          var gform = new FormData();
          gform.append("entry.1869350848", name);
          gform.append("entry.1797725802", fullPhone);
          gform.append("entry.350143632", email);
          gform.append("entry.2005620554", serviceNote);
          fetch(form.action, { method: "POST", mode: "no-cors", body: gform }).catch(function () {});

          form.style.display = "none";
          success.hidden = false;
          var successText = document.getElementById("form-success-foreign-text");
          var payWrap = document.getElementById("foreign-pay-now-wrap");
          var payLink = document.getElementById("foreign-pay-now");
          var feeLabel = isEmergency ? "USD 50" : "USD 35";
          if (result.paymentLink && payWrap && payLink) {
            if (successText) successText.textContent = "Booking received! Complete your " + feeLabel + " payment below to confirm your video consultation.";
            payLink.href = result.paymentLink;
            payWrap.style.display = "block";
          } else if (successText) {
            successText.textContent = "Booking received! We'll send your " + feeLabel + " payment link shortly — if you don't hear from us in a few minutes, please WhatsApp or contact us to confirm.";
          }
          if (typeof gtag !== "undefined") {
            gtag("event", "form_submit", { event_category: "lead", event_label: "Homepage Online Consultation Form" });
          }
        } else if (result.reason === "slot_taken") {
          alert("Sorry, that slot was just booked by someone else. Please pick another.");
          populateForeignSlots();
        } else {
          alert("Something went wrong submitting your booking. Please try again or contact us directly.");
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitBtn.dataset.originalText || "Book Online Consultation";
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    resolveAndApply();
    populateTimezone();

    refreshBookedSlots().then(function () {
      populateIndiaSlots();
      populateForeignSlots();
    });

    wireIndiaFormSubmit();
    wireIndiaModeToggle();
    wireForeignFormSubmit();
    wireForeignEmergencyAndSlots();
  });
})();
