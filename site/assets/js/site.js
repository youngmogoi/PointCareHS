// Shared behavior for every page: contact details, nav, scroll reveal,
// first-touch attribution, and (only on pages without forms) ad tags.
(function () {
  const cfg = window.PCHS_CONFIG || {};
  const co = cfg.company || {};
  const digits = (s) => String(s || "").replace(/\D/g, "");

  // ---- Contact details from config ---------------------------------------
  document.querySelectorAll("[data-phone]").forEach((el) => {
    el.textContent = el.dataset.phone || co.phone;
    if (el.tagName === "A") el.href = "tel:+1" + digits(co.phone).slice(-10);
  });
  document.querySelectorAll("[data-fax]").forEach((el) => { el.textContent = co.fax; });
  document.querySelectorAll("[data-email]").forEach((el) => {
    el.textContent = co.email;
    if (el.tagName === "A") el.href = "mailto:" + co.email;
  });
  document.querySelectorAll("[data-service-area]").forEach((el) => { el.textContent = co.serviceArea; });
  document.querySelectorAll("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });

  // ---- Mobile nav ----------------------------------------------------------
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    links.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => links.classList.remove("open")));
  }

  // ---- Scroll reveal -------------------------------------------------------
  // Only sections below the fold are hidden, and only when the browser can
  // reveal them again, so content never stays invisible.
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.remove("reveal-pending"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach((el) => {
      if (el.getBoundingClientRect().top > window.innerHeight) {
        el.classList.add("reveal-pending");
        io.observe(el);
      }
    });
  }

  // ---- Before/after slideshow ---------------------------------------------
  document.querySelectorAll("[data-slideshow]").forEach((show) => {
    const track = show.querySelector(".slide-track");
    const slides = Array.from(show.querySelectorAll(".slide"));
    const dotsBox = show.querySelector(".slide-dots");
    if (!track || slides.length < 2) return;
    let index = 0;
    let timer = null;

    const dots = slides.map((_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-label", `Show result ${i + 1}`);
      b.addEventListener("click", () => { go(i); stop(); });
      dotsBox.appendChild(b);
      return b;
    });

    function go(i) {
      index = (i + slides.length) % slides.length;
      track.style.transform = `translateX(-${index * 100}%)`;
      slides.forEach((s, n) => s.setAttribute("aria-hidden", n === index ? "false" : "true"));
      dots.forEach((d, n) => d.setAttribute("aria-current", n === index ? "true" : "false"));
    }

    // Auto-advance, unless the visitor prefers reduced motion. Any interaction stops it.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function start() { if (!reduceMotion && !timer) timer = setInterval(() => go(index + 1), 6000); }
    function stop() { clearInterval(timer); timer = null; }

    show.querySelector("[data-prev]").addEventListener("click", () => { go(index - 1); stop(); });
    show.querySelector("[data-next]").addEventListener("click", () => { go(index + 1); stop(); });
    show.addEventListener("mouseenter", stop);
    show.addEventListener("focusin", stop);
    show.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { go(index - 1); stop(); }
      if (e.key === "ArrowRight") { go(index + 1); stop(); }
    });

    // Swipe on touch screens.
    let startX = null;
    track.addEventListener("pointerdown", (e) => { startX = e.clientX; });
    track.addEventListener("pointerup", (e) => {
      if (startX === null) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 40) { go(index + (dx < 0 ? 1 : -1)); stop(); }
      startX = null;
    });

    go(0);
    start();
  });

  // ---- First-touch attribution --------------------------------------------
  // Remembers where a visitor first came from (ad click ids, UTM tags) for 90
  // days so the lead in the CRM shows which campaign produced it.
  const ATTR_KEY = "pchs_attr";
  const ATTR_TTL_MS = 90 * 24 * 60 * 60 * 1000;
  const PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid", "fbclid", "msclkid"];

  function readAttr() {
    try {
      const saved = JSON.parse(localStorage.getItem(ATTR_KEY) || "null");
      if (saved && Date.now() - saved.ts < ATTR_TTL_MS) return saved;
    } catch (_) {}
    return null;
  }

  const qs = new URLSearchParams(location.search);
  const fromUrl = {};
  PARAMS.forEach((p) => { if (qs.get(p)) fromUrl[p] = qs.get(p).slice(0, 200); });
  let attr = readAttr();
  // A new ad click replaces the old touch; plain revisits keep the first one.
  if (!attr || Object.keys(fromUrl).length) {
    attr = {
      ts: Date.now(),
      landing_page: location.pathname,
      referrer: document.referrer ? new URL(document.referrer).hostname : "",
      ...fromUrl,
    };
    try { localStorage.setItem(ATTR_KEY, JSON.stringify(attr)); } catch (_) {}
  }
  window.PCHS_getAttribution = () => {
    const a = readAttr() || attr;
    const { ts, ...rest } = a;
    return { ...rest, first_touch_at: new Date(ts).toISOString() };
  };

  // ---- Tags (never on form pages) -----------------------------------------
  // Pages with <body data-tracking="off"> collect patient details, so no
  // third-party pixels load there. Health-data rules (HIPAA, FTC) make
  // sharing those visits with ad platforms risky.
  const trackingAllowed = document.body.dataset.tracking !== "off";

  function loadScript(src, attrs) {
    const s = document.createElement("script");
    s.async = true;
    s.src = src;
    Object.entries(attrs || {}).forEach(([k, v]) => s.setAttribute(k, v));
    document.head.appendChild(s);
  }

  if (trackingAllowed && cfg.googleTagId) {
    loadScript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(cfg.googleTagId));
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag("js", new Date());
    gtag("config", cfg.googleTagId);
  }

  if (trackingAllowed && cfg.metaPixelId) {
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
    (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    fbq("init", cfg.metaPixelId);
    fbq("track", "PageView");
  }

  // Thank-you page: report an anonymous conversion. No form data is sent.
  if (trackingAllowed && document.body.dataset.conversion === "lead") {
    if (window.gtag && cfg.googleAdsLeadSendTo) gtag("event", "conversion", { send_to: cfg.googleAdsLeadSendTo });
    if (window.fbq) fbq("track", "Lead");
  }

  if (trackingAllowed && cfg.ghlChatWidgetId) {
    loadScript("https://widgets.leadconnectorhq.com/loader.js", {
      "data-resources-url": "https://widgets.leadconnectorhq.com/chat-widget/loader.js",
      "data-widget-id": cfg.ghlChatWidgetId,
    });
  }
})();
