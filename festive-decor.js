/*
  PhysioNutra festive header decoration
  ----------------------------------------
  Auto-shows a themed decoration strip during festival/occasion windows,
  and removes itself automatically once the window ends.

  TWO KINDS OF DATES HANDLED DIFFERENTLY:

  1. FIXED-CALENDAR festivals (Independence Day, Republic Day, Christmas/
     New Year) — these fall on the same date every single year. Computed
     automatically below, forever. NEVER need updating.

  2. LUNAR-CALENDAR festivals (Diwali, Holi, Dussehra, Raksha Bandhan) —
     these shift dates every year based on moon-sighting calculations
     that have no fixed formula. There is no way to compute these
     purely in JS. LUNAR_DATES below is a verified lookup table,
     currently filled in for 2026-2028. When the table runs out for a
     year, the script safely does nothing for those festivals (no
     error, no wrong guess) and logs a console reminder to add the
     next year's dates — look them up on drikpanchang.com when that
     happens.

  MANUAL OVERRIDE (for testing or early/late activation):
    - URL:  yoursite.com/?festival=diwali      (forces Diwali on)
            yoursite.com/?festival=independence (forces tricolor on)
            yoursite.com/?festival=none         (forces everything off)
    - Or set FORCE_FESTIVAL below permanently (leave null for auto).
*/

(function () {
  "use strict";

  // ── Permanent manual override (null = auto by date) ──
  var FORCE_FESTIVAL = null; // e.g. "diwali", "christmas", "holi", or "none"

  // ── Lunar-calendar festival peak dates, verified against drikpanchang.com ──
  // Format: "YYYY": { festival: "MM-DD", ... }
  // ADD THE NEXT YEAR HERE once it's known (usually announced 1-2 years ahead).
  var LUNAR_DATES = {
    "2026": { rakhi: "08-28", dussehra: "10-20", diwali: "11-08" },
    "2027": { holi: "03-23", rakhi: "08-17", dussehra: "10-09", diwali: "10-29" },
    "2028": { diwali: "10-17" }
    // 2028 holi/rakhi/dussehra and 2029+ not yet added — extend when known.
  };

  // How many days before/after the peak date each festival's decoration shows.
  var LUNAR_PADDING = { diwali: 3, holi: 1, dussehra: 1, rakhi: 1 };

  // Fixed-calendar festivals: { festival: [month, day, paddingDays] }
  // Independence Day and Republic Day both use the tricolor theme.
  var FIXED_DATES = {
    independence: [8, 15, 1],
    republic: [1, 26, 1]
  };

  var THEME_MAP = {
    independence: "tricolor",
    republic: "tricolor",
    rakhi: "rakhi",
    dussehra: "dussehra",
    diwali: "diwali",
    christmas: "christmas",
    holi: "holi"
  };

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function toISO(y, m, d) {
    return y + "-" + pad(m) + "-" + pad(d);
  }

  function withinPadding(today, peakISO, paddingDays) {
    var peak = new Date(peakISO + "T00:00:00");
    var start = new Date(peak); start.setDate(start.getDate() - paddingDays);
    var end = new Date(peak); end.setDate(end.getDate() + paddingDays);
    var t = new Date(today + "T00:00:00");
    return t >= start && t <= end;
  }

  function checkFixedDates(today, year) {
    for (var name in FIXED_DATES) {
      var cfg = FIXED_DATES[name];
      var peakISO = toISO(year, cfg[0], cfg[1]);
      if (withinPadding(today, peakISO, cfg[2])) return name;
    }
    return null;
  }

  function checkChristmas(today, year) {
    // Dec 20 (this year) through Jan 2 (next year) — spans the year boundary.
    var start = toISO(year, 12, 20);
    var end = toISO(year + 1, 1, 2);
    if (today >= start && today <= end) return "christmas";
    // Also check Dec 20 of the PREVIOUS year, in case today is early January.
    var prevStart = toISO(year - 1, 12, 20);
    var prevEnd = toISO(year, 1, 2);
    if (today >= prevStart && today <= prevEnd) return "christmas";
    return null;
  }

  function checkLunarDates(today, year) {
    var thisYear = LUNAR_DATES[String(year)];
    if (thisYear) {
      for (var name in thisYear) {
        var peakISO = year + "-" + thisYear[name];
        if (withinPadding(today, peakISO, LUNAR_PADDING[name] || 1)) return name;
      }
    }
    return null;
  }

  function warnIfTableStale(year) {
    var maxConfiguredYear = Math.max.apply(null, Object.keys(LUNAR_DATES).map(Number));
    if (year > maxConfiguredYear && window.console && console.warn) {
      console.warn(
        "[festive-decor] Lunar festival dates aren't configured past " +
        maxConfiguredYear + ". Add " + year +
        " dates (Diwali/Holi/Dussehra/Raksha Bandhan) to LUNAR_DATES in " +
        "festive-decor.js — look them up at drikpanchang.com."
      );
    }
  }

  function getUrlOverride() {
    var params = new URLSearchParams(window.location.search);
    return params.get("festival"); // null if not present
  }

  function activeFestivalByDate() {
    var now = new Date();
    var year = now.getFullYear();
    var today = toISO(year, now.getMonth() + 1, now.getDate());

    warnIfTableStale(year);

    return checkFixedDates(today, year)
        || checkChristmas(today, year)
        || checkLunarDates(today, year);
  }

  function resolveFestival() {
    var urlOverride = getUrlOverride();
    if (urlOverride) return urlOverride === "none" ? null : urlOverride;
    if (FORCE_FESTIVAL) return FORCE_FESTIVAL === "none" ? null : FORCE_FESTIVAL;
    return activeFestivalByDate();
  }

  function renderStrip(festival) {
    var theme = THEME_MAP[festival] || festival;
    var strip = document.createElement("div");
    strip.className = "festive-strip";
    strip.setAttribute("aria-hidden", "true"); // decorative only
    for (var i = 0; i < 14; i++) {
      var bulb = document.createElement("span");
      bulb.className = "bulb";
      strip.appendChild(bulb);
    }
    document.body.classList.add("festival-" + theme);
    document.body.insertBefore(strip, document.body.firstChild);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var festival = resolveFestival();
    if (festival) renderStrip(festival);
  });
})();
