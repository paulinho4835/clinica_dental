import type { Metadata } from "next";
import { LEGAL_LAST_UPDATED } from "@/lib/legal";

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
        Estos Términos y Condiciones regulan el acceso y uso del sistema de
        gestión para clínicas dentales (en adelante, &ldquo;la Plataforma&rdquo;).
        Al crear una cuenta, aceptar este aviso o utilizar la Plataforma, la
        clínica y sus usuarios aceptan quedar obligados por estos términos. Si no
        está de acuerdo, debe abstenerse de usar el servicio.
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

      <H2>3. Uso aceptable</H2>
      <P>
        El usuario se compromete a utilizar la Plataforma conforme a la ley y a
        no: (a) acceder a datos de clínicas o pacientes ajenos; (b) intentar
        vulnerar la seguridad o el aislamiento entre clínicas; (c) usar el
        servicio para fines ilícitos; ni (d) cargar contenido que infrinja
        derechos de terceros. El incumplimiento puede dar lugar a la suspensión
        de la cuenta.
      </P>

      <H2>4. Datos de pacientes y rol de la clínica</H2>
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

      <H2>5. Disponibilidad y respaldos</H2>
      <P>
        Procuramos una alta disponibilidad del servicio y realizamos respaldos
        periódicos de la información, pero no garantizamos un funcionamiento
        ininterrumpido ni libre de errores. Se recomienda a la clínica conservar
        sus propios respaldos cuando la información sea crítica.
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
        comprometan la seguridad del servicio o de otras clínicas.
      </P>

      <H2>8. Modificaciones</H2>
      <P>
        Podemos actualizar estos términos. Cuando los cambios sean sustanciales,
        se notificará y podrá solicitarse una nueva aceptación antes de continuar
        usando la Plataforma.
      </P>

      <H2>9. Contacto</H2>
      <P>
        Para consultas sobre estos términos, la clínica puede comunicarse con el
        soporte de la Plataforma a través de los canales habilitados.
      </P>
    </div>
  );
}
