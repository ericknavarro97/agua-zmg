import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Pagina } from "@/components/Info";
import OrigenSitio from "@/components/OrigenSitio";
import { LICENCIA } from "@/app/api/v1/_lib/comun";

export const metadata: Metadata = {
  title: "Datos abiertos y API",
  description:
    "Descarga la gravedad del agua por colonia en la Zona Metropolitana de Guadalajara (GeoJSON, CSV y API de solo lectura). Sin identificadores personales.",
};

// Son rutas de la API (no páginas): se pasan como variables para que el lint de enlaces de Next no las confunda con páginas
const URL_GEOJSON = "/api/v1/colonias?con_datos=1";
const URL_GEOJSON_LIGERO = "/api/v1/colonias?con_datos=1&sin_geometria=1";

const INDICE = [
  { id: "licencia", texto: "Licencia" },
  { id: "descargar", texto: "Descargar" },
  { id: "api", texto: "API" },
  { id: "campos", texto: "Qué significa cada campo" },
  { id: "uso", texto: "Uso responsable" },
];

export default function Datos() {
  return (
    <Pagina
      etiqueta="Datos abiertos · API"
      indice={INDICE}
      titulo="Datos abiertos y API"
      resumen="Los resultados del mapa están disponibles para medios, organizaciones, investigadores y otras aplicaciones. Solo agregados por colonia: nunca identificadores personales."
    >

      <Aviso tono="alerta" titulo="Qué significan estos datos">
        <p>
          Son <strong>reportes ciudadanos sin verificar</strong>: reflejan percepción, no mediciones de laboratorio. No son
          información oficial ni consejo médico. Que una colonia no tenga nivel <strong>no</strong> significa que el agua sea
          buena, sino que todavía no hay reportes suficientes. Si publicas estos datos, conserva la atribución y este matiz.
          Cómo se calculan: <Link href="/metodologia">metodología</Link>.
        </p>
      </Aviso>

      <h2 id="licencia">Licencia</h2>
      {LICENCIA.estado === "confirmada" ? (
        <p>
          Los datos se publican bajo la licencia{" "}
          <a href={LICENCIA.url} target="_blank" rel="noopener noreferrer">
            {LICENCIA.nombre}<span className="sr-only"> (abre en otra pestaña)</span>
          </a>
          .
        </p>
      ) : (
        <Aviso tono="alerta" titulo="Licencia pendiente de decisión">
          <p>
            La licencia de los datos <strong>todavía no está decidida</strong>. La API declara de forma{" "}
            <strong>provisional</strong> la{" "}
            <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer">
              ODbL 1.0<span className="sr-only"> (abre en otra pestaña)</span>
            </a>
            . Puede cambiar; cada respuesta de la API indica si la licencia ya está «confirmada» o sigue «provisional».
          </p>
        </Aviso>
      )}
      <ul>
        <li>
          <strong>Atribución sugerida:</strong> «Agua ZMG, mapa ciudadano de la calidad del agua en la ZMG (reportes de
          vecinos)», con la fecha de corte.
        </li>
        <li>
          <strong>Polígonos de colonias:</strong> son aproximados y no oficiales. Vienen del catálogo de colonias del INE
          (corte de diciembre de 2020) republicado por terceros; su licencia y procedencia no están confirmadas con el INE.
        </li>
        <li>El código del proyecto y los datos tendrán licencias distintas.</li>
      </ul>

      <h2 id="descargar">Descargar</h2>
      <ul>
        <li>
          <a href="/api/v1/resumen.csv?con_datos=1" download>
            Resumen por colonia en CSV
          </a>{" "}
          (solo colonias con nivel publicado; se abre en Excel o en cualquier hoja de cálculo).
        </li>
        <li>
          <a href={URL_GEOJSON}>GeoJSON de colonias con nivel publicado</a> (con polígonos; pesa varios MB
          sin comprimir).
        </li>
        <li>
          <a href={URL_GEOJSON_LIGERO}>Lo mismo sin polígonos</a> (mucho más ligero).
        </li>
        <li>
          <a href="/openapi.json">Especificación OpenAPI</a> para generar clientes.
        </li>
      </ul>

      <h2 id="api">API de solo lectura</h2>
      <p>
        Sin llaves ni registro. CORS abierto. Solo <code>GET</code>. Los datos pueden tener unos minutos de retraso (caché):
        no consultes más seguido que cada 60 segundos.
      </p>
      <div className="tabla">
      <table>
        <thead>
          <tr>
            <th>Endpoint</th>
            <th>Qué devuelve</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>GET /api/v1/colonias</code></td>
            <td>
              GeoJSON con una colonia por elemento y su nivel, confianza y conteo. Parámetros: <code>municipio</code>,{" "}
              <code>con_datos=1</code>, <code>sin_geometria=1</code>.
            </td>
          </tr>
          <tr>
            <td><code>GET /api/v1/colonias/&#123;id&#125;</code></td>
            <td>Detalle de una colonia: serie diaria de todo su historial y datos oficiales vinculados (separados del nivel).</td>
          </tr>
          <tr>
            <td><code>GET /api/v1/resumen.csv</code></td>
            <td>CSV con un renglón por colonia, sin identificadores ni comentarios.</td>
          </tr>
        </tbody>
      </table>
      </div>
      <pre>
        <code>
          {"curl -s \""}
          <OrigenSitio />
          {"/api/v1/colonias?con_datos=1&sin_geometria=1\""}
        </code>
      </pre>

      <h2 id="campos">Qué significa cada campo</h2>
      <div className="tabla">
      <table>
        <thead>
          <tr>
            <th>Campo</th>
            <th>Significado</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>score</code></td><td>Gravedad promedio ponderada de 0 (limpia) a 4 (crítica). Vacío si aún no hay suficientes reportes.</td></tr>
          <tr><td><code>nivel</code></td><td>El <code>score</code> redondeado a un entero de 0 (limpia) a 4 (crítica), el color del mapa.</td></tr>
          <tr><td><code>confianza</code></td><td><code>baja</code>, <code>media</code> o <code>alta</code>: qué tan respaldado está el nivel. Ver <Link href="/metodologia#confianza">metodología</Link>.</td></tr>
          <tr><td><code>n</code></td><td>Todos los reportes contados de la colonia (sin límite de antigüedad; los recientes pesan más en el nivel).</td></tr>
          <tr><td><code>n_huellas</code></td><td>Huellas diarias distintas (solo un conteo). La huella rota cada día: una misma persona que reporta varios días cuenta una vez por día, así que no equivale a personas ni a dispositivos.</td></tr>
          <tr><td><code>ultimo</code></td><td>Día (hora de Guadalajara) del reporte más reciente contado. Solo el día, nunca la hora.</td></tr>
          <tr><td><code>fuente_geom</code></td><td>Procedencia del polígono de la colonia.</td></tr>
        </tbody>
      </table>
      </div>

      <h2 id="uso">Uso responsable</h2>
      <ul>
        <li>Cita la fuente y la fecha de corte.</li>
        <li>
          No presentes el color de una colonia como diagnóstico oficial ni como «agua potable / no potable»: es un resumen de
          reportes de vecinos.
        </li>
        <li>No intentes reidentificar a quien reportó: la API no expone ese dato.</li>
        <li>
          Este sitio no está vinculado a la asignación de apoyos ni descuentos: los datos son ciudadanos y sin verificar.
        </li>
      </ul>
    </Pagina>
  );
}
