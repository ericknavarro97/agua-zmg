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

// Los números de esta página salen de web/lib/aggregation.ts (PARAMS y METODO). Si cambias un parámetro allí,
// sube METODO y actualiza esta tabla: la página debe decir lo mismo que hace el código.

const INDICE = [
  { id: "que-es", texto: "Qué es y qué NO es" },
  { id: "niveles", texto: "Los cinco niveles" },
  { id: "calculo", texto: "Cómo se calcula" },
  { id: "confianza", texto: "Niveles de confianza" },
  { id: "abuso", texto: "Contra el abuso" },
  { id: "limites", texto: "Límites" },
  { id: "externos", texto: "Datos externos (oficiales y de otras fuentes)" },
  { id: "mapa", texto: "Los límites de las colonias" },
  { id: "moderacion", texto: "Moderación" },
  { id: "cambios", texto: "Cambios del método" },
];

export default function Metodologia() {
  return (
    <Pagina
      etiqueta={`Metodología · Método ${METODO}`}
      indice={INDICE}
      titulo="Metodología: cómo se calcula el mapa"
      resumen={`Publicamos las reglas y los números para que cualquiera pueda revisarlos. Método vigente: «${METODO}» (todos los reportes cuentan siempre y ninguno desaparece del mapa; los recientes pesan más).`}
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

      <h2 id="niveles">Los cinco niveles</h2>
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
        <strong>Ningún nivel significa que el agua sea segura para beber o cocinar, ni siquiera «Limpia».</strong> Que el
        agua se vea clara y no huela raro no descarta bacterias ni químicos que no se ven. La escala describe cómo se ve y
        huele el agua, no si hay agua: el desabasto se reporta aparte, con la opción «Hoy no llegó agua». Esos reportes se
        cuentan por separado en el panel de la colonia y no cambian el nivel. Mira <Link href="/que-hacer">qué hacer</Link>.
      </p>

      <h2 id="calculo">Cómo se calcula el nivel de una colonia</h2>
      <p>
        Cuentan <strong>todos los reportes, sin importar cuándo se enviaron</strong>, que tengan nivel (los de «Hoy no llegó
        agua» van aparte) y que no estén ocultos ni marcados como sospechosos. Ningún reporte deja de contar y una colonia
        reportada nunca vuelve a gris: así siempre queda a la vista el historial de lo que reportaron los vecinos.
        El cálculo sigue estos pasos (el código es público: <code>web/lib/aggregation.ts</code>):
      </p>
      <ol>
        <li>
          <strong>Peso de cada reporte.</strong> Cada reporte vale 1, pero una misma red (por ejemplo, una misma casa o
          una misma oficina) no puede pesar más de 2 reportes por día ni más de 3 por semana en una colonia. Si una red
          manda 6 o más reportes el mismo día a una colonia, pesan una cuarta parte. Un formulario enviado en menos de 5
          segundos pesa la mitad, igual que un envío que no declara cuánto tardó (el formulario siempre lo declara).
        </li>
        <li>
          <strong>Los recientes pesan más.</strong> Cada reporte pierde la mitad de su peso cada 7 días, pero nunca llega a
          cero. Cuando hay reportes nuevos, son los que mandan en el color: un historial viejo casi no lo mueve, para que el
          mapa diga cómo llega el agua ahora. Si una colonia solo tiene reportes viejos, conserva el color que esos reportes
          dicen, con confianza baja (se ve tenue) y con la fecha del último reporte en su panel. La confianza también
          descuenta lo viejo: un reporte de hace una semana cuenta como medio reporte.
        </li>
        <li>
          <strong>Promedio recortado.</strong> Se descarta el 20 % del peso en cada extremo (los reportes más bajos y los más
          altos) y se promedia el resto en la escala de 0 (limpia) a 4 (crítica). Así, unos pocos reportes extremos no
          mueven el color. Si en una colonia unos vecinos dicen «limpia» y otros «grave», el promedio queda en medio; cuando
          además el promedio y la mediana se separan más de 0.75 niveles, la confianza no pasa de media: es una señal de que
          la situación es desigual dentro de la colonia.
        </li>
        <li>
          <strong>Mínimo para publicar.</strong> Basta un reporte (o el equivalente: un formulario enviado en menos de 5
          segundos pesa la mitad, así que se necesitan dos). Un solo reporte pinta la colonia con el nivel que dice, pero
          tenue y con trama, con confianza baja, y no cuenta como colonia «afectada» en el resumen. Una vez publicada, la
          colonia se queda publicada. Solo se ve en gris una colonia que nunca ha tenido reportes.
        </li>
        <li>
          El color es el promedio resultante redondeado al nivel entero más cercano (0 a 4).
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
        la evidencia efectiva (no con el número bruto de reportes, y ya descontando lo que pesan menos los reportes
        viejos), los días distintos en que hubo reportes y las redes distintas de las que vinieron.
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
              Poca evidencia (menos de 5, contando que los reportes viejos pesan menos), o menos de 2 días con evidencia
              suficiente (un día cuenta si aporta al menos 1.5), o más del 60 % de la evidencia (también descontando lo viejo)
              llegó en un solo día. Puede ser real, pero aún no se corrobora.
            </td>
            <td>Color tenue. No se cuenta como «colonia afectada» en el resumen.</td>
          </tr>
          <tr>
            <td><strong>Media</strong></td>
            <td>
              Evidencia de 5 o más, en al menos 2 días y sin que un solo día aporte más del 60 %, pero sin cumplir todo lo de
              «alta».
            </td>
            <td>Color normal.</td>
          </tr>
          <tr>
            <td><strong>Alta</strong></td>
            <td>
              Evidencia de 10 o más, en al menos 3 días, desde al menos 8 redes distintas (por semana), sin que un solo día
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
          colonia</strong> en cuanto se envía, sin revisión previa, solo con el día y la gravedad, sin hora ni identificadores.
          El formulario lo avisa antes de enviar; los comentarios anteriores a ese aviso nunca se publican. Un moderador puede
          retirar un comentario; puede tardar alrededor de un minuto en desaparecer de la página.
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

      <h2 id="cambios">Cambios del método</h2>
      <ul>
        <li>
          <strong>v5 (22 oct 2026).</strong> Ningún reporte deja de contar: se quitó la ventana de 14 días, así que una
          colonia reportada ya no vuelve a gris y su historial completo queda a la vista (también en la gráfica y los
          comentarios del panel). Los reportes siguen perdiendo la mitad de su peso cada 7 días, así que lo reciente sigue
          mandando en el color. La regla del «pico de un día» de la confianza se mide ahora sobre la evidencia descontada:
          sin ventana, meses de historial habrían diluido un pico de hoy.
        </li>
        <li>
          <strong>v4 (21 oct 2026).</strong> Nueva opción «Hoy no llegó agua»: esos reportes se cuentan aparte y no cambian
          el nivel (antes había que elegir un nivel aunque no llegara agua). Un envío que no declara cuánto tardó el
          formulario pesa la mitad, como uno enviado en menos de 5 segundos.
        </li>
        <li>
          <strong>v3 (17 oct 2026).</strong> Nuevo nivel 0, «Limpia», para reportar que el agua llega bien. El color ya no
          se acerca a un valor de partida: en v2 un solo reporte «leve» se pintaba «moderada». La evidencia de los
          reportes viejos ahora decae (antes solo decaía su peso en el promedio); por eso los mínimos de evidencia
          para confianza media y alta bajan de 6 y 12 a 5 y 10, que equivalen a lo mismo con reportes de los últimos días. La gráfica de 30 días usa los mismos
          topes por red que el color.
        </li>
        <li>
          <strong>v2 (13 oct 2026).</strong> Basta un reporte para publicar una colonia (en v1 se necesitaban tres).
        </li>
        <li>
          <strong>v1.</strong> Primera versión.
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
