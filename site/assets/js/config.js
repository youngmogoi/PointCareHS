// Site-wide settings. Edit this file first — every page reads from it.
// Nothing here is secret: it ships to the browser. Secrets (webhook URLs,
// Turnstile secret key) live in Cloudflare environment variables instead.
window.PCHS_CONFIG = {
  company: {
    name: "PointCare Health Services",
    shortName: "PointCareHS",
    phone: "(555) 555-0100",      // TODO: your intake line
    fax: "(555) 555-0101",        // TODO: your referral fax line
    email: "intake@pointcarehs.com", // TODO
    serviceArea: "TODO: your counties / metro area",
  },

  // Cloudflare Turnstile site key (public). The value below is Cloudflare's
  // official "always passes" test key — replace it before going live.
  turnstileSiteKey: "1x00000000000000000000AA",

  // Your GoHighLevel referral form, hosted inside GHL with HIPAA mode on.
  // Paste the form's embed URL (Sites > Forms > Integrate > link), e.g.
  // "https://api.leadconnectorhq.com/widget/form/XXXXXXXX".
  // Leave empty to show the phone/fax fallback on /refer.
  ghlReferralFormUrl: "",

  // Optional GoHighLevel chat widget id (Sites > Chat Widget). Empty = off.
  ghlChatWidgetId: "",

  // Ad/analytics tags. They are never loaded on pages that have a form —
  // see site.js. Empty = off.
  googleTagId: "",     // e.g. "AW-123456789" or "G-XXXXXXX"
  googleAdsLeadSendTo: "", // e.g. "AW-123456789/AbCdEfGh" (conversion label)
  metaPixelId: "",
};
