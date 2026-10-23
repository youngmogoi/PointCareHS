// Lead handling shared by every host. api/lead.js (Vercel) and
// functions/api/lead.js (Cloudflare Pages) are thin wrappers around this.
//
// Every website form posts to /api/lead. This module:
//   1. rejects requests from other sites and obvious bots (honeypot)
//   2. verifies the Cloudflare Turnstile token server-side
//   3. validates and normalizes the fields for each lead type
//   4. forwards a clean, flat JSON lead to the GoHighLevel inbound webhook
//
// It stores nothing and never logs field values. Configure as environment
// variables in your host's dashboard (or .dev.vars locally):
//   TURNSTILE_SECRET_KEY      required
//   GHL_WEBHOOK_URL           GHL "Inbound Webhook" trigger URL; unset = dry run
//   GHL_WEBHOOK_URL_FACILITY  optional separate workflow for facility leads
//   ALLOWED_ORIGINS           optional, comma-separated, e.g. https://www.pointcarehealthservices.com

const CONSENT_TEXT_VERSION = "2026-10-22"; // bump when the consent wording changes

const PATIENT_INQUIRIES = ["Schedule an evaluation", "Insurance question", "General question"];
const RELATIONSHIPS = ["Patient", "Family member / caregiver", "Other"];
const BEST_TIMES = ["", "Morning", "Afternoon", "Evening", "Any time"];
const ORG_TYPES = ["", "Physician practice", "Hospital", "Skilled nursing / rehab", "Assisted living", "Home health agency", "Hospice", "Other"];
const REFERRAL_VOLUMES = ["", "1-5 per month", "6-15 per month", "16+ per month", "Not sure yet"];

const SCHEMAS = {
  patient: {
    first_name: { required: true, max: 60 },
    last_name: { required: true, max: 60 },
    phone: { required: true, type: "phone" },
    email: { type: "email" },
    postal_code: { required: true, type: "zip" },
    relationship: { required: true, oneOf: RELATIONSHIPS },
    inquiry: { required: true, oneOf: PATIENT_INQUIRIES },
    best_time: { oneOf: BEST_TIMES },
  },
  facility: {
    first_name: { required: true, max: 60 },
    last_name: { required: true, max: 60 },
    organization: { required: true, max: 120 },
    role: { max: 80 },
    phone: { required: true, type: "phone" },
    email: { required: true, type: "email" },
    org_type: { oneOf: ORG_TYPES },
    referral_volume: { oneOf: REFERRAL_VOLUMES },
    message: { max: 1000 },
  },
};

const ATTRIBUTION_KEYS = ["landing_page", "referrer", "first_touch_at", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid", "fbclid", "msclkid"];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function normalizePhone(raw) {
  let d = String(raw).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10 || /^[01]/.test(d)) return null;
  return "+1" + d;
}

function validate(schema, input) {
  const out = {};
  const errors = [];
  for (const [key, rule] of Object.entries(schema)) {
    let v = typeof input[key] === "string" ? input[key].trim() : "";
    if (!v) {
      if (rule.required) errors.push(key);
      continue;
    }
    if (rule.max && v.length > rule.max) v = v.slice(0, rule.max);
    if (rule.oneOf && !rule.oneOf.includes(v)) { errors.push(key); continue; }
    if (rule.type === "phone") {
      v = normalizePhone(v);
      if (!v) { errors.push(key); continue; }
    }
    if (rule.type === "email") {
      v = v.toLowerCase();
      if (v.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { errors.push(key); continue; }
    }
    if (rule.type === "zip" && !/^\d{5}(-\d{4})?$/.test(v)) { errors.push(key); continue; }
    out[key] = v;
  }
  return { out, errors };
}

async function verifyTurnstile(secret, token, ip) {
  if (!secret || !token) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (ip) body.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

const FIELD_LABELS = {
  first_name: "First name", last_name: "Last name", phone: "Phone", email: "Email",
  postal_code: "ZIP code", relationship: "Relationship", inquiry: "Reason",
  organization: "Organization", org_type: "Organization type",
};

export function methodNotAllowed() {
  return json({ ok: false, error: "Method not allowed." }, 405);
}

// request: a standard Request. env: the environment variables. ip: the
// visitor's IP as reported by the host (used for Turnstile and consent records).
export async function handleLead(request, env, ip = "") {
  // 1. Same-site check
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = request.headers.get("Origin") || "";
  const sameHost = origin && new URL(origin).host === new URL(request.url).host;
  if (!sameHost && !allowed.includes(origin)) return json({ ok: false, error: "Request not allowed." }, 403);

  let body;
  try {
    if (Number(request.headers.get("Content-Length") || 0) > 20000) throw new Error();
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  const leadType = body.lead_type;
  const schema = SCHEMAS[leadType];
  if (!schema || typeof body.fields !== "object" || body.fields === null) {
    return json({ ok: false, error: "Invalid request." }, 400);
  }

  // Honeypot: a hidden field humans never fill. Pretend success so bots move on.
  if (body.fields.website) return json({ ok: true });

  // 2. Turnstile
  if (!(await verifyTurnstile(env.TURNSTILE_SECRET_KEY, body.turnstile_token, ip))) {
    return json({ ok: false, error: "Verification failed. Please refresh the page and try again." }, 400);
  }

  // 3. Validate
  const { out, errors } = validate(schema, body.fields);
  if (errors.length) {
    const names = errors.map((k) => FIELD_LABELS[k] || k).join(", ");
    return json({ ok: false, error: `Please check: ${names}.` }, 422);
  }

  const attribution = {};
  const rawAttr = typeof body.attribution === "object" && body.attribution ? body.attribution : {};
  for (const k of ATTRIBUTION_KEYS) {
    if (typeof rawAttr[k] === "string" && rawAttr[k]) attribution[k] = rawAttr[k].slice(0, 200);
  }

  const consent = body.consent === true;
  const now = new Date().toISOString();
  const tags = ["website-lead", `lead-${leadType}`, consent ? "sms-consent" : "no-sms-consent"];
  if (attribution.gclid || attribution.gbraid || attribution.wbraid) tags.push("source-google-ads");
  if (attribution.fbclid) tags.push("source-meta-ads");

  // 4. Flat payload: GHL workflows map top-level keys to contact fields.
  const lead = {
    lead_type: leadType,
    source: "Website",
    ...out,
    full_name: `${out.first_name} ${out.last_name}`,
    tags: tags.join(","),
    sms_consent: consent,
    consent_timestamp: consent ? now : "",
    consent_ip: consent ? ip : "",
    consent_text_version: consent ? CONSENT_TEXT_VERSION : "",
    consent_page: consent ? String(body.page || "").slice(0, 200) : "",
    submitted_at: now,
    ...attribution,
  };

  const webhook = (leadType === "facility" && env.GHL_WEBHOOK_URL_FACILITY) || env.GHL_WEBHOOK_URL;
  if (!webhook) {
    // Local development without a CRM: accept the lead but send it nowhere.
    console.log(`[lead] dry run: ${leadType} lead accepted (GHL_WEBHOOK_URL not set)`);
    return json({ ok: true, dry_run: true });
  }

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lead),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`CRM responded ${res.status}`);
  } catch (err) {
    console.error(`[lead] forward failed for ${leadType} lead: ${err.message}`);
    return json({ ok: false, error: "We couldn't send your request right now." }, 502);
  }

  return json({ ok: true });
}
