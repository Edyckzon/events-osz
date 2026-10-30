import { useState } from "react";
import type { ReactNode, FormEvent } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Menu,
  X,
  Ticket,
  ShieldCheck,
  MapPin,
  CalendarDays,
  LogOut,
} from "lucide-react";
import { useApp } from "./context";
import { date, db, demo, money } from "./lib";
import type { Event } from "./lib";

export function IconArrow() {
  return <ArrowUpRight size={18} aria-hidden="true" />;
}
export function Layout({ children }: { children: ReactNode }) {
  const { session, staff } = useApp(),
    [open, setOpen] = useState(false);
  return (
    <>
      <a className="skip" href="#content">
        Saltar al contenido
      </a>
      <header className="header">
        <Link to="/" className="brand" aria-label="OSZ Events, inicio">
          <span className="brand-symbol">
            o<span>s</span>z
          </span>
          <span>EVENTS</span>
        </Link>
        <button
          className="icon-button mobile-menu"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X /> : <Menu />}
        </button>
        <nav
          className={open ? "nav open" : "nav"}
          onClick={() => setOpen(false)}
        >
          <NavLink to="/" end>
            Descubrir
          </NavLink>
          <NavLink to="/tickets">Mis entradas</NavLink>
          {staff && <NavLink to="/manage">Organizar</NavLink>}
          <NavLink to="/account">Mi cuenta</NavLink>
          {session && !session.user.is_anonymous ? (
            <button
              className="button small ghost"
              onClick={() => void db().auth.signOut()}
            >
              <LogOut size={16} />
              Salir
            </button>
          ) : (
            <Link className="button small" to="/auth">
              Ingresar <ArrowUpRight size={15} />
            </Link>
          )}
        </nav>
      </header>
      {demo && (
        <div className="demo-banner">
          Vista previa · Eventos de ejemplo. Las compras y el acceso se
          habilitan al conectar Supabase.
        </div>
      )}
      <main id="content">{children}</main>
      <footer>
        <Link to="/" className="brand">
          <span className="brand-symbol">osz</span> EVENTS
        </Link>
        <p>Lo mejor pasa cuando estás ahí.</p>
        <div>
          <Link to="/terms">Condiciones</Link>
          <Link to="/privacy">Privacidad</Link>
          <Link to="/account">Seguridad de cuenta</Link>
        </div>
        <span>© {new Date().getFullYear()} OSZ Events</span>
      </footer>
    </>
  );
}
export function Notice({
  children,
  kind = "info",
}: {
  children: ReactNode;
  kind?: string;
}) {
  return (
    <div
      className={`notice ${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Ticket size={36} />
      <h2>{title}</h2>
      {children}
    </div>
  );
}
export function PageTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
export function EventCard({
  event,
  index = 0,
}: {
  event: Event;
  index?: number;
}) {
  const { types } = useApp();
  const prices = types
    .filter((t) => t.event_id === event.id && t.active)
    .map((t) => t.price_cents);
  return (
    <Link to={`/events/${event.slug}`} className="event-card">
      <div className={`event-art art-${index % 3}`}>
        <img
          src={event.cover_url || "/art/afterglow.svg"}
          alt=""
          loading="lazy"
        />
        <span className="tag">{event.category}</span>
        <span className="card-arrow">
          <ArrowUpRight size={22} />
        </span>
      </div>
      <div className="event-info">
        <span className="meta">
          <CalendarDays size={14} />
          {date(event.starts_at)}
        </span>
        <h3>{event.title}</h3>
        <div className="card-bottom">
          <span>
            <MapPin size={14} />
            {event.city} · {event.venue}
          </span>
          <strong>
            {prices.length
              ? `Desde ${money(Math.min(...prices))}`
              : "Próximamente"}
          </strong>
        </div>
      </div>
    </Link>
  );
}
export function AuthRequired({
  children,
  staff = false,
  guest = false,
}: {
  children: ReactNode;
  staff?: boolean;
  guest?: boolean;
}) {
  const { session, ready, staff: hasRole, aal2 } = useApp();
  if (!ready)
    return (
      <div className="page">
        <Notice>Cargando sesión…</Notice>
      </div>
    );
  if (!session)
    return (
      <div className="page">
        <Empty title="Tu experiencia empieza con tu cuenta">
          <p>Ingresa con tu correo verificado para continuar.</p>
          <Link className="button" to="/auth">
            Ingresar <ArrowRight size={18} />
          </Link>
        </Empty>
      </div>
    );
  if (!session.user.email_confirmed_at && !(guest && session.user.is_anonymous))
    return (
      <div className="page">
        <Notice>
          Para guardar tus entradas en una cuenta,{" "}
          <Link to="/auth">regístrate o inicia sesión</Link> y verifica tu
          correo.
        </Notice>
      </div>
    );
  if (staff && !hasRole)
    return (
      <div className="page">
        <Notice kind="error">
          Tu cuenta no tiene permisos de organización.
        </Notice>
      </div>
    );
  if (staff && !aal2)
    return (
      <div className="page">
        <Empty title="Verifica tu segundo factor">
          <ShieldCheck />
          <p>
            La gestión del evento y el control de acceso requieren autenticación
            de dos pasos.
          </p>
          <Link className="button" to="/account">
            Verificar mi identidad
          </Link>
        </Empty>
      </div>
    );
  return children;
}
export function Form({
  onSubmit,
  children,
  className = "form",
}: {
  onSubmit: (form: FormData) => Promise<void>;
  children: ReactNode;
  className?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await onSubmit(f);
    } catch (err) {
      setError((err as Error).message || "No se pudo completar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className={className}>
      {error && <Notice kind="error">{error}</Notice>}
      <fieldset disabled={busy}>{children}</fieldset>
      {busy && <Notice>Procesando…</Notice>}
    </form>
  );
}
