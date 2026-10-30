import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Notice, PageTitle } from "./components";
import { date, money, rpc, statusLabel, message } from "./lib";
type TicketView = {
  id: string;
  name: string;
  status: string;
  amount_cents: number;
  reason: string | null;
  event_title: string;
  venue: string;
  starts_at: string;
  qr: string | null;
};
export function TicketLink() {
  const [ticket, setTicket] = useState<TicketView | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    const token = location.hash.slice(1);
    if (!/^[a-f0-9]{64}$/.test(token)) {
      setError("Enlace incompleto. Abre el enlace original de tu correo.");
      setLoading(false);
      return;
    }
    rpc<TicketView | null>("read_ticket_link", { p_token: token })
      .then((data) => {
        setTicket(data);
        if (!data) setError("El enlace no está disponible o venció.");
      })
      .catch((e) => setError(message(e)))
      .finally(() => setLoading(false));
  }, []);
  return (
    <div className="page narrow">
      <PageTitle
        eyebrow="OSZ / TU ENTRADA DIGITAL"
        title={ticket?.event_title || "Tu próxima experiencia."}
      />
      {loading && <Notice>Cargando entrada…</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      {ticket && (
        <section className="ticket-detail">
          <span className={`status ${ticket.status}`}>
            {statusLabel[ticket.status]}
          </span>
          <h2>{ticket.name}</h2>
          <p>
            {date(ticket.starts_at)}
            <br />
            {ticket.venue}
          </p>
          <strong>{money(ticket.amount_cents)}</strong>
          {ticket.qr && (
            <div className="qr">
              <QRCodeSVG value={ticket.qr} size={240} />
              <p>Presenta tu DNI. Este QR permite un único ingreso.</p>
            </div>
          )}
          {ticket.reason && <Notice kind="error">{ticket.reason}</Notice>}
          {ticket.status === "pending" && (
            <Notice>
              Tu comprobante está en revisión. Te enviaremos otro correo cuando
              se procese.
            </Notice>
          )}
          <button className="button" onClick={() => window.print()}>
            Guardar / imprimir entrada
          </button>
          <p>
            No compartas este enlace ni tu QR. Cualquier persona con el enlace
            puede ver la entrada.
          </p>
        </section>
      )}
      <p>
        ¿Quieres guardar tus entradas en una cuenta?{" "}
        <Link to="/auth">Regístrate opcionalmente</Link>, verifica el correo de
        compra y pulsa «Vincular mis entradas» en Mi cuenta.
      </p>
    </div>
  );
}
