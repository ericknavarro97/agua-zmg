import { SITIO } from "@/lib/sitio";
import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Fuente, Pagina } from "@/components/Info";
import { F } from "@/components/fuentes";
import { Muestra } from "@/components/niveles";
import { METODO } from "@/lib/aggregation";
import { GRAVEDADES } from "@/lib/severity";

export const metadata: Metadata = {
  title: "Metodología: cómo se calcula el mapa",
  description:
    "Cómo se calcula el nivel de cada colonia, qué significan los niveles de confianza, qué evita que unos pocos dominen el mapa y qué límites tiene. No es dato oficial ni consejo médico.",
};

// Los números de esta página salen de web/lib/aggregation.ts (PARAMS, método "v2"). Si cambias un parámetro allí,
// sube METODO y actualiza esta tabla: la página debe decir lo mismo que hace el código.

const INDICE = [
  { id: "que-es", texto: "Qué es y qué NO es" },
  { id: "niveles", texto: "Los cuatro niveles" },
  { id: "calculo", texto: "Cómo se calcula" },
  { id: "confianza", texto: "Niveles de confianza" },
  { id: "abuso", texto: "Contra el abuso" },
  { id: "limites", texto: "Límites" },
  { id: "externos", texto: "Datos externos (oficiales y de otras fuentes)" },
  { id: "mapa", texto: "Los límites de las colonias" },
  { id: "moderacion", texto: "Moderación" },
];

