import type { Metadata } from "next";
import {
  LEGAL_LAST_UPDATED,
  PLATFORM_NAME,
  OPERATOR_NAME,
  CONTACT_EMAIL,
  GOVERNING_LAW,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
};

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-8 text-lg font-semibold text-slate-800">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-sm leading-relaxed text-slate-600">{children}</p>;
}

export default function TerminosPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Términos y Condiciones de Uso</h1>
      <p className="mt-2 text-xs text-slate-400">
        Última actualización: {LEGAL_LAST_UPDATED}
      </p>

      <P>
        Estos Términos y Condiciones regulan el acceso y uso de {PLATFORM_NAME}{" "}
        (en adelante, &ldquo;la Plataforma&rdquo;), un sistema de gestión para
        clínicas dentales operado por {OPERATOR_NAME}. Al crear una cuenta,
        aceptar este aviso o utilizar la Plataforma, la clínica y sus usuarios
        aceptan quedar obligados por estos términos. Si no está de acuerdo, debe
        abstenerse de usar el servicio.
      </P>

      <H2>1. Objeto del servicio</H2>
      <P>
        La Plataforma ofrece herramientas para la gestión de una clínica dental:
        agenda de citas, fichas y registro clínico de pacientes, inventario,
        cobros y reportes, entre otros módulos que pueden activarse por clínica.
        El servicio se presta &ldquo;tal cual&rdquo; y puede evolucionar,
        incorporando o retirando funciones con previo aviso razonable.
      </P>

      <H2>2. Cuentas y responsabilidad del administrador</H2>
      <P>
        Cada clínica designa a un administrador responsable de su cuenta. El
        administrador es quien acepta estos términos en nombre de la clínica y es
        responsable de crear, gestionar y desactivar las cuentas de su personal,
        así como de mantener la confidencialidad de las credenciales. Toda
        actividad realizada bajo las cuentas de la clínica es responsabilidad de
        la clínica.
      </P>

      <H2>3. Datos de pacientes y rol de la clínica</H2>
      <P>
        La clínica es la responsable del tratamiento de los datos de sus
        pacientes y garantiza contar con la base legal y los consentimientos
        necesarios para registrarlos en la Plataforma. La Plataforma actúa como
        proveedor tecnológico que procesa esos datos por cuenta de la clínica,
        según se detalla en la{" "}
        <a href="/privacidad" className="font-medium text-clinic hover:underline">
          Política de Privacidad
        </a>
        .
      </P>

      <H2>4. Propiedad intelectual</H2>
      <P>
        El software, el diseño, la marca y todos los componentes de la Plataforma
        son propiedad de {OPERATOR_NAME} y están protegidos por la ley. El uso del
        servicio no transfiere ningún derecho sobre ellos. A su vez, los datos que
        la clínica carga &mdash;información de pacientes, citas, tratamientos,
        cobros y documentos&mdash; son y seguirán siendo propiedad de la clínica;
        la Plataforma solo los procesa para prestar el servicio y la clínica puede
        solicitar una copia o su eliminación al darse de baja.
      </P>

      <H2>5. Disponibilidad y respaldos</H2>
      <P>
        Trabajamos para mantener la Plataforma disponible de forma continua y
        realizamos respaldos periódicos de la información para protegerla. Como
        todo servicio en línea, pueden presentarse interrupciones ocasionales por
        mantenimiento o causas ajenas a nuestro control; en esos casos hacemos lo
        posible por restablecer el servicio a la brevedad. Para mayor tranquilidad,
        la clínica también puede conservar sus propias copias de la información que
        considere crítica.
      </P>

      <H2>6. Limitación de responsabilidad</H2>
      <P>
        En la medida permitida por la ley, la Plataforma no será responsable por
        daños indirectos, lucro cesante o pérdida de datos derivados del uso o la
        imposibilidad de uso del servicio. La Plataforma es una herramienta de
        apoyo a la gestión y no sustituye el criterio profesional del personal de
        salud.
      </P>

      <H2>7. Suspensión y baja</H2>
      <P>
        La clínica puede solicitar la baja de su cuenta en cualquier momento. La
        Plataforma puede suspender cuentas que incumplan estos términos o que
        comprometan la seguridad del servicio o de otras clínicas. Asimismo, si el
        plan o los módulos contratados no se mantienen al día en su pago, la
        Plataforma puede suspender o limitar el acceso tras un aviso previo,
        conservando la información de la clínica durante un plazo razonable para
        que pueda regularizar su situación o solicitar una copia de sus datos.
      </P>

      <H2>8. Ley aplicable y jurisdicción</H2>
      <P>
        Estos términos se rigen por las leyes de {GOVERNING_LAW}. Cualquier
        controversia que no pueda resolverse de común acuerdo se someterá a los
        tribunales competentes de {GOVERNING_LAW}.
      </P>

      <H2>9. Modificaciones</H2>
      <P>
        Podemos actualizar estos términos. Cuando los cambios sean sustanciales,
        se notificará y podrá solicitarse una nueva aceptación antes de continuar
        usando la Plataforma.
      </P>

      <H2>10. Contacto</H2>
      <P>
        Para consultas sobre estos términos, la clínica puede comunicarse con{" "}
        {OPERATOR_NAME} al correo{" "}
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
