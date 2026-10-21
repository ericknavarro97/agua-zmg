import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// proxy.ts (el "middleware" de Next 16): cabeceras de seguridad y 404 del panel cuando está deshabilitado.
const cargar = async () => {
  vi.resetModules();
  return import("@/proxy");
};
const pide = (ruta: string) => new NextRequest(`http://localhost:3201${ruta}`);

afterEach(() => vi.unstubAllEnvs());

describe("proxy: panel de administración", () => {
  it("sin ADMIN_TOKEN, /admin y sub-rutas devuelven 404 real desde el proxy", async () => {
    vi.stubEnv("ADMIN_TOKEN", "");
    const { proxy } = await cargar();
    for (const r of ["/admin", "/admin/", "/admin/lo-que-sea"]) {
      const res = proxy(pide(r));
      expect(res.status, r).toBe(404);
      expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
    }
  });

  it("con un ADMIN_TOKEN corto (< 16) también queda deshabilitado", async () => {
    vi.stubEnv("ADMIN_TOKEN", "corto");
    const { proxy } = await cargar();
    expect(proxy(pide("/admin")).status).toBe(404);
  });

  it("con ADMIN_TOKEN válido deja pasar /admin (con noindex)", async () => {
    vi.stubEnv("ADMIN_TOKEN", "t".repeat(20));
    const { proxy } = await cargar();
    const res = proxy(pide("/admin"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("x-robots-tag")).toMatch(/noindex/);
  });

  it("no confunde rutas parecidas (/administrador) con el panel", async () => {
    vi.stubEnv("ADMIN_TOKEN", "");
    const { proxy } = await cargar();
    expect(proxy(pide("/administrador")).status).toBe(200);
  });

  it("/api/admin lleva noindex; el resto de la API no", async () => {
    const { proxy } = await cargar();
    expect(proxy(pide("/api/admin/moderacion")).headers.get("x-robots-tag")).toMatch(/noindex/);
    expect(proxy(pide("/api/colonias/scores")).headers.get("x-robots-tag")).toBeNull();
  });
});

describe("proxy: cabeceras de seguridad", () => {
  it("todas las respuestas llevan CSP, nosniff, Referrer-Policy, Permissions-Policy y COOP", async () => {
    const { proxy } = await cargar();
    const h = proxy(pide("/")).headers;
    expect(h.get("content-security-policy")).toMatch(/default-src 'self'/);
    expect(h.get("x-content-type-options")).toBe("nosniff");
    expect(h.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("permissions-policy")).toMatch(/geolocation=\(self\)/);
    expect(h.get("permissions-policy")).toMatch(/camera=\(\)/);
    expect(h.get("cross-origin-opener-policy")).toBe("same-origin");
  });

  it("HSTS solo en producción", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect((await cargar()).proxy(pide("/")).headers.get("strict-transport-security")).toBeNull();
    vi.stubEnv("NODE_ENV", "production");
    expect((await cargar()).proxy(pide("/")).headers.get("strict-transport-security")).toMatch(/max-age=\d+/);
  });

  it("la CSP prohíbe incrustar el sitio, bloquea <object> y formularios hacia fuera", async () => {
    const { csp } = await cargar();
    expect(csp("/")).toMatch(/frame-ancestors 'none'/);
    expect(csp("/api/v1/colonias")).toMatch(/frame-ancestors 'none'/);
    // no existe una vista para incrustar: /embed tampoco se puede meter en un iframe
    expect(csp("/embed")).toMatch(/frame-ancestors 'none'/);
    for (const d of ["object-src 'none'", "base-uri 'self'", "form-action 'self'"]) expect(csp("/")).toContain(d);
  });

  it("en producción: sin 'unsafe-eval' y con upgrade-insecure-requests", async () => {
    const { csp } = await cargar();
    expect(csp("/", false)).not.toContain("unsafe-eval");
    expect(csp("/", false)).toContain("upgrade-insecure-requests");
    expect(csp("/", true)).toContain("unsafe-eval");
  });

  it("CSP_MAPA_ORIGENES vacío usa los orígenes por defecto (no deja el mapa sin teselas)", async () => {
    vi.stubEnv("CSP_MAPA_ORIGENES", "");
    const { csp } = await cargar();
    expect(csp("/")).toContain("https://tiles.openfreemap.org");
    expect(csp("/")).toMatch(/img-src [^;]*https:\/\/tile\.openstreetmap\.org/);
  });

  it("CSP_MAPA_ORIGENES definido reemplaza los orígenes", async () => {
    vi.stubEnv("CSP_MAPA_ORIGENES", "https://tiles.ejemplo.test");
    const { csp } = await cargar();
    expect(csp("/")).toContain("https://tiles.ejemplo.test");
    expect(csp("/")).not.toContain("openfreemap");
  });
});
