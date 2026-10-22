// Lead forms: tab switching, Turnstile, and submission to /api/lead.
(function () {
  const cfg = window.PCHS_CONFIG || {};
  const forms = Array.from(document.querySelectorAll("form[data-lead-type]"));
  if (!forms.length) return;

  // ---- Tabs ----------------------------------------------------------------
  const tabs = document.querySelectorAll("[role=tab]");
  function selectTab(tab) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
  }
  tabs.forEach((t) => t.addEventListener("click", () => selectTab(t)));
  // /contact#facility opens the facility tab directly.
  const deepLinked = location.hash && document.querySelector(`[role=tab][data-hash="${location.hash.slice(1)}"]`);
  if (deepLinked) selectTab(deepLinked);

  // ---- Turnstile -----------------------------------------------------------
  const widgetIds = new Map();
  window.pchsTurnstileReady = function () {
    forms.forEach((form) => {
      const box = form.querySelector(".turnstile");
      if (box) widgetIds.set(form, turnstile.render(box, { sitekey: cfg.turnstileSiteKey }));
    });
  };
  const ts = document.createElement("script");
  ts.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=pchsTurnstileReady";
  ts.async = true;
  document.head.appendChild(ts);

  // ---- Submit --------------------------------------------------------------
  forms.forEach((form) => {
    const status = form.querySelector(".form-status");
    const button = form.querySelector("button[type=submit]");

    function showError(msg) {
      status.textContent = msg;
      status.className = "form-status error";
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      status.textContent = "";
      status.className = "form-status";

      if (!form.reportValidity()) return;

      const widgetId = widgetIds.get(form);
      const token = widgetId !== undefined ? turnstile.getResponse(widgetId) : "";
      if (!token) return showError("Please complete the verification check above.");

      const fields = Object.fromEntries(new FormData(form).entries());
      delete fields["cf-turnstile-response"];
      const payload = {
        lead_type: form.dataset.leadType,
        fields,
        consent: form.querySelector("[name=consent]")?.checked === true,
        attribution: window.PCHS_getAttribution ? window.PCHS_getAttribution() : {},
        page: location.pathname,
        turnstile_token: token,
      };

      button.disabled = true;
      button.dataset.label = button.textContent;
      button.textContent = "Sending…";
      try {
        const res = await fetch("/api/lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || "Something went wrong.");
        location.href = "/thank-you";
      } catch (err) {
        showError(err.message + " You can also call us at " + (cfg.company?.phone || "our office") + ".");
        if (widgetId !== undefined) turnstile.reset(widgetId);
        button.disabled = false;
        button.textContent = button.dataset.label;
      }
    });
  });
})();
