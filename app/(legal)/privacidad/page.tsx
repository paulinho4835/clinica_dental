import type { Metadata } from "next";
import {
  LEGAL_LAST_UPDATED,
  PLATFORM_NAME,
  OPERATOR_NAME,
  CONTACT_EMAIL,
} from "@/lib/legal";

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
        Esta Política explica cómo {PLATFORM_NAME}, operada por {OPERATOR_NAME}{" "}
        (en adelante, &ldquo;la Plataforma&rdquo;), trata la información de las
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

      <H2>3. Cookies y sesión</H2>
      <P>
        La Plataforma utiliza únicamente cookies esenciales para mantener tu
        sesión iniciada y proteger la cuenta. No usamos cookies de publicidad ni
        de seguimiento con fines comerciales. Si cierras sesión o las eliminas
        desde tu navegador, deberás volver a iniciar sesión.
      </P>

      <H2>4. No comercializamos los datos</H2>
      <P>
        No vendemos, alquilamos ni cedemos los datos de las clínicas ni de sus
        pacientes a terceros con fines comerciales o publicitarios. Los datos solo
        se comparten con los proveedores estrictamente necesarios para operar el
        servicio (ver sección siguiente) o cuando lo exija la ley.
      </P>

      <H2>5. Encargados y almacenamiento</H2>
      <P>
        Para operar, la Plataforma se apoya en proveedores de infraestructura
        (alojamiento de la base de datos, almacenamiento de archivos y envío de
        mensajes) que actúan como encargados y tratan los datos siguiendo
        instrucciones de la Plataforma y medidas de seguridad adecuadas. Las
        fotografías clínicas, cuando se activan, se almacenan en un servicio de
        almacenamiento de objetos con acceso restringido.
      </P>

      <H2>6. Conservación</H2>
      <P>
        Los datos se conservan mientras la clínica mantenga su cuenta activa y
        según las obligaciones legales de conservación de información clínica
        aplicables. Tras la baja, la información puede conservarse por el tiempo
        que exija la ley y luego eliminarse o anonimizarse.
      </P>

      <H2>7. Seguridad</H2>
      <P>
        Protegemos tu información con medidas técnicas y organizativas acordes a su
        sensibilidad: control de acceso por rol, cifrado en tránsito, aislamiento
        de los datos de cada clínica (cada una accede únicamente a su propia
        información), limitación de intentos de acceso y respaldos periódicos.
        Revisamos y mejoramos de forma continua estas medidas para mantener tu
        información protegida.
      </P>

      <H2>8. Derechos de los pacientes</H2>
      <P>
        Los pacientes pueden ejercer sus derechos de acceso, rectificación y
        eliminación de sus datos ante la clínica que los atiende, que es la
        responsable del tratamiento. La Plataforma colabora con la clínica para
        atender esas solicitudes.
      </P>

      <H2>9. Cambios</H2>
      <P>
        Podemos actualizar esta Política. Los cambios relevantes se comunicarán a
        través de la Plataforma.
      </P>

      <H2>10. Uso de datos de Google (Google Calendar)</H2>
      <P>
        La Plataforma ofrece de forma opcional la sincronización de citas con
        Google Calendar. Si un odontólogo conecta su cuenta de Google, la
        Plataforma solicita acceso limitado a la creación, actualización y
        eliminación de eventos en su calendario (scope <code>calendar.events</code>),
        únicamente para reflejar en su Google Calendar las citas que él mismo
        atiende dentro del sistema. La Plataforma no lee, comparte ni utiliza
        esta información para ningún otro fin, y el odontólogo puede
        desconectar su cuenta de Google en cualquier momento desde Ajustes,
        lo que elimina de inmediato los tokens de acceso almacenados. El uso y
        la transferencia de la información recibida de las APIs de Google se
        ajustan a la{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-clinic hover:underline"
        >
          Política de Datos de Usuario de los Servicios de API de Google
        </a>
        , incluidos los requisitos de Uso Limitado (Limited Use).
      </P>

      <H2>11. Contacto</H2>
      <P>
        Para consultas sobre privacidad, puedes comunicarte con {OPERATOR_NAME} al
        correo{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="font-medium text-clinic hover:underline"
        >
          {CONTACT_EMAIL}
        </a>
        .
      </P>
    </div>
  );
}
