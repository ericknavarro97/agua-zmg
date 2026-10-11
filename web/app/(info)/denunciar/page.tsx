import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Fuente, Pagina, SegunMedios, Tel } from "@/components/Info";
import { F } from "@/components/fuentes";

export const metadata: Metadata = {
  title: "Dónde reportar o denunciar el agua turbia",
  description:
    "Canales verificados para reportar problemas con el agua en Guadalajara: SIAPA, CEDHJ, COFEPRIS y emergencias. Cómo documentar tu caso y qué derechos tienes.",
};

const INDICE = [
  { id: "emergencias", texto: "Emergencias" },
  { id: "siapa", texto: "SIAPA" },
  { id: "cedhj", texto: "CEDHJ (derechos humanos)" },
  { id: "cofepris", texto: "COFEPRIS" },
  { id: "descuento", texto: "Descuento en el recibo" },
  { id: "derechos", texto: "Tus derechos" },
  { id: "norma", texto: "Qué dice la norma" },
];

export default function Denunciar() {
  return (
    <Pagina
      etiqueta="Denunciar · Canales verificados"
      indice={INDICE}
      titulo="Dónde reportar o denunciar"
      resumen="Solo incluimos contactos que revisamos en el sitio oficial de cada institución el 8 de octubre de 2026. Pueden cambiar: confirma siempre en el enlace oficial."
    >

      <Aviso tono="info" titulo="Antes de llamar">
        <p>
          Guarda fotos, fechas y el número de folio de cada reporte. Aquí tienes{" "}
          <Link href="/que-hacer#evidencia">cómo documentar la evidencia</Link>. Y reporta también en{" "}
          <Link href="/">el mapa</Link>: ayuda a ver el tamaño del problema, aunque no sustituye una queja formal.
        </p>
      </Aviso>

      <h2 id="emergencias">Emergencias</h2>
      <p>
        <Tel numero="9-1-1" marcar="911" />: número único de emergencias médicas, de seguridad y protección civil, gratis,
        las 24 horas. <Fuente href={F.nueveUnoUno} />
      </p>

      <h2 id="siapa">SIAPA (quien da el servicio de agua)</h2>
      <ul>
        <li>
          SIAPATEL: <Tel numero="33 3668 2482" marcar="3336682482" />. <Fuente href={F.siapaQuejas} />
        </li>
        <li>
          Correo: <a href="mailto:siapatel@siapa.gob.mx">siapatel@siapa.gob.mx</a>. <Fuente href={F.siapaQuejas} />
        </li>
        <li>Cuando reportes, pide folio y guárdalo.</li>
      </ul>

      <h2 id="cedhj">CEDHJ: Comisión Estatal de Derechos Humanos Jalisco</h2>
      <p>
        La CEDHJ recibe quejas cuando una autoridad, por acción u omisión, afecta tus derechos humanos. <strong>No es la
        autoridad del agua ni hace análisis de laboratorio.</strong>
      </p>
      <ul>
        <li>
          Teléfono: <Tel numero="33 3669 1100" marcar="3336691100" />. Lada sin costo, extensiones 103 y 104. El sitio oficial
          escribe el número como «8000 201 8991»; marca <Tel numero="800 201 8991" marcar="8002018991" /> y confirma que
          conteste la CEDHJ. <Fuente href={F.cedhj} />
        </li>
        <li>
          En línea: formulario en{" "}
          <a href={F.cedhjQueja} target="_blank" rel="noopener noreferrer">
            cedhj.org.mx/queja<span className="sr-only"> (abre en otra pestaña)</span>
          </a>
          . Pide descripción de los hechos, autoridades señaladas, tus datos personales y domicilio.{" "}
          <Fuente href={F.cedhjQueja} />
        </li>
        <li>
          El procedimiento es breve, sencillo y gratuito. La queja puede ser escrita o hablada, sin formalidades. Hay
          personal de guardia las 24 horas y todos los días se consideran hábiles.{" "}
          <Fuente href={F.leyCedhj}>Ley de la CEDHJ, arts. 47, 51 y 52</Fuente>
        </li>
        <li>
          Plazo: un año desde que terminaron los hechos o desde que supiste de ellos (puede ampliarse en casos graves).{" "}
          <Fuente href={F.leyCedhj}>art. 53</Fuente>
        </li>
        <li>
          Puede presentarla cualquier persona que conozca de violaciones a derechos humanos o que haya sido víctima.{" "}
          <Fuente href={F.leyCedhj}>art. 50</Fuente>
        </li>
        <li>
          <strong>La ley no admite quejas anónimas.</strong> <Fuente href={F.leyCedhj}>art. 57</Fuente>
        </li>
        <li>
          Una queja ante la CEDHJ no afecta otros medios de defensa que tengas ni suspende sus plazos, así que conviene
          seguir con el SIAPA y los trámites normales. <Fuente href={F.leyCedhj}>art. 54</Fuente>
        </li>
        <li>
          Contexto: la CEDHJ informó haber recibido 151 quejas relacionadas con el SIAPA entre diciembre de 2024 y julio de
          2026<SegunMedios />. El decreto del descuento prevé que la CEDHJ entregue un listado de colonias con quejas
          <SegunMedios />. <Fuente href={F.aztecaDecreto} /> Eso no garantiza que tu queja individual genere un descuento.
        </li>
      </ul>

      <h2 id="cofepris">COFEPRIS</h2>
      <ul>
        <li>
          Denuncias sanitarias por sistema en línea y por teléfono: <Tel numero="800 033 50 50" marcar="8000335050" />.{" "}
          <Fuente href={F.cofeprisGuia} />
        </li>
        <li>
          <strong>Advertencia honesta:</strong> la propia guía de COFEPRIS dice que no tiene atribuciones para «fallas en el
          suministro de agua y/o alcantarillado» ni para servicios públicos que competen a ayuntamientos y estados. Llama
          como orientación, no como vía segura. <Fuente href={F.cofeprisGuia} />
        </li>
        <li>
          La NOM-127 dice que la vigilancia de la calidad del agua le toca a la Secretaría de Salud, por medio de COFEPRIS, y
          a los gobiernos de los estados. <Fuente href={F.nom127}>NOM-127</Fuente>
        </li>
      </ul>

      <h2 id="descuento">Descuento en el recibo del SIAPA</h2>
      <ul>
        <li>
          El Congreso de Jalisco aprobó un descuento del 80 % en recibos del SIAPA para usuarios afectados por mala calidad
          del agua en el Área Metropolitana de Guadalajara<SegunMedios />. <Fuente href={F.aztecaDecreto} />
        </li>
        <li>
          El SIAPA amplió la lista a 342 colonias; el descuento vale hasta el 15 de diciembre de 2026<SegunMedios />.{" "}
          <Fuente href={F.informadorDescuento} />
        </li>
        <li>
          Para saber si tu colonia está en la lista, consulta la página de alertas del SIAPA o llama a SIAPATEL.{" "}
          <Fuente href={F.siapaDescuentos}>página del SIAPA</Fuente>
        </li>
        <li>
          Los detalles (quién califica, si hay trámite para colonias fuera de la lista) cambian según el medio que los
          cuente: confírmalos con el SIAPA.
        </li>
        <li>
          El descuento no sustituye tu derecho a agua segura, y <strong>no significa que el agua sea segura para
          beber</strong>.
        </li>
      </ul>

      <h2 id="derechos">Tus derechos</h2>
      <p>
        Artículo 4 de la Constitución: «Toda persona tiene derecho al acceso, disposición y saneamiento de agua para consumo
        personal y doméstico en forma suficiente, salubre, aceptable y asequible.» <Fuente href={F.constitucion} />
      </p>
      <ul>
        <li><strong>Suficiente:</strong> que haya la cantidad que necesitas para tu casa.</li>
        <li><strong>Salubre:</strong> que no te enferme.</li>
        <li><strong>Aceptable:</strong> que se pueda usar, sin color, olor ni sabor que la hagan inaceptable.</li>
        <li><strong>Asequible:</strong> que puedas pagarla.</li>
      </ul>

      <h2 id="norma">Qué dice la norma de calidad del agua</h2>
      <p>
        La NOM-127-SSA1-2021 (publicada en el Diario Oficial el 2 de mayo de 2022) fija estos límites, entre otros:{" "}
        <Fuente href={F.nom127} />
      </p>
      <ul>
        <li>
          Turbiedad: 4.0 UNT, que baja a 3.0 UNT a partir del segundo año posterior a la entrada en vigor de la norma (la
          norma entra en vigor a los 360 días de su publicación).
        </li>
        <li>Plomo: 0.01 mg/L. Cloro residual libre: entre 0.2 y 1.5 mg/L.</li>
        <li>E. coli: menos de 1 UFC/100 mL (es decir, ausencia). Giardia lamblia: ausencia; solo debe determinarse cuando el agua viene de fuente superficial o con influencia de agua superficial.</li>
      </ul>
      <p>
        Estos números sirven para comparar. Una medición ciudadana, como las del mapa, no es una verificación oficial. Las
        mediciones que se publiquen deben decir quién las hizo y con qué método.
      </p>
    </Pagina>
  );
}
