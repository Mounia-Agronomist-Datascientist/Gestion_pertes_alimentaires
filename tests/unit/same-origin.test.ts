import { describe, expect, it } from "vitest";
import { isSameOrigin } from "@/modules/auth/same-origin";

const req = (headers: Record<string, string>) => ({ headers: new Headers(headers), url: "https://pertes.example.netlify.app/connexion/session" });

describe("formulaires de connexion : même origine", () => {
  it("accepte l'application elle-même, y compris derrière l'hébergeur", () => {
    expect(isSameOrigin(req({ origin: "https://pertes.example.netlify.app", host: "pertes.example.netlify.app" }))).toBe(true);
    expect(isSameOrigin(req({ origin: "https://pertes.example.netlify.app", host: "interne:3000", "x-forwarded-host": "pertes.example.netlify.app" }))).toBe(true);
  });
  it("refuse un autre site", () => {
    expect(isSameOrigin(req({ origin: "https://site-malveillant.example", host: "pertes.example.netlify.app" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "pas une adresse", host: "pertes.example.netlify.app" }))).toBe(false);
  });
});
