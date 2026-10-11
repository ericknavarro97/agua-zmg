import { REPO_URL, SITIO } from "@/lib/sitio";
import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Pagina } from "@/components/Info";

export const metadata: Metadata = {
  title: "Acerca de Agua ZMG",
  description:
    "Qué es Agua ZMG, para qué sirve, por qué es no partidista y cómo puedes contribuir con reportes, datos o código.",
};

export default function Acerca() {
  return (
    <Pagina
      etiqueta="Acerca de"
      titulo="Acerca de Agua ZMG"
      resumen="Un mapa ciudadano de cómo llega el agua a cada colonia de la Zona Metropolitana de Guadalajara."
    >
      <h2>Para qué sirve</h2>
      <p>
        Cuando el agua sale turbia, con olor o con color, cada vecino lo vive solo. Agua ZMG junta esos reportes por colonia
        para que se vea el tamaño del problema, y los acompaña con datos oficiales, académicos y de organizaciones cuando
        existen, además de una guía de qué hacer y dónde denunciar.
      </p>

      <h2>Lo que prometemos</h2>
      {/* Tarjetas: la frase en negrita es el título de cada una */}
      <ul className="tarjetas">
        <li>
          <strong>No es un sitio de gobierno.</strong> Es un proyecto ciudadano: no sustituye ni contradice a ninguna
          autoridad ni a un laboratorio. Cuando mostramos un dato publicado por una autoridad, lleva la etiqueta
          «Autoridad» y el enlace a su fuente.
        </li>
        <li>
          <strong>No es partidista.</strong> No apoya ni ataca a ningún gobierno, partido o campaña. Cuando hay versiones
          distintas de los hechos, las mostramos con su fuente.
        </li>
        <li>
          <strong>Transparente.</strong> El método de cálculo y los parámetros son públicos (<Link href="/metodologia">metodología</Link>)
          y los resultados se pueden descargar (<Link href="/datos">datos abiertos</Link>).
        </li>
        <li>
          <strong>Honesto con sus límites.</strong> Sin reportes no significa agua buena; un nivel alto no es un diagnóstico.
        </li>
        <li>
          <strong>Respetuoso con tu privacidad.</strong> Sin cuentas, sin IP, sin ubicación (<Link href="/privacidad">aviso de privacidad</Link>).
        </li>
        <li>
          <strong>Independiente de los apoyos.</strong> El mapa no decide quién recibe descuentos ni apoyos.
        </li>
      </ul>

      <h2>Créditos</h2>
      <p>
        Parte de las menciones por colonia (prensa, organizaciones y autoridades) las recopiló el proyecto{" "}
        <a href="https://github.com/Y8-dot/mapa.agua.zmg" target="_blank" rel="noopener noreferrer">
          Mapa Ciudadano de Calidad del Agua — ZMG<span className="sr-only"> (abre en otra pestaña)</span>
        </a>
        , publicado con licencia MIT. Cada una conserva su fuente original y su enlace; no las verificamos de forma
        independiente.
      </p>

      <h2>Cómo contribuir</h2>
      <ul>
        <li>
          <strong>Reporta</strong> cómo llega el agua a tu casa en <Link href="/">el mapa</Link>, y avisa a tus vecinos: el
          color es más confiable mientras más personas distintas reporten.
        </li>
        <li>
          <strong>Documenta y denuncia</strong> por los canales formales: <Link href="/denunciar">dónde denunciar</Link>.
        </li>
        <li>
          <strong>Aporta datos:</strong> si tu organización, universidad o medio tiene mediciones por colonia con método y
          fecha, queremos enlazarlas con su fuente, siempre separadas de los reportes de vecinos.
        </li>
        <li>
          <strong>Usa los datos abiertos</strong> (<Link href="/datos">API y CSV</Link>) citando la fuente y la fecha de
          corte.
        </li>
        <li>
          <strong>Código:</strong> está publicado en{" "}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            GitHub<span className="sr-only"> (abre en otra pestaña)</span>
          </a>
          . Puedes abrir un <em>issue</em> ahí para reportar un error o proponer una mejora. La licencia aún no está
          decidida.
        </li>
      </ul>

      <h2>Contacto</h2>
      {SITIO.contactoEmail ? (
        <p>
          Para dudas, errores en un dato, moderación o para impugnar un reporte o el nivel de una colonia, escribe a{" "}
          <a href={`mailto:${SITIO.contactoEmail}`}>{SITIO.contactoEmail}</a>. Si el error está en un dato de otra fuente,
          repórtalo también a la fuente original citada. También puedes abrir un <em>issue</em> en{" "}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            GitHub<span className="sr-only"> (abre en otra pestaña)</span>
          </a>
          .
        </p>
      ) : (
        <Aviso tono="alerta" titulo="Canal de contacto: aún por definir">
          <p>
            Todavía no hay un correo ni un canal público de contacto, de moderación ni de apelación. Cuando la persona u
            organización responsable lo defina, se publicará aquí. Mientras tanto, si encuentras un error en un dato,
            repórtalo también a la fuente original citada.
          </p>
        </Aviso>
      )}

      <h2>Reconocimientos y fuentes</h2>
      <ul>
        <li>
          Mapa base: © colaboradores de OpenStreetMap y OpenMapTiles, servido por OpenFreeMap.
        </li>
        <li>
          Límites de colonias: catálogo de colonias del INE (corte de diciembre de 2020) republicado por terceros; aproximados y
          no oficiales.
        </li>
        <li>
          Información de salud: Secretaría de Salud, CDC, EPA y OMS, citadas en cada punto de{" "}
          <Link href="/que-hacer">qué hacer</Link>.
        </li>
      </ul>
    </Pagina>
  );
}
