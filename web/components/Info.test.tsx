import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { F } from "./fuentes";
import { Fuente } from "./Info";

describe("Fuente", () => {
  it("sin texto propio nombra la fuente para lectores de pantalla", () => {
    const html = renderToStaticMarkup(Fuente({ href: F.siapaQuejas }));
    expect(html).toContain("SIAPA, quejas y sugerencias");
    expect(html).toContain("abre en otra pestaña");
  });
  it("con texto propio conserva ese texto", () => {
    const html = renderToStaticMarkup(Fuente({ href: F.epaPlomo, children: "EPA" }));
    expect(html).toContain('class="fuente">EPA');
    expect(html).not.toContain("EPA, plomo");
  });
});
