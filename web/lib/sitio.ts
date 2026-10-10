/**
 * Datos del sitio que solo puede aportar quien responde por el proyecto. Se leen del entorno al construir la app
 * (las páginas se prerenderizan), así que se definen ANTES de `next build`. Si falta alguno, la página lo dice con
 * honestidad en vez de inventar un contacto o afirmar una revisión que no ha ocurrido.
 */
const leer = (n: string) => (process.env[n] ?? "").trim() || null;
const correo = (n: string) => {
  const v = leer(n);
  return v && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v) ? v : null;
};

export const SITIO = {
  /** Correo público de contacto, moderación y apelación */
  contactoEmail: correo("CONTACTO_EMAIL"),
  /** Quién responde por el tratamiento de datos (aviso de privacidad) */
  responsableNombre: leer("RESPONSABLE_NOMBRE"),
  responsableDomicilio: leer("RESPONSABLE_DOMICILIO"),
  /** "1" solo cuando un abogado revisó el aviso de privacidad */
  avisoPrivacidadRevisado: leer("AVISO_PRIVACIDAD_REVISADO") === "1",
  /** "1" solo cuando una persona de salud (médico/a, epidemiólogo/a, enfermero/a) revisó la guía /que-hacer */
  guiaRevisadaPorSalud: leer("GUIA_REVISADA_SALUD") === "1",
} as const;

export const hayResponsable = () => !!(SITIO.responsableNombre && SITIO.responsableDomicilio && SITIO.contactoEmail);