export default function Metodologia() {
  return (
    <Pagina
      etiqueta={`Metodología · Método ${METODO}`}
      indice={INDICE}
      titulo="Metodología: cómo se calcula el mapa"
      resumen="Publicamos las reglas y los números para que cualquiera pueda revisarlos. Método vigente: «v2» (desde v2 basta un reporte para publicar; en v1 se necesitaban tres)."
    >

      <h2 id="que-es">Qué es y qué NO es</h2>
      <ul>
        <li>
          <strong>Es</strong> un resumen de lo que reportan los vecinos sobre cómo llega el agua a su casa, agrupado por
          colonia.
        </li>
        <li>
          <strong>No es</strong> un dato oficial, ni una medición de laboratorio, ni un conteo oficial de colonias
          afectadas. No dice si el agua «es potable» o «no es potable».
        </li>
        <li>
          <strong>No es consejo médico.</strong> Para saber qué hacer en casa, lee <Link href="/que-hacer">qué hacer</Link>.
        </li>
        <li>
          <strong>Sin reportes no significa agua buena.</strong> Una colonia gris solo quiere decir que todavía no hay
          reportes que publicar.
        </li>
      </ul>

      <h2 id="niveles">Los cuatro niveles</h2>
      <p>Cada reporte es una respuesta a «¿cómo llega el agua a tu casa hoy?». En el mapa, cada nivel tiene color, trama y nombre:</p>
      <ul className="!list-none !gap-0 divide-y divide-[#e6ebef] overflow-hidden rounded-[18px] border border-borde bg-white !pl-0">
        {GRAVEDADES.map((g) => (
          <li key={g.nivel} className="flex items-start gap-3.5 px-4 py-3.5">
            <Muestra nivel={g.nivel} grande />
            <span>
              <strong>
                Nivel {g.nivel}: {g.etiqueta}.
              </strong>{" "}
              {g.detalle}.
            </span>
          </li>
        ))}
        <li className="flex items-start gap-3.5 px-4 py-3.5">
          <Muestra nivel={null} grande />
          <span>
            <strong>Sin datos suficientes.</strong> Aún no hay reportes de vecinos en esa colonia.
          </span>
        </li>
      </ul>

      <p>
        <strong>Ningún nivel significa que el agua sea segura para beber o cocinar.</strong> La escala describe cómo se ve y
        huele el agua, no si hay agua: el desabasto se reporta aparte, con la nota «Sin agua / baja presión», y no cambia el
        nivel. Mira <Link href="/que-hacer">qué hacer</Link>.
      </p>

      <h2 id="calculo">Cómo se calcula el nivel de una colonia</h2>
      <p>
        Solo cuentan los reportes de los últimos <strong>14 días</strong> que no estén ocultos ni marcados como sospechosos.
        El cálculo sigue estos pasos (el código es público: <code>web/lib/aggregation.ts</code>):
      </p>
      <ol>
        <li>
          <strong>Peso de cada reporte.</strong> Cada reporte vale 1, pero una misma red (por ejemplo, una misma casa o
          una misma oficina) no puede pesar más de 2 reportes por día ni más de 3 por semana en una colonia. Si una red
          manda 6 o más reportes el mismo día a una colonia, pesan una cuarta parte. Un formulario enviado en menos de 5
          segundos pesa la mitad.
        </li>
        <li>
          <strong>Los recientes pesan más.</strong> Cada reporte pierde la mitad de su peso cada 7 días.
        </li>
        <li>
          <strong>Promedio recortado.</strong> Se descarta el 20 % del peso en cada extremo (los reportes más bajos y los más
          altos) y se promedia el resto. Así, unos pocos reportes extremos no mueven el color.
        </li>
        <li>
          <strong>Contracción hacia un valor de partida.</strong> Con pocos reportes, el resultado se acerca a un valor
          neutro (entre 1.5 y 2.5; 2.0 si no hay datos). Con más evidencia, ese efecto desaparece. Evita que un solo
          reporte decida el color: uno solo mueve la colonia hacia su gravedad, pero no hasta el extremo, y cada reporte
          nuevo la acerca al promedio de los vecinos.
        </li>
        <li>
          <strong>Mínimo para publicar.</strong> Basta un reporte (o el equivalente: un formulario enviado en menos de 5
          segundos pesa la mitad, así que se necesitan dos). Con pocos reportes el color sale tenue y con trama, con
          confianza baja, y no cuenta como colonia «afectada» en el resumen. Sin ningún reporte, la colonia se queda en gris.
        </li>
        <li>
          El color es el promedio resultante redondeado al nivel entero más cercano (1 a 4).
        </li>
      </ol>
      <Aviso tono="alerta" titulo="Los parámetros son valores iniciales">
        <p>
          Los números de arriba (20 %, 7 días, topes por red, mínimos) son valores razonados, <strong>no medidos</strong> con
          datos reales. Se recalibrarán con las primeras semanas de datos. Cada cambio sube la versión del método y se
          registra con fecha.
        </p>
      </Aviso>

      <h2 id="confianza">Niveles de confianza</h2>
      <p>
        Además del nivel, cada colonia publicada tiene una confianza que dice qué tan respaldado está ese nivel. Se mide con
        la evidencia efectiva (no con el número bruto de reportes), los días distintos en que hubo reportes y las redes
        distintas de las que vinieron.
      </p>
      <div className="tabla">
      <table>
        <thead>
          <tr>
            <th>Confianza</th>
            <th>Qué significa</th>
            <th>Cómo se ve en el mapa</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Baja</strong></td>
            <td>
              Poca evidencia (menos de 6), o menos de 2 días con evidencia suficiente, o más del 60 % de la evidencia llegó en
              un solo día. Puede ser real, pero aún no se corrobora.
            </td>
            <td>Color tenue. No se cuenta como «colonia afectada» en el resumen.</td>
          </tr>
          <tr>
            <td><strong>Media</strong></td>
            <td>
              Evidencia de 6 o más, en al menos 2 días y sin que un solo día aporte más del 60 %, pero sin cumplir todo lo de
              «alta».
            </td>
            <td>Color normal.</td>
          </tr>
          <tr>
            <td><strong>Alta</strong></td>
            <td>
              Evidencia de 12 o más, en al menos 3 días, desde al menos 8 redes distintas (por semana), sin que un solo día
              aporte más del 60 %, y sin que el promedio recortado y la mediana difieran en más de 0.75.
            </td>
            <td>Color normal.</td>
          </tr>
        </tbody>
      </table>
      </div>
      <p>
        Incluso con confianza alta, el mapa refleja <em>lo que reportan vecinos</em>, no un análisis de laboratorio.
      </p>

      <h2 id="abuso">Qué evita que unos pocos dominen el mapa</h2>
      <ul>
        <li>
          <strong>No guardamos tu IP ni tu ubicación.</strong> Para limitar abusos guardamos códigos que no permiten saber quién
          eres (ver <Link href="/privacidad">privacidad</Link>).
        </li>
        <li>Un reporte por colonia por persona al día; si reenvías, se actualiza el de hoy en lugar de sumar otro.</li>
        <li>Topes de peso por red y por semana, y detección de ráfagas (muchos reportes en pocos minutos).</li>
        <li>
          Un campo señuelo y un tiempo mínimo en el formulario. Los reportes que parecen automáticos se guardan marcados y no
          cuentan; por seguridad, no publicamos los umbrales exactos de estas dos señales.
        </li>
        <li>
          Cuando algo parece raro, el sistema <strong>degrada</strong> (cuenta menos o mantiene la confianza baja); no oculta
          nada por sí solo.
        </li>
      </ul>

      <h2 id="limites">Lo que no podemos evitar</h2>
      <Aviso tono="peligro" titulo="Límite conocido">
        <p>
          Quien logre parecer muchos vecinos distintos (muchas redes, a ritmo humano, durante varios días) no se distingue de
          vecinos reales. Hemos medido este caso y lo declaramos: contra reportes falsos desde una sola red el método es mucho
          más robusto que un promedio simple, pero contra reportes falsos desde muchas redes casi no mejora.
        </p>
      </Aviso>
      <ul>
        <li>Quien reporta es una muestra autoseleccionada: tiende a reportar quien tiene un problema.</li>
        <li>
          Hay colonias con muchos vecinos conectados y otras sin acceso a internet. El mapa puede subrepresentar a quienes
          menos acceso tienen.
        </li>
        <li>
          Varias personas pueden compartir una misma conexión (por ejemplo, un edificio o un operador móvil); el tope por red
          puede restarles peso aunque sean reportes honestos.
        </li>
        <li>
          Con pocos reportes el color puede cambiar de un nivel entero con uno más. Por eso existe el nivel de confianza.
        </li>
      </ul>

      <h2 id="externos">Datos externos (oficiales y de otras fuentes)</h2>
      <p>
        En el panel de cada colonia mostramos datos externos (oficiales, académicos, periodísticos o de organizaciones
        ciudadanas) <strong>por separado</strong>. <strong>No entran al cálculo del nivel</strong> ni cambian el color. Cada uno
        trae su fuente, su fecha y qué tan seguro es que corresponda a esa colonia (el vínculo se hace por nombre).
      </p>
      <ul>
        <li>
          Muchos son <strong>listados administrativos</strong> (por ejemplo, colonias incluidas en un programa de descuento),
          no mediciones.
        </li>
        <li>
          Algunas pruebas ciudadanas usan tiras reactivas semicuantitativas y no sustituyen un laboratorio acreditado.
        </li>
        <li>
          Los límites de referencia que mostramos vienen de la NOM-127-SSA1-2021: por ejemplo, plomo 0.01 mg/L, cloro
          residual libre de 0.2 a 1.5 mg/L y turbiedad de 4.0 UNT que baja a 3.0 UNT al segundo año de vigencia.{" "}
          <Fuente href={F.nom127}>NOM-127</Fuente>
        </li>
      </ul>
      <p>
        No hay una cifra oficial única de colonias afectadas: se citan números distintos según la fuente y la fecha, y por eso
        el mapa solo muestra sus propios conteos.
      </p>

      <h2 id="mapa">Los límites de las colonias</h2>
      <ul>
        <li>
          Los polígonos son <strong>aproximados y no oficiales</strong>. Vienen del catálogo de colonias del INE (corte de
          diciembre de 2020) republicado por terceros.
        </li>
        <li>
          Faltan colonias posteriores a 2020 (sobre todo en Tlajomulco, Zapopan norte, Tonalá y El Salto). Si la tuya no
          aparece, busca la colonia vecina.
        </li>
        <li>
          Los nombres no traen acentos, algunos se repiten dentro de un mismo municipio y hay polígonos anidados; al tocar
          el mapa elegimos el más pequeño.
        </li>
      </ul>

      <h2 id="moderacion">Moderación</h2>
      <ul>
        <li>
          Un reporte solo se oculta por <strong>cómo llegó</strong> (por ejemplo, automatizado o repetido), no por lo que dice.
          Ocultar es una decisión humana con motivo escrito.
        </li>
        <li>
          El comentario libre se depura (teléfonos, correos y enlaces se enmascaran) y <strong>se muestra en la página de la
          colonia</strong>, solo con el día y la gravedad, sin hora ni identificadores. El formulario lo avisa antes de enviar;
          los comentarios anteriores a ese aviso nunca se publican. Un moderador puede retirar un comentario.
        </li>
        <li>
          Canal para impugnar un reporte o el nivel de una colonia:{" "}
          {SITIO.contactoEmail ? (
            <a href={`mailto:${SITIO.contactoEmail}`}>{SITIO.contactoEmail}</a>
          ) : (
            <>
              <strong>aún por definir</strong>. Consulta <Link href="/acerca">Acerca de</Link> para el estado del contacto.
            </>
          )}
        </li>
      </ul>

      <h2>Datos abiertos</h2>
      <p>
        Todos los resultados están disponibles como datos abiertos, sin identificadores personales:{" "}
        <Link href="/datos">cómo descargarlos</Link>.
      </p>
    </Pagina>
  );
}
