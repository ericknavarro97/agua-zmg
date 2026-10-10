"use client";

import { useSyncExternalStore } from "react";

const sinSuscripcion = () => () => {};

/** Muestra el origen real del sitio (p. ej. https://ejemplo.mx) para los ejemplos de la API */
export default function OrigenSitio() {
  const origen = useSyncExternalStore(sinSuscripcion, () => window.location.origin, () => "");
  return <>{origen || "https://TU-SITIO"}</>;
}
