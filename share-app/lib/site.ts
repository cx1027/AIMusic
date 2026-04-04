/**
 * Main app URL for logo, player CTA, and footer links.
 * Set `NEXT_PUBLIC_APP_URL` in `.env.local` (e.g. http://localhost:5173/register).
 */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
  "http://localhost:5173/register";
