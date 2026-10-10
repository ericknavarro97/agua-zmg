import Link from "next/link";
import AguaApp from "@/components/AguaApp";

export default function Home() {
  return (
    <main id="contenido" className="relative flex min-h-[34rem] flex-1 flex-col">
      <AguaApp />
      <noscript>
        <div className="absolute inset-x-0 bottom-0 z-30 bg-white p-4 text-sm text-slate-900 shadow-xl">
          <p className="font-semibold">El mapa necesita JavaScript.</p>
          <p className="mt-1">
            Mientras tanto, lee <Link href="/que-hacer" className="underline">qué hacer con agua turbia</Link> y{" "}
            <Link href="/denunciar" className="underline">dónde denunciar</Link>.
          </p>
        </div>
      </noscript>
    </main>
  );
}
