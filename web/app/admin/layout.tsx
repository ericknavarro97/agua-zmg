import NavPrincipal from "@/components/NavPrincipal";

// El panel de moderación conserva la navegación del sitio, sin el pie público
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavPrincipal />
      {children}
    </>
  );
}
