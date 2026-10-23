// POST /api/lead on Cloudflare Pages. All logic lives in lib/lead.js.
import { handleLead, methodNotAllowed } from "../../lib/lead.js";

export function onRequestPost({ request, env }) {
  return handleLead(request, env, request.headers.get("CF-Connecting-IP") || "");
}

export const onRequest = methodNotAllowed;
