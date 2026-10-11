import Link from "next/link";
import AguaApp from "@/components/AguaApp";

export default function Home() {
  return (
    // El mapa ocupa toda la pantalla: la navegación y el pie flotan encima (components/AguaApp.tsx)
    <main id="contenido" className="relative flex h-dvh min-h-[34rem] flex-col">
      <AguaApp />
      <noscript>
        <div className="absolute inset-x-3 bottom-3.5 z-30 rounded-3xl bg-tinta p-4 text-sm text-white shadow-xl md:inset-x-auto md:left-1/2 md:w-[40rem] md:-translate-x-1/2">
          <p className="font-semibold">El mapa necesita JavaScript.</p>
          <p className="mt-1 text-texto-dock">
            Mientras tanto, lee <Link href="/que-hacer" className="text-acento underline">qué hacer con agua turbia</Link> y{" "}
            <Link href="/denunciar" className="text-acento underline">dónde denunciar</Link>.
          </p>
        </div>
      </noscript>
    </main>
  );
}
