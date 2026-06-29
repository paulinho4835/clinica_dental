import type { Metadata } from "next";
import { LEGAL_LAST_UPDATED } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Política de Privacidad",
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 text-lg font-semibold text-slate-800">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-slate-600">{children}</p>;
}
function LI({ children }: { children: React.ReactNode }) {
  return <li className="text-sm leading-relaxed text-slate-600">{children}</li>;
}

export default function PrivacidadPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Política de Privacidad</h1>
      <p className="mt-2 text-xs text-slate-400">
        Última actualización: {LEGAL_LAST_UPDATED}
      </p>

      <P>
        Esta Política explica cómo la Plataforma trata la información de las
        clínicas usuarias y de sus pacientes. La clínica es la responsable de los
        datos de sus pacientes; la Plataforma los procesa por cuenta de la clínica
        para prestar el servicio.
      </P>

      <H2>1. Datos que tratamos</H2>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        <LI>
          <strong>De los usuarios de la clínica:</strong> nombre, correo, rol y
          actividad dentro del sistema.
        </LI>
        <LI>
          <strong>De los pacientes:</strong> datos de identificación y contacto,
          historia clínica, citas, tratamientos, cobros y, si la clínica lo
          activa, fotografías clínicas.
        </LI>
        <LI>
          <strong>Técnicos:</strong> registros de acceso y uso necesarios para la
          seguridad y el funcionamiento del servicio.
        </LI>
      </ul>

      <H2>2. Finalidad</H2>
      <P>
        Los datos se utilizan únicamente para prestar y mantener el servicio de
        gestión de la clínica: agendar, atender y dar seguimiento a pacientes,
        registrar cobros, enviar recordatorios y confirmaciones cuando la clínica
        lo habilita, y garantizar la seguridad de la cuenta.
      </P>

      <H2>3. Aislamiento entre clínicas</H2>
      <P>
        Cada clínica accede exclusivamente a su propia información. La Plataforma
        aplica controles de aislamiento por clínica para impedir que una clínica
        vea o modifique datos de otra.
      </P>

      <H2>4. Encargados y almacenamiento</H2>
      <P>
        Para operar, la Plataforma se apoya en proveedores de infraestructura
        (alojamiento de la base de datos, almacenamiento de archivos y envío de
        mensajes) que actúan como encargados y tratan los datos siguiendo
        instrucciones de la Plataforma y medidas de seguridad adecuadas. Las
        fotografías clínicas, cuando se activan, se almacenan en un servicio de
        almacenamiento de objetos con acceso restringido.
      </P>

      <H2>5. Conservación</H2>
      <P>
        Los datos se conservan mientras la clínica mantenga su cuenta activa y
        según las obligaciones legales de conservación de información clínica
        aplicables. Tras la baja, la información puede conservarse por el tiempo
        que exija la ley y luego eliminarse o anonimizarse.
      </P>

      <H2>6. Seguridad</H2>
      <P>
        Aplicamos medidas técnicas y organizativas razonables: control de acceso
        por rol, cifrado en tránsito, limitación de intentos de acceso y
        respaldos periódicos. Ningún sistema es completamente infalible, por lo
        que no podemos garantizar una seguridad absoluta.
      </P>

      <H2>7. Derechos de los pacientes</H2>
      <P>
        Los pacientes pueden ejercer sus derechos de acceso, rectificación y
        eliminación de sus datos ante la clínica que los atiende, que es la
        responsable del tratamiento. La Plataforma colabora con la clínica para
        atender esas solicitudes.
      </P>

      <H2>8. Cambios</H2>
      <P>
        Podemos actualizar esta Política. Los cambios relevantes se comunicarán a
        través de la Plataforma.
      </P>

      <H2>9. Contacto</H2>
      <P>
        Para consultas sobre privacidad, la clínica puede comunicarse con el
        soporte de la Plataforma a través de los canales habilitados.
      </P>
    </div>
  );
}
