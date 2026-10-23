// POST /api/lead on Vercel. All logic lives in lib/lead.js.
import { handleLead, methodNotAllowed } from "../lib/lead.js";

export function POST(request) {
  // Vercel puts the visitor's IP in x-real-ip (x-forwarded-for as a fallback).
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = request.headers.get("x-real-ip") || forwarded.split(",")[0].trim();
  return handleLead(request, process.env, ip);
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
