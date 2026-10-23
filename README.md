# PointCare Health Services — website & lead funnel

Static website on **Cloudflare Pages**, with one server function (`/api/lead`) that checks
each form submission and forwards it to **GoHighLevel** (HIPAA mode).

```
site/                     the website (what visitors see)
  index.html              homepage
  contact.html            patient/family + facility/provider lead forms
  refer.html              patient referral page (embeds your GHL HIPAA form)
  thank-you.html          after a form is sent; fires the ad conversion
  privacy-policy.html     PLACEHOLDER — needs a real policy before launch
  assets/js/config.js     ← phone, fax, email, keys, form URL. Edit this first.
  assets/css/styles.css   brand colors at the top
  assets/img/             your logo and photos go here (see README inside)
lib/lead.js               the /api/lead logic (shared by both hosts)
api/lead.js               /api/lead wrapper for Vercel
functions/api/lead.js     /api/lead wrapper for Cloudflare Pages
vercel.json               Vercel settings (serves ./site, clean URLs, headers)
```

The site runs on **Vercel** or **Cloudflare Pages**. Use one; the steps for each are below.

## How a lead flows

1. A visitor fills out a form on `/contact`.
2. The browser sends it to `/api/lead` with a Turnstile token (bot check) and where the visitor
   came from (Google/Meta ad click ID, UTM tags, first page they landed on).
3. `/api/lead` verifies the bot check, validates and cleans the fields, then posts one flat JSON
   lead to your GoHighLevel webhook. The webhook URL stays secret on the server.
4. The visitor lands on `/thank-you`, which reports an anonymous "Lead" conversion to Google/Meta.
5. A GoHighLevel workflow creates the contact, texts/emails them, and alerts your intake team.

**Patient referrals** (with patient health details) go through a form hosted *inside* GoHighLevel
and embedded on `/refer`, so that data never touches this website, only your HIPAA-covered CRM.
The `/contact` forms deliberately ask for no medical details.

Ad pixels never load on `/contact` or `/refer` (`<body data-tracking="off">`).

## Run it locally

```
npm install
npm run dev        # http://localhost:8788
```

`.dev.vars` holds local secrets. With `GHL_WEBHOOK_URL` empty, leads are accepted but sent
nowhere ("dry run"), which is good for testing the forms.

## Go-live setup

### 1a. Vercel hosting
1. vercel.com → sign up with GitHub → **Add New → Project** → import `youngmogoi/PointCareHS`.
2. Framework preset: **Other**. Leave build command empty; `vercel.json` already sets the
   output directory to `site`.
3. **Environment Variables** (before the first deploy): `TURNSTILE_SECRET_KEY`,
   `GHL_WEBHOOK_URL`, optional `GHL_WEBHOOK_URL_FACILITY`.
4. Deploy. Every push to `main` redeploys automatically; other branches get preview URLs.
5. Settings → Domains → add your domain and follow the DNS instructions.

Turnstile (the bot check) is a Cloudflare service but works on any host: create it in a free
Cloudflare account (section 1b, step 2) and add your Vercel domains to the Turnstile site's hostnames.

### 1b. Cloudflare Pages hosting (alternative to Vercel)
1. Create a free Cloudflare account; add your domain (pointcarehs.com).
2. **Turnstile** → Add site → copy the **site key** into `config.js` (`turnstileSiteKey`) and keep
   the **secret key** for step 4.
3. Deploy: `npx wrangler login`, then `npm run deploy` (or connect a GitHub repo in the dashboard).
4. Pages project → Settings → **Variables and Secrets** (Production), add as *encrypted*:
   - `TURNSTILE_SECRET_KEY`
   - `GHL_WEBHOOK_URL` (from step 2.3 below)
   - optional `GHL_WEBHOOK_URL_FACILITY` if you want a separate workflow for facility leads
5. Add your custom domain under Pages → Custom domains.
6. Recommended: Security → WAF → **Rate limiting rule** on `/api/lead` (e.g. 5 requests/minute per IP).

### 2. GoHighLevel
1. Buy the **HIPAA add-on**, sign the **BAA**, and turn on HIPAA mode for your sub-account.
   (The add-on can't be cancelled once enabled, so do this when you're ready to take referrals.)
2. Create custom fields for: `lead_type`, `relationship`, `inquiry`, `best_time`, `organization`,
   `org_type`, `referral_volume`, `sms_consent`, `consent_timestamp`, `consent_ip`,
   `consent_text_version`, `consent_page`, `landing_page`, `utm_source`, `utm_medium`,
   `utm_campaign`, `gclid`, `fbclid`.
3. **Automation → Workflows → New** → trigger **Inbound Webhook**. Copy the URL into
   `GHL_WEBHOOK_URL`. Submit one test lead from the live site so GHL sees the fields, then add a
   **Create/Update Contact** action and map each field. Use the `tags` value to apply tags.
4. Speed-to-lead actions in that workflow:
   - If tag `sms-consent`: send an instant confirmation text.
   - Send a confirmation email.
   - Internal notification (text + email) to intake staff.
   - Create an **Opportunity** in a pipeline: *New → Contacted → Intake scheduled → Admitted / Not a fit*.
   - Wait 10 minutes → if the opportunity is still *New*, alert a manager.
5. **Referral form:** Sites → Forms → build the referral form (referrer info, patient info,
   insurance, reason for referral, file upload for face sheet/orders). Copy its link into
   `config.js` → `ghlReferralFormUrl`. Give it its own workflow: notify intake + send the referrer a
   "referral received" email.
6. Register for **A2P 10DLC** texting in GHL (Settings → Phone Numbers → Trust Center). Carriers
   check your website's privacy policy and form consent wording, so finish the privacy page first.

### 3. Ads & analytics (optional)
Put your Google tag ID, Google Ads conversion label, and Meta Pixel ID in `config.js`. They load
only on pages without forms, and only an anonymous "Lead" event is sent from `/thank-you`.
Talk to your compliance advisor before running ads; Meta limits health-related ad targeting.

## Launch checklist
- [ ] Phone, fax, email, service area, hours in `config.js` / `contact.html`
- [ ] Real service lines, insurance list, and FAQ answers in `index.html` (search for `TODO`)
- [ ] Logo, favicon, and photos in `site/assets/img/`
- [ ] Real Turnstile site key in `config.js`, secret key in Cloudflare
- [ ] Privacy policy reviewed by your attorney/compliance advisor
- [ ] GHL HIPAA add-on + BAA signed; BAAs with any fax / call-tracking vendor too
- [ ] Test each form on the live site and confirm the contact, tags, texts and alerts in GHL
- [ ] Update the domain in `<link rel="canonical">` and JSON-LD if it isn't www.pointcarehs.com
