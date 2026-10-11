import { SITIO, hayResponsable } from "@/lib/sitio";
import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Indice, Pagina } from "@/components/Info";

export const metadata: Metadata = {
  title: "Aviso de privacidad",
  description:
    "Qué datos guarda Agua ZMG cuando reportas el agua de tu colonia, para qué, por cuánto tiempo y qué no guarda. Sin cuenta, sin IP, sin ubicación.",
};

const INDICE = [
  { id: "responsable", texto: "Quién es responsable" },
  { id: "que-guardamos", texto: "Qué guardamos" },
  { id: "que-no", texto: "Qué NO guardamos" },
  { id: "para-que", texto: "Para qué lo usamos" },
  { id: "cuanto", texto: "Cuánto tiempo" },
  { id: "terceros", texto: "Con quién se comparte" },
  { id: "derechos", texto: "Tus derechos" },
];

export default function Privacidad() {
  return (
    <Pagina
      titulo="Aviso de privacidad"
      resumen="Versión simplificada. Aquí decimos con precisión qué guarda el sistema, no lo que sería más cómodo decir."
    >
      {!SITIO.avisoPrivacidadRevisado && (
        <Aviso tono="alerta" titulo="Borrador pendiente de revisión legal">
          <p>
            Este aviso describe lo que hace el sistema hoy. Todavía no lo ha revisado un abogado
            {hayResponsable() ? "" : " y falta definir quién es la persona u organización responsable (ver abajo)"}. Versión
            0.1, 8 de octubre de 2026.
          </p>
        </Aviso>
      )}
      <Indice items={INDICE} />

      <h2 id="responsable">Quién es responsable</h2>
      {hayResponsable() ? (
        <p>
          <strong>Responsable del tratamiento:</strong> {SITIO.responsableNombre}. Domicilio: {SITIO.responsableDomicilio}.
          Para solicitudes sobre tus datos: <a href={`mailto:${SITIO.contactoEmail}`}>{SITIO.contactoEmail}</a>.
        </p>
      ) : (
        <p>
          <strong>Responsable del tratamiento: aún por definir.</strong> Nombre, domicilio y correo para solicitudes: por
          definir. No inventamos datos de contacto: se publicarán aquí cuando existan.
        </p>
      )}

      <h2 id="que-guardamos">Qué guardamos cuando envías un reporte</h2>
      <ul>
        <li>La colonia, la gravedad que elegiste (1 a 4) y la fecha y hora.</li>
        <li>
          Los <strong>síntomas</strong> que marcaste (por ejemplo, «diarrea o malestar estomacal»). Son información de salud, un
          dato sensible. Solo se guardan si los marcas y no están ligados a tu nombre, porque no te lo pedimos.
        </li>
        <li>
          Un <strong>comentario</strong>, solo si lo escribes. Antes de guardarlo se enmascaran teléfonos, correos y enlaces.
          <strong> Se muestra públicamente</strong> en la página de la colonia, solo con el día y la gravedad que elegiste, sin
          tu nombre ni la hora. El formulario te lo avisa antes de enviar. Un moderador puede retirarlo. No escribas nombres ni
          direcciones. Los comentarios enviados antes de este aviso nunca se publican.
        </li>
        <li>
          El tiempo que tardaste en llenar el formulario (una señal contra programas automáticos).
        </li>
        <li>
          Unos <strong>códigos de control contra abusos</strong>: una «huella diaria» (cambia cada día), un código de tu red y
          uno semanal de tu red, y la familia de tu navegador (por ejemplo, «Chrome»). Se calculan a partir de tu conexión y tu
          navegador con una clave secreta, de modo que <strong>no permiten saber quién eres</strong>, pero sirven para detectar
          si alguien manda decenas de reportes.
        </li>
      </ul>
      <Aviso tono="info">
        <p>
          Honestidad técnica: la huella es un <em>seudónimo</em>, no una anonimización perfecta. Por eso la borramos a los 30
          días (ver abajo) y por eso no decimos «no guardamos datos personales», sino exactamente qué guardamos.
        </p>
      </Aviso>

      <h2 id="que-no">Qué NO guardamos</h2>
      <ul>
        <li>No hay cuentas ni contraseñas. No te pedimos nombre, correo ni teléfono.</li>
        <li>
          <strong>No guardamos tu dirección IP</strong> ni el texto completo de tu navegador: solo existen en memoria mientras se
          procesa el envío. (Ojo: la empresa que aloja el sitio puede conservar registros técnicos de las visitas con su propia
          política.)
        </li>
        <li>
          <strong>No guardamos tu ubicación.</strong> El botón «Mi ubicación» calcula tu colonia dentro de tu propio dispositivo;
          las coordenadas no se envían a nuestro servidor.
        </li>
        <li>No usamos cookies de seguimiento ni herramientas de analítica de terceros.</li>
      </ul>
      <p>
        Dos detalles técnicos: (1) tu navegador guarda en tu propio dispositivo qué colonias reportaste hoy para avisarte si
        repites; no se envía a nadie y puedes borrarlo limpiando los datos del sitio. (2) El mapa de calles lo sirve un proveedor
        externo (OpenFreeMap), por lo que tu navegador le pide imágenes del mapa y ese servicio ve tu dirección IP, como en
        cualquier mapa en línea.
      </p>

      <h2 id="para-que">Para qué lo usamos</h2>
      <ul>
        <li>Calcular el nivel de cada colonia (<Link href="/metodologia">metodología</Link>).</li>
        <li>Limitar el abuso: un reporte por colonia por persona al día, y detectar ráfagas o programas automáticos.</li>
        <li>
          Publicar solo <strong>agregados por colonia</strong> en el mapa y en los datos abiertos (<Link href="/datos">datos</Link>);
          nunca huellas, códigos de red ni comentarios.
        </li>
      </ul>
      <p>No usamos tus datos para publicidad ni los vendemos.</p>

      <h2 id="cuanto">Cuánto tiempo los guardamos</h2>
      {/* El plazo lo ejecuta web/scripts/purge.ts (servicio `retencion` de docker-compose.prod.yml; docs/OPERACION.md §4). Si esa tarea no corre a diario, esta promesa no se cumple: /admin avisa. Las copias de seguridad: docs/OPERACION.md §3.3. */}
      <ul>
        <li>
          La huella, los códigos de red y de navegador y el control del comentario se <strong>borran a los 30 días</strong>. El
          comentario también se borra a los 30 días.
        </li>
        <li>
          Después de eso queda solo la colonia, la gravedad, los síntomas marcados y la fecha, ya sin ningún identificador.
        </li>
        <li>
          Las copias de seguridad cifradas de la base se conservan 14 días, así que un dato ya borrado puede seguir en una copia
          hasta unos <strong>45 días</strong> en total, y luego desaparece también de ahí.
        </li>
      </ul>

      <h2 id="terceros">Con quién se comparte</h2>
      <ul>
        <li>
          No compartimos datos individuales con terceros. Lo que es público son los agregados por colonia, sin identificadores.
        </li>
        <li>
          Dentro del proyecto, <strong>personas moderadoras</strong> pueden leer los comentarios y los síntomas marcados (que son
          información sobre tu salud) para revisar reportes sospechosos o con datos personales. Si un comentario menciona a una
          persona o una dirección, lo borramos.
        </li>
        <li>
          Nuestros proveedores de alojamiento y base de datos procesan la información por nuestra cuenta (por definir cuáles al
          publicar el sitio).
        </li>
        <li>
          Solo entregaríamos información a una autoridad ante un requerimiento legal válido, y aun así solo tenemos lo descrito
          arriba.
        </li>
      </ul>

      <h2 id="derechos">Tus derechos</h2>
      <p>
        Puedes pedir acceso, corrección, cancelación u oposición respecto de tus datos personales. Como no te pedimos nada que
        permita identificarte, normalmente <strong>no podemos localizar tu reporte</strong> por tu nombre; si tienes una duda
        concreta, {SITIO.contactoEmail ? (
          <>escríbenos a <a href={`mailto:${SITIO.contactoEmail}`}>{SITIO.contactoEmail}</a>.</>
        ) : (
          <>
            escríbenos al canal de contacto cuando esté definido (ver <Link href="/acerca">Acerca de</Link>). Mientras no
            exista ese canal, no podemos recibir solicitudes: lo decimos con claridad en lugar de inventar un correo.
          </>
        )}
      </p>
      <p>
        Los cambios a este aviso se publicarán aquí con fecha y versión.
      </p>
    </Pagina>
  );
}
