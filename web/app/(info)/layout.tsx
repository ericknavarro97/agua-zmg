import NavPrincipal from "@/components/NavPrincipal";
import PieSitio from "@/components/PieSitio";

export default function InfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavPrincipal />
      <main id="contenido" className="w-full flex-1">
        {children}
      </main>
      <PieSitio />
    </>
  );
}
