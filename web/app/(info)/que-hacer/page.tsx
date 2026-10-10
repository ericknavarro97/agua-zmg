import { SITIO } from "@/lib/sitio";
import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, AvisoSalud, Fuente, Indice, Pagina, SegunMedios, Tel } from "@/components/Info";
import { F } from "@/components/fuentes";

export const metadata: Metadata = {
  title: "Qué hacer si tu agua sale turbia",
  description:
    "Guía en lenguaje sencillo: cómo usar, hervir o desinfectar el agua turbia, qué no resuelve hervirla, cuándo acudir a salud y cómo documentar el problema. Con fuentes.",
};

// La guía solo deja de decir que no ha sido revisada cuando GUIA_REVISADA_SALUD=1 (ver lib/sitio.ts y docs/DEPLOY.md).
const REVISADA_POR_SALUD = SITIO.guiaRevisadaPorSalud;

const INDICE = [
  { id: "primero", texto: "Lo más importante" },
  { id: "mirar", texto: "Primero, mira el agua" },
  { id: "hervir", texto: "Si no tienes garrafón: hervir" },
  { id: "cloro", texto: "Si no puedes hervir: cloro" },
  { id: "no-resuelven", texto: "Lo que hervir y el cloro NO resuelven" },
  { id: "filtros", texto: "Filtros: qué sí y qué no" },
  { id: "bebes", texto: "Bebés y fórmula" },
  { id: "tinacos", texto: "Tinacos y cisternas" },
  { id: "salud", texto: "Salud: cuándo acudir" },
  { id: "giardia", texto: "Giardia" },
  { id: "plomo", texto: "Plomo" },
  { id: "riesgo", texto: "Quién tiene más riesgo" },
  { id: "evidencia", texto: "Cómo documentar la evidencia" },
  { id: "contexto", texto: "Qué sabemos y qué no" },
];

