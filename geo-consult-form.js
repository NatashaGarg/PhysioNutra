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

  function submitBooking(payload) {
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.indexOf("PASTE_YOUR") === 0) {
      return Promise.resolve({ ok: false, reason: "not_configured" });
    }
    return fetch(APPS_SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) })
      .then(function (res) { return res.json(); })
      .catch(function () { return { ok: false, reason: "network_error" }; });
  }

  // ── Time slot generation (shared math, IST clinic hours) ──
  // Clinic is India-based and does not observe DST, so IST = UTC+5:30 always.
  var CLINIC_TZ = "Asia/Kolkata";
  var CLINIC_UTC_OFFSET_MS = (5 * 60 + 30) * 60000;
  var BUSINESS_START_MIN = 9 * 60;        // 9:00 AM IST
  var BUSINESS_END_MIN = 20 * 60 + 30;    // 8:30 PM IST (last slot starts at 8:00 PM)
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

  function generateSlots(isEmergency) {
    var nowMs = Date.now();
    var todayIst = istPartsFromDate(new Date());
    var minMs = isEmergency ? nowMs : nowMs + 24 * 60 * 60000;
    var daysToScan = isEmergency ? 1 : 7;
    var slots = [];

    for (var d = 0; d < daysToScan; d++) {
      var dayParts = d === 0 ? todayIst : addDaysToIstDate(todayIst, d);
      for (var t = BUSINESS_START_MIN; t < BUSINESS_END_MIN; t += SLOT_MINUTES) {
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

  function formatSlotLabel(ms, displayTz) {
    var d = new Date(ms);
    var istStr = new Intl.DateTimeFormat("en-US", {
      timeZone: CLINIC_TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true
    }).format(d);
    var localStr = "";
    try {
      localStr = new Intl.DateTimeFormat("en-US", { timeZone: displayTz, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
    } catch (e) {}
    return istStr + " IST" + (localStr && displayTz !== CLINIC_TZ ? " (" + localStr + " your time)" : "");
  }

  function fillSlotSelect(select, slots, displayTz, emptyText) {
    select.innerHTML = "";
    if (!slots.length) {
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = emptyText;
      select.appendChild(empty);
      return;
    }
    slots.forEach(function (ms) {
      var opt = document.createElement("option");
      opt.value = String(ms);
      opt.textContent = formatSlotLabel(ms, displayTz);
      select.appendChild(opt);
    });
  }

  // ── India form: timezone + slots ──

  function populateIndiaSlots() {
    var select = document.getElementById("slot");
    if (!select) return;
    var slots = generateSlots(false);
    fillSlotSelect(select, slots, CLINIC_TZ, "No slots available right now — please call us directly");
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
      var slotSelect = document.getElementById("slot");
      var slotMs = slotSelect ? slotSelect.value : "";
      var slotLabel = slotSelect && slotSelect.selectedIndex >= 0 ? slotSelect.options[slotSelect.selectedIndex].textContent : "-";
      var platformRadio = document.querySelector('input[name="platform-india"]:checked');
      var platform = platformRadio ? platformRadio.value : "-";

      if (!slotMs) {
        alert("Please select a time slot.");
        return;
      }

      var payload = {
        name: name, phone: phone, email: email, country: "India",
        service: service, slotMs: slotMs, slotLabel: slotLabel,
        platform: platform, emergency: false, fee: "\u20b9500 advance",
        amountPaise: 50000, currency: "INR"
      };

      submitBooking(payload).then(function (result) {
        if (result.ok) {
          bookedSlots[String(slotMs)] = true;
          var gform = new FormData();
          gform.append("entry.1869350848", name);
          gform.append("entry.1797725802", phone);
          gform.append("entry.350143632", email);
          gform.append("entry.2005620554", "[Online] " + service + " | Slot: " + slotLabel + " | Platform: " + platform);
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
            successText.textContent = "Booking received! Please complete your \u20b9500 advance payment using the link we shared earlier to confirm your slot.";
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
      });
    });
  }

  // ── Foreign form: timezone + slots + emergency toggle ──

  function populateTimezone() {
    var select = document.getElementById("tz-f");
    if (!select) return;
    var detected = "";
    try { detected = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    var common = [
      "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
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

  function populateForeignSlots() {
    var select = document.getElementById("slot-f");
    var tzSelect = document.getElementById("tz-f");
    var emergencyCheckbox = document.getElementById("emergency-f");
    if (!select) return;
    var isEmergency = !!(emergencyCheckbox && emergencyCheckbox.checked);
    var displayTz = (tzSelect && tzSelect.value) || (function () {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; }
    })();
    var slots = generateSlots(isEmergency);
    fillSlotSelect(select, slots, displayTz, "No same-day slots left today — please WhatsApp us directly");
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
      var service = document.getElementById("service-f").value;
      var tz = document.getElementById("tz-f").value;
      var slotSelect = document.getElementById("slot-f");
      var slotMs = slotSelect ? slotSelect.value : "";
      var slotLabel = slotSelect && slotSelect.selectedIndex >= 0 ? slotSelect.options[slotSelect.selectedIndex].textContent : "-";
      var platform = form.querySelector('input[name="platform-f"]:checked');
      platform = platform ? platform.value : "";
      var emergencyCheckbox = document.getElementById("emergency-f");
      var isEmergency = emergencyCheckbox && emergencyCheckbox.checked;

      if (!slotMs) {
        alert("Please select a time slot.");
        return;
      }

      var payload = {
        name: name, phone: phoneCode + " " + phone, email: email, country: country,
        service: service, slotMs: slotMs, slotLabel: slotLabel + " (tz ref: " + tz + ")",
        platform: platform, emergency: !!isEmergency, fee: isEmergency ? "USD 50" : "USD 35",
        amountPaise: isEmergency ? 5000 : 3500, currency: "USD"
      };

      submitBooking(payload).then(function (result) {
        if (result.ok) {
          bookedSlots[String(slotMs)] = true;
          // Also forward to the original Google Form (folded into one note field) for existing notifications.
          var serviceNote = (isEmergency ? "[EMERGENCY/SAME-DAY, USD 50] " : "[Online, USD 35] ") + (service || "General consultation") +
            " | Country: " + country + " | Slot: " + slotLabel + " (tz ref: " + tz + ")" + " | Platform: " + platform;
          var gform = new FormData();
          gform.append("entry.1869350848", name);
          gform.append("entry.1797725802", phoneCode + " " + phone);
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
            successText.textContent = "Booking received! Please complete your " + feeLabel + " payment using the link we shared earlier to confirm your video consultation.";
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
