import { SITIO, hayResponsable } from "@/lib/sitio";
import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Pagina } from "@/components/Info";

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
  { id: "cambios", texto: "Cambios a este aviso" },
];

export default function Privacidad() {
  return (
    <Pagina
      etiqueta="Privacidad · Versión 0.2"
      indice={INDICE}
      titulo="Aviso de privacidad"
      resumen="Versión simplificada. Aquí decimos con precisión qué guarda el sistema, no lo que sería más cómodo decir."
    >
      {!SITIO.avisoPrivacidadRevisado && (
        <Aviso tono="alerta" titulo="Borrador pendiente de revisión legal">
          <p>
            Este aviso describe lo que hace el sistema hoy. Todavía no lo ha revisado un abogado
            {hayResponsable() ? "" : " y falta definir quién es la persona u organización responsable (ver abajo)"}. Versión
            0.2, 21 de octubre de 2026.
          </p>
        </Aviso>
      )}

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
        <li>La colonia, la gravedad que elegiste (0 a 4) o que no llegó agua, y la fecha y hora.</li>
        <li>
          Los <strong>síntomas</strong> que marcaste (por ejemplo, «diarrea o malestar estomacal»). Son información de salud, un
          dato sensible. Solo se guardan si los marcas y no están ligados a tu nombre, porque no te lo pedimos.
        </li>
        <li>
          Un <strong>comentario</strong>, solo si lo escribes. Antes de guardarlo se enmascaran teléfonos, correos y enlaces.
          <strong> Se muestra públicamente en cuanto lo envías</strong>, sin revisión previa, en la página de la colonia, solo
          con el día y lo que elegiste (la gravedad o que no llegó agua), sin tu nombre ni la hora. El formulario te lo avisa
          antes de enviar. Un moderador puede retirarlo después; tarda alrededor de un minuto en dejar de verse. No escribas
          nombres ni direcciones. Los comentarios enviados antes de que el formulario empezara a avisarlo nunca se
          publican.
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
          Honestidad técnica: la huella es un <em>seudónimo</em>, no una anonimización perfecta. Por eso nunca se publica y por
          eso no decimos «no guardamos datos personales», sino exactamente qué guardamos y cuánto tiempo (ver abajo).
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
          Publicar <strong>agregados por colonia</strong> en el mapa y en los datos abiertos (<Link href="/datos">datos</Link>), y
          los <strong>comentarios</strong> en la página de cada colonia (los datos abiertos no los incluyen). Nunca publicamos
          huellas, códigos de red ni la hora de un reporte.
        </li>
        <li>Conservar un registro histórico de cómo llegó el agua a cada colonia durante la crisis, para la comunidad.</li>
      </ul>
      <p>No usamos tus datos para publicidad ni los vendemos.</p>

      <h2 id="cuanto">Cuánto tiempo los guardamos</h2>
      {/* Decisión del proyecto (21-oct-2026): se conserva todo como registro de la comunidad y la tarea de borrado
          (web/scripts/purge.ts) no está programada. Si algún día se programa, este apartado debe decir el plazo real. */}
      <ul>
        <li>
          <strong>Conservamos los reportes</strong> como registro histórico de la comunidad: colonia, gravedad o que no llegó
          agua, síntomas marcados, fecha y, si lo escribiste, el comentario. No tienen fecha de borrado.
        </li>
        <li>
          Los <strong>códigos de control</strong> (huella, códigos de red y familia del navegador) también se conservan. Nunca se
          publican y solo se usan para limitar abusos. Si algún día los borramos o anonimizamos, lo diremos aquí con fecha.
        </li>
        <li>
          No hacemos copias de seguridad propias. Nuestro proveedor de base de datos guarda un historial de restauración de
          corta duración para recuperarse de una falla.
        </li>
        <li>
          Si quieres que retiremos tu comentario, escríbenos con la colonia, el día y el texto (ver «Tus derechos»).
        </li>
      </ul>

      <h2 id="terceros">Con quién se comparte</h2>
      <ul>
        <li>
          No compartimos datos individuales con terceros. Lo que es público son los agregados por colonia y los comentarios en
          la página de cada colonia, sin identificadores ni hora.
        </li>
        <li>
          Dentro del proyecto, <strong>personas moderadoras</strong> pueden leer los comentarios y los síntomas marcados (que son
          información sobre tu salud) para revisar reportes sospechosos o con datos personales. Si un comentario menciona a una
          persona o una dirección, lo borramos.
        </li>
        <li>
          Nuestros proveedores procesan la información por nuestra cuenta: Vercel aloja el sitio y Neon aloja la base de
          datos.
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
      <h2 id="cambios">Cambios a este aviso</h2>
      <p>Los cambios a este aviso se publican aquí con fecha y versión.</p>
      <ul>
        <li>
          <strong>0.2 (21 de octubre de 2026).</strong> Los datos se conservan como registro de la comunidad, sin fecha de
          borrado (antes decía que la huella y el comentario se borraban a los 30 días y que había copias de 14 días; esa tarea
          nunca llegó a programarse). Se nombran los proveedores (Vercel y Neon). Se agrega la opción «Hoy no llegó agua». Se
          aclara que los comentarios se publican en cuanto se envían, sin revisión previa.
        </li>
        <li>
          <strong>Octubre de 2026.</strong> Los comentarios nuevos se muestran en la página de la colonia (el formulario lo
          avisa).
        </li>
        <li>
          <strong>0.1 (8 de octubre de 2026).</strong> Primera versión.
        </li>
      </ul>
    </Pagina>
  );
}