export default function QueHacer() {
  return (
    <Pagina
      titulo="Qué hacer si tu agua sale turbia o sospechosa"
      resumen="Pasos sencillos con fuentes. Última verificación de las fuentes: 8 de octubre de 2026."
    >
      <Aviso tono="alerta">
        <p>
          Guía informativa: <strong>no sustituye a un profesional de la salud</strong>
          {!REVISADA_POR_SALUD && " y todavía no ha sido revisada por uno"}. Emergencia: <a href="tel:911">9-1-1</a>.{" "}
          <a href="#aviso">Aviso completo</a>.
        </p>
      </Aviso>

      <h2 id="primero">Lo más importante</h2>
      <Aviso tono="info" titulo="Si el agua de tu llave sale turbia, de color raro o con mal olor">
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            Para tomar, cocinar y lavarte los dientes, usa agua de garrafón o purificada. Es la recomendación de la
            Secretaría de Salud de Jalisco para el Área Metropolitana de Guadalajara<SegunMedios />{" "}
            <Fuente href={F.udgtvSalud} />
          </li>
          <li>
            Si no tienes otra opción, hierve el agua 5 minutos desde que empieza a burbujear con fuerza. Si está turbia,
            primero fíltrala con una tela limpia. <Fuente href={F.saludDesinfeccion}>Salud federal</Fuente>{" "}
            <Fuente href={F.cdcAgua}>CDC</Fuente>
          </li>
          <li>
            Hervir o echar cloro <strong>no quita el plomo</strong> ni otros químicos. <Fuente href={F.epaPlomo}>EPA</Fuente>{" "}
            <Fuente href={F.cdcAguaSegura}>CDC</Fuente>
          </li>
          <li>
            Para la fórmula de bebé, no uses agua de la llave: usa agua embotellada o fórmula lista para tomar.{" "}
            <Fuente href={F.cdcFormula} />
          </li>
          <li>
            Si alguien tiene diarrea con sangre, vómito constante, no puede tomar líquidos o tiene fiebre más de tres días,
            que vaya a una unidad de salud. <Fuente href={F.censiaEdas} />
          </li>
          <li>
            Guarda evidencia (fotos, video, fecha) y reporta. Tu reporte ayuda a que se vea el tamaño del problema:{" "}
            <Link href="/">reporta en el mapa</Link> y mira <Link href="/denunciar">dónde denunciar</Link>.
          </li>
        </ol>
      </Aviso>

      <Indice items={INDICE} plegable />

      <div id="aviso">
        <AvisoSalud />
        {!REVISADA_POR_SALUD && (
          <Aviso tono="peligro" titulo="Esta guía todavía no ha sido revisada por un profesional de salud">
            <p>
              Reunimos solo indicaciones con fuente (cada punto la cita) y dejamos fuera lo que no pudimos verificar. Aun así,
              ante cualquier duda o síntoma, consulta a un médico. Cuando esta guía sea revisada, este aviso se quitará.
            </p>
          </Aviso>
        )}
      </div>

      <h2 id="mirar">Primero, mira el agua</h2>
      <ul>
        <li>
          Salud Jalisco recomienda no usar el agua de la llave para beber ni para preparar alimentos en el Área
          Metropolitana de Guadalajara, y usar agua de garrafón o purificada<SegunMedios />. <Fuente href={F.udgtvSalud} />
        </li>
        <li>
          Según la misma dependencia, el agua de la llave puede usarse para lavar ropa y trastes, limpiar y bañarse, pero
          debe evitarse cuando tenga color marcado, turbiedad intensa, sedimentos o mal olor<SegunMedios />.{" "}
          <Fuente href={F.nmasRecomendaciones} />
        </li>
        <li>
          La CDC (autoridad de salud de Estados Unidos) también aconseja usar agua embotellada para beber, cocinar y
          cepillarse los dientes cuando el agua de la llave pueda no ser segura. <Fuente href={F.cdcAguaSegura} />
        </li>
        <li>
          Para lavar frutas y verduras, la Secretaría de Salud indica agua y jabón con agua potable.{" "}
          <Fuente href={F.saludEdasPrevencion} />
        </li>
      </ul>

      <h2 id="hervir">Si no tienes garrafón: hervir el agua</h2>
      <ol>
        <li>
          Si el agua está turbia, déjala reposar y fíltrala con una tela limpia, papel de cocina o filtro de café. Esto
          solo quita lo que se ve; no la desinfecta. <Fuente href={F.cdcAgua} />
        </li>
        <li>
          Hiérvela <strong>5 minutos contados desde el primer hervor</strong>. <Fuente href={F.saludDesinfeccion} />
        </li>
        <li>
          Déjala enfriar y guárdala en un recipiente limpio y con tapa. <Fuente href={F.saludDesinfeccion} />
        </li>
      </ol>
      <p>
        La CDC pide un mínimo de 1 minuto de hervor fuerte; usamos la cifra de la Secretaría de Salud de México (5 minutos)
        porque es la oficial de aquí y es más prudente. <Fuente href={F.cdcHervir} /> Hervir es el mejor método contra los
        gérmenes, incluidos los parásitos. <Fuente href={F.cdcGiardiaPrev} />
      </p>

      <h2 id="cloro">Si no puedes hervir: cloro (hipoclorito de sodio)</h2>
      <p>
        Primero filtra el agua turbia con una tela limpia. Esta dosis es solo para agua que se ve clara y para cloro con
        hipoclorito de sodio al 6 %: <strong>si tu cloro no dice 6 %, no uses este método</strong>; hierve o usa garrafón.
      </p>
      <ul>
        <li>
          Agrega <strong>2 gotas por cada litro de agua</strong> de cloro de uso doméstico con hipoclorito de sodio al 6 %.
          Deja reposar 30 minutos antes de usarla, en un recipiente con tapa. <Fuente href={F.saludDesinfeccion} />
        </li>
        <li>Ejemplo: 4 gotas para 2 litros, 10 gotas para 5 litros, 20 gotas para 10 litros (es multiplicar).</li>
        <li>
          Usa cloro doméstico sin aroma, sin detergente ni aditivos; revisa que la etiqueta diga hipoclorito de sodio y la concentración (6 %).{" "}
          <Fuente href={F.cdcAguaSegura} />
        </li>
        <li>
          El cloro mata la mayoría de virus y bacterias, pero no funciona tan bien como hervir contra algunos parásitos,
          entre ellos Giardia. <Fuente href={F.cdcAgua} />
        </li>
      </ul>
      <Aviso tono="alerta">
        <p>
          <strong>Si el agua sigue turbia después de filtrarla, no uses cloro: usa garrafón o hierve.</strong> Esta guía no da una dosis de cloro para
          agua turbia ni para cloros de otra concentración porque no encontramos una indicación oficial mexicana.
        </p>
      </Aviso>

      <h2 id="no-resuelven">Lo que hervir y el cloro NO resuelven</h2>
      <ul>
        <li>
          <strong>El plomo:</strong> hervir no lo quita. <Fuente href={F.epaPlomo} /> <Fuente href={F.cdcPlomoAgua} />
        </li>
        <li>
          <strong>Los químicos y toxinas en general:</strong> la CDC dice que el agua contaminada con químicos dañinos o
          toxinas no se puede hacer segura hirviéndola, desinfectándola ni filtrándola. <Fuente href={F.cdcAguaSegura} />
        </li>
        <li>
          <strong>Las toxinas de algas (microcistinas):</strong> hervir no las quita y puede aumentar su concentración.{" "}
          <Fuente href={F.epaAlgas} />
        </li>
        <li>
          Si el agua huele a químicos o combustible, o hay bebés, embarazadas o personas con defensas bajas en casa, usa
          agua embotellada o purificada y consulta a tu médico. <Fuente href={F.cdcAgua} />{" "}
          <Fuente href={F.cdcFormula} />
        </li>
      </ul>

      <h2 id="filtros">Filtros: qué sí y qué no</h2>
      <ul>
        <li>
          Contra parásitos como Giardia: la CDC recomienda un filtro con tamaño de poro absoluto de 1 micra o menos, o
          certificado NSF 53 o 58 para «quistes». <Fuente href={F.cdcGiardiaPrev} /> Esos filtros no quitan bacterias ni
          virus; después hay que desinfectar el agua filtrada.
        </li>
        <li>
          Contra plomo: busca un filtro certificado bajo la norma NSF/ANSI 53 para reducción de plomo.{" "}
          <Fuente href={F.cdcPlomoAgua} /> La CDC indica que la microfiltración y la luz ultravioleta no quitan plomo ni
          químicos, mientras que la ósmosis inversa y la destilación sí quitan plomo. <Fuente href={F.cdcTratamientoCasero} />
        </li>
        <li>
          Una tela, papel de cocina o filtro de café solo sirve para quitar partículas visibles antes de hervir o clorar.{" "}
          <Fuente href={F.cdcAgua} />
        </li>
        <li>
          Consejo de prudencia nuestro: un filtro sin la certificación escrita en la etiqueta no debe considerarse seguro
          contra plomo o parásitos.
        </li>
      </ul>

      <h2 id="bebes">Bebés y fórmula</h2>
      <ul>
        <li>
          Si crees que el agua de la llave no es segura, usa agua embotellada para preparar la fórmula en polvo hasta que las
          autoridades digan que el agua de la llave es segura. <Fuente href={F.cdcFormula} />
        </li>
        <li>
          Para bebés menores de 2 meses, nacidos antes de tiempo o con defensas bajas, la CDC indica además hervir el agua y
          esperar unos 5 minutos antes de mezclarla con fórmula en polvo, porque el polvo no es estéril. Pregunta a tu pediatra
          cómo hacerlo con tu bebé. <Fuente href={F.cdcFormula} />
        </li>
        <li>
          Si el problema es un químico (por ejemplo plomo), hervir, desinfectar o filtrar no sirve: usa agua embotellada o
          fórmula lista para tomar. <Fuente href={F.cdcFormula} />
        </li>
        <li>
          Los bebés que toman fórmula pueden recibir entre 40 % y 60 % de su exposición al plomo del agua. La EPA recomienda
          agua fría para preparar fórmula. <Fuente href={F.epaPlomo} />
        </li>
        <li>Consulta a tu pediatra sobre cuál agua usar y cómo preparar el biberón.</li>
        <li>
          La Secretaría de Salud recomienda la lactancia materna durante los primeros 6 meses para prevenir enfermedades
          diarreicas. <Fuente href={F.saludEdasPrevencion} />
        </li>
      </ul>

      <h2 id="tinacos">Tinacos, cisternas y recipientes</h2>
      <ul>
        <li>
          Lava y tapa los recipientes donde guardas agua; la Secretaría de Salud indica lavarlos y tallarlos con agua, jabón
          y cloro. <Fuente href={F.saludDesinfeccion} />
        </li>
        <li>
          Salud Jalisco recomienda limpiar tinacos, cisternas y aljibes al menos cada seis meses y mantenerlos
          tapados<SegunMedios />. <Fuente href={F.nmasRecomendaciones} />
        </li>
        <li>
          Contexto: el 7 de octubre de 2026 se reportó que el gobierno de Jalisco aplicará tandeos rotativos de dos a tres
          días por colonia<SegunMedios />. Guardar agua exige más cuidado con la limpieza de los recipientes.{" "}
          <Fuente href={F.procesoCrisis} />
        </li>
      </ul>

      <h2 id="salud">Salud: señales de alarma y cuándo acudir</h2>
      <ul>
        <li>
          Diarrea es evacuar 3 o más veces al día heces sueltas o líquidas (o más de lo normal para esa persona).{" "}
          <Fuente href={F.omsDiarrea} />
        </li>
        <li>
          En niñas y niños, lleva de inmediato a la unidad de salud si hay una o más de estas señales: mucha sed, vomita
          todo, no quiere comer ni beber, más de tres evacuaciones en una hora, diarrea con sangre o fiebre por más de tres
          días. <Fuente href={F.censiaEdas} />
        </li>
        <li>
          En cualquier edad, la OMS indica consultar a un servicio de salud cuando la diarrea persiste, hay sangre en las
          heces o hay signos de deshidratación. <Fuente href={F.omsDiarrea} />
        </li>
        <li>
          Para evitar la deshidratación se usa suero oral. En México se llama «Vida Suero Oral», se obtiene gratis en
          unidades de salud o en farmacias y, una vez preparado, dura 24 horas. <Fuente href={F.censiaEdas} />
        </li>
        <li>
          Salud Jalisco pide acudir a su centro de salud ante diarrea, vómito, fiebre, irritación en la piel o
          conjuntivitis<SegunMedios />. <Fuente href={F.nmasRecomendaciones} />
        </li>
        <li>
          Evita automedicarte. Con sed intensa, irritabilidad, fiebre, debilidad, boca seca y problemas para beber se
          necesita atención médica. <Fuente href={F.saludEdasPrevencion} />
        </li>
        <li>
          En una emergencia (persona inconsciente, convulsiones, no responde), llama al <Tel numero="9-1-1" marcar="911" />.{" "}
          <Fuente href={F.nueveUnoUno} />
        </li>
      </ul>

      <h2 id="giardia">Giardia</h2>
      <ul>
        <li>
          Es un parásito microscópico que se puede contraer al tomar agua contaminada. Síntomas más comunes: diarrea,
          gases, heces grasosas y de mal olor, cólicos o dolor de estómago; también puede haber náuseas y deshidratación.{" "}
          <Fuente href={F.cdcGiardia} />
        </li>
        <li>
          Suele aparecer de 1 a 2 semanas después del contagio y puede durar de 2 a 6 semanas. Hay más riesgo en niños y en
          personas con las defensas bajas. Si sospechas Giardia, consulta a un profesional de salud.{" "}
          <Fuente href={F.cdcGiardia} />
        </li>
        <li>
          Lo que sabemos en Guadalajara: la norma mexicana pide ausencia de Giardia lamblia, y solo debe
          determinarse cuando el agua viene de fuente superficial o con influencia de agua superficial{" "}
          <Fuente href={F.nom127}>NOM-127</Fuente>; investigadores de la UdeG reportaron su «posible
          presencia», <strong>no una confirmación</strong><SegunMedios />. <Fuente href={F.laSillaRotaUdeG} />
        </li>
      </ul>

      <h2 id="plomo">Plomo</h2>
      <ul>
        <li>
          El plomo es un metal que puede llegar al agua desde tuberías, soldaduras o conexiones. No se ve, no huele y no
          sabe a nada. <Fuente href={F.omsPlomo} /> <Fuente href={F.epaPlomo} />
        </li>
        <li>
          No existe un nivel de plomo que se sepa que sea inocuo. Puede afectar de forma permanente el desarrollo del
          cerebro de niñas y niños. <Fuente href={F.omsPlomo} />
        </li>
        <li>
          En el embarazo, el plomo guardado en los huesos puede pasar a la sangre y llegar al bebé. <Fuente href={F.omsPlomo} />
        </li>
        <li>
          Lo mejor es usar agua embotellada o purificada. Si no hay otra opción, toma agua fría de la llave (la caliente
          puede traer más plomo) y trátala primero como se explica arriba: hiérvela o desinféctala para los gérmenes.{" "}
          <Fuente href={F.cdcPlomoAgua} /> Ojo: hervir o clorar <strong>no quita el plomo</strong>, así que esto no sustituye
          el agua embotellada para bebés y embarazadas. Dejar correr el agua antes de usarla ayuda a reducir el plomo, pero
          tampoco la sustituye. <Fuente href={F.epaPlomo} />
        </li>
        <li>
          La única forma de saber si hubo exposición es una prueba de plomo en sangre. Habla con tu médico sobre si conviene
          hacerla, sobre todo en niñas, niños y embarazadas. <Fuente href={F.cdcPlomo} />
        </li>
        <li>
          La norma mexicana fija 0.01 mg/L como límite de plomo en el agua. <Fuente href={F.nom127}>NOM-127</Fuente> El IMDEC
          (organización civil) reportó plomo y ausencia de cloro residual en algunas muestras<SegunMedios />;{" "}
          <Fuente href={F.procesoCrisis} /> en marzo de 2026 autoridades de Jalisco dijeron que un análisis de 270 muestras no
          encontró bacterias coliformes ni metales pesados peligrosos<SegunMedios />. <Fuente href={F.adn40Muestras} />{" "}
          Ambas posturas existen y no coinciden: no sabemos con certeza cuánto plomo hay en cada colonia.
        </li>
      </ul>

      <h2 id="riesgo">Quién tiene más riesgo</h2>
      <ul>
        <li>Bebés y niñas y niños pequeños: más riesgo con plomo y con diarrea. <Fuente href={F.omsPlomo} /></li>
        <li>Embarazadas: riesgo del plomo para el bebé en gestación. <Fuente href={F.omsPlomo} /></li>
        <li>
          Personas con defensas bajas: más riesgo de diarrea grave y de Giardia. <Fuente href={F.omsDiarrea} />{" "}
          <Fuente href={F.cdcGiardia} />
        </li>
        <li>
          Para estos grupos: usar agua embotellada o purificada y avisar al médico si hay síntomas.{" "}
          <Fuente href={F.cdcFormula} />
        </li>
      </ul>

      <h2 id="evidencia">Cómo documentar la evidencia</h2>
      <p>
        La CEDHJ no exige formalidad: la queja puede ser escrita o hablada. Incluye, de ser posible, una breve relación de
        los hechos con tiempo, modo y lugar, la dependencia involucrada y las pruebas que tengas a la mano.{" "}
        <Fuente href={F.leyCedhj}>Ley de la CEDHJ, arts. 51 y 56</Fuente>
      </p>
      <p>Lista práctica del proyecto (buenas prácticas, no un requisito legal):</p>
      <ol>
        <li>
          Fotos y videos del agua saliendo de la llave, con luz natural, en un vaso o botella transparente sobre fondo
          blanco. Incluye en la toma el reloj del teléfono o una hoja con fecha y hora.
        </li>
        <li>Anota fecha, hora, calle y colonia, y qué pasó ese día (color, olor, sedimentos, si hubo corte o tandeo).</li>
        <li>Guarda recibos de agua y de gastos extra (como garrafones), y el contrato si lo tienes.</li>
        <li>
          Si llamas a SIAPATEL u otra oficina, anota el número de folio, la fecha, la hora y el nombre de quien te atendió.
          Si no te dan folio, pídelo.
        </li>
        <li>Guarda capturas de pantalla de cualquier reporte en línea o mensaje enviado.</li>
        <li>
          Si quieres guardar una muestra: una botella limpia, llena, cerrada y etiquetada con fecha, hora y dirección. Sirve
          como registro, pero no sustituye un análisis de laboratorio con método de muestreo adecuado.
        </li>
        <li>
          Anota síntomas, quién los tuvo y cuándo empezaron. Si acudes a servicios de salud, pide que quede registrado en tu
          expediente.
        </li>
        <li>No publiques tu dirección exacta en redes sociales; en el mapa basta la colonia.</li>
      </ol>
      <p>
        <strong>No hagas:</strong> no tomes ni pruebes el agua «para comprobar» y no mezcles tu muestra con otras
        sustancias.
      </p>
      <p>
        Siguiente paso: <Link href="/denunciar">dónde reportar o denunciar</Link>.
      </p>

      <h2 id="contexto">Qué sabemos y qué no</h2>
      <Aviso tono="info">
        <p>
          <strong>Lo que dicen las autoridades.</strong> El gobierno de Jalisco mantiene que no hay alerta sanitaria y que las
          condiciones del agua no representan un riesgo grave a la salud<SegunMedios />. <Fuente href={F.procesoCrisis} /> Aun
          así, la recomendación de Salud Jalisco es no usar agua de la llave para beber ni preparar alimentos<SegunMedios />.{" "}
          <Fuente href={F.udgtvSalud} />
        </p>
        <p>
          <strong>Lo que dicen otros.</strong> Investigadores de la UdeG documentaron turbiedad de hasta 40 unidades, algas y
          posible presencia de microcistinas y Giardia<SegunMedios />. <Fuente href={F.laSillaRotaUdeG} /> El IMDEC reportó
          plomo y falta de cloro residual en algunas muestras<SegunMedios />. <Fuente href={F.procesoCrisis} />
        </p>
        <p>
          <strong>Lo que no sabemos.</strong> Qué hay exactamente en el agua de tu colonia. Las cifras de colonias afectadas
          varían según la fuente y el periodo; no tomes ninguna como definitiva.
        </p>
        <p>
          <strong>Con esa incertidumbre:</strong> usa agua embotellada o purificada para beber y cocinar, protege
          especialmente a bebés y embarazadas, y reporta.
        </p>
      </Aviso>
    </Pagina>
  );
}
