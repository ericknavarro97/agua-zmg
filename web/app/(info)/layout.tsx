export default function InfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="contenido" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:py-10">
      {children}
    </main>
  );
}
