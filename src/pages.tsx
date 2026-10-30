import { Captcha } from "./auth";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  MapPin,
  Ticket,
  Search,
  ShieldCheck,
  Minus,
  Plus,
  Check,
  Download,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  AuthRequired,
  Empty,
  EventCard,
  Form,
  Notice,
  PageTitle,
} from "./components";
import { useApp } from "./context";
import {
  attendeeSchema,
  date,
  db,
  demo,
  download,
  message,
  money,
  normalizeReceipt,
  rpc,
  statusLabel,
} from "./lib";
import type { Order } from "./lib";

export function Home() {
  const { events, error } = useApp(),
    [category, setCategory] = useState("Todos"),
    [query, setQuery] = useState(""),
    [faq, setFaq] = useState<number | null>(null);
  const published = events.filter((e) => e.status === "published"),
    hero = published[0];
  const filtered = published.filter(
    (e) =>
      (category === "Todos" || e.category === category) &&
      `${e.title} ${e.city} ${e.venue}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const faqs = [
    [
      "¿Cómo recibo mi entrada?",
      "Elige tu evento y compra como invitado o con tu cuenta. Después de que el organizador apruebe tu comprobante, recibirás por correo un enlace privado a tu entrada con QR. También podrás consultarla en Mis entradas con una cuenta verificada.",
    ],
    [
      "¿El pago se confirma al instante?",
      "Los pagos por Yape o Plin se revisan manualmente. Conserva tu comprobante. Puedes ver el estado en Mis entradas; la lectura de un voucher no sustituye la verificación del dinero recibido.",
    ],
    [
      "¿Puedo compartir mi código QR?",
      "Tu entrada es personal. El primer ingreso válido utiliza el código; los siguientes intentos se rechazan. Lleva tu documento de identidad.",
    ],
  ];
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="live-dot" /> EXPERIENCIAS QUE SE QUEDAN CONTIGO
          </span>
          <h1>
            Hay noches.
            <br />Y hay <em>historias.</em>
          </h1>
          <p>
            Descubre tu próximo plan. Encuentra a tu gente.
            <br className="desktop" /> El resto, vívelo.
          </p>
          <a href="#discover" className="button">
            Encuentra tu evento <ArrowUpRight size={20} />
          </a>
          <div className="hero-note">
            <span className="mini-orbit" />
            <span>
              Música, cultura y momentos irrepetibles.
              <br />
              <strong>Todo empieza con una entrada.</strong>
            </span>
          </div>
        </div>
        <div className="hero-visual">
          <img
            src={hero?.cover_url || "/art/afterglow.svg"}
            alt="Composición artística de luces y ondas para un evento nocturno"
          />
          <div className="hero-visual-top">
            <span className="tag">LA SELECCIÓN OSZ</span>
            <span>VOL. 01 / 2026</span>
          </div>
          <div className="hero-visual-bottom">
            <span className="eyebrow">
              {hero
                ? `${hero.city} / ${date(hero.starts_at)}`
                : "DESCUBRE LO QUE VIENE"}
            </span>
            <h2>{hero?.title || "PRÓXIMAMENTE"}</h2>
            {hero && (
              <Link
                to={`/events/${hero.slug}`}
                className="round-link"
                aria-label={`Ver ${hero.title}`}
              >
                <ArrowUpRight />
              </Link>
            )}
          </div>
          <div className="vertical-caption">
            THE NIGHT IS YOURS — OSZ EVENTS
          </div>
        </div>
      </section>
      <div className="marquee" aria-hidden="true">
        <span>ENCUENTRA TU RITMO</span>
        <span>✳</span>
        <span>VIVE EL MOMENTO</span>
        <span>✳</span>
        <span>HAZLO MEMORABLE</span>
        <span>✳</span>
      </div>
      <section className="section" id="discover">
        <PageTitle
          eyebrow="TU PRÓXIMO RECUERDO"
          title="Vale la pena estar ahí."
        >
          <span className="subtle">Planes diferentes. La misma emoción.</span>
        </PageTitle>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="discovery-toolbar">
          <div className="filters">
            {["Todos", ...new Set(published.map((e) => e.category))].map(
              (c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={category === c ? "chip active" : "chip"}
                  aria-pressed={category === c}
                >
                  {c}
                </button>
              ),
            )}
          </div>
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Buscar evento o ciudad"
              placeholder="Evento, ciudad o lugar"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="event-grid">
          {filtered.map((e, i) => (
            <EventCard key={e.id} event={e} index={i} />
          ))}
        </div>
        {!filtered.length && (
          <Empty title="Todavía no hay eventos aquí">
            <p>
              Prueba otra búsqueda o vuelve pronto para conocer las próximas
              fechas.
            </p>
            <button
              className="button ghost"
              onClick={() => {
                setQuery("");
                setCategory("Todos");
              }}
            >
              Limpiar filtros
            </button>
          </Empty>
        )}
      </section>
      <section className="how-section">
        <div>
          <span className="eyebrow">MENOS VUELTAS. MÁS MOMENTOS.</span>
          <h2>
            Tu única tarea:
            <br />
            <em>pasarla bien.</em>
          </h2>
          <p>
            De elegir el plan a cruzar la puerta,
            <br />
            tu entrada siempre contigo.
          </p>
        </div>
        <div className="steps">
          {[
            [
              "01",
              "Encuentra tu plan",
              "Explora eventos y elige la experiencia que va contigo.",
            ],
            [
              "02",
              "Reserva tu lugar",
              "Confirma tus datos, realiza tu pago y envía el comprobante.",
            ],
            [
              "03",
              "Presenta tu QR",
              "Con tu pago aprobado, tu entrada está lista en tu cuenta.",
            ],
          ].map(([n, t, p]) => (
            <div className="step" key={n}>
              <span>{n}</span>
              <div>
                <h3>{t}</h3>
                <p>{p}</p>
              </div>
              <ArrowUpRight size={20} />
            </div>
          ))}
        </div>
      </section>
      <section className="section faq">
        <div>
          <span className="eyebrow">ANTES DE SALIR</span>
          <h2>
            Todo claro.
            <br />
            Todo listo.
          </h2>
        </div>
        <div>
          {faqs.map(([q, a], i) => (
            <div className="faq-item" key={q}>
              <button
                onClick={() => setFaq(faq === i ? null : i)}
                aria-expanded={faq === i}
              >
                {q}
                {faq === i ? <Minus size={18} /> : <Plus size={18} />}
              </button>
              {faq === i && <p>{a}</p>}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export function EventPage() {
  const { slug } = useParams(),
    { events, types } = useApp(),
    event = events.find((e) => e.slug === slug);
  if (!event)
    return (
      <div className="page">
        <Empty title="Evento no disponible">
          <Link to="/">Volver a descubrir</Link>
        </Empty>
      </div>
    );
  const entries = types.filter((t) => t.event_id === event.id && t.active);
  return (
    <div className="page">
      <Link className="back" to="/">
        ← Todos los eventos
      </Link>
      <div className="detail-grid">
        <div>
          <div className="detail-art">
            <img src={event.cover_url || "/art/afterglow.svg"} alt="" />
            <span className="tag">{event.category}</span>
            <h1>{event.title}</h1>
          </div>
          <div className="detail-text">
            <span className="eyebrow">ACERCA DE LA EXPERIENCIA</span>
            <h2>Estás a una entrada de vivirlo.</h2>
            <p className="preline">{event.description}</p>
            <div className="detail-facts">
              <p>
                <CalendarDays /> {date(event.starts_at)}
              </p>
              <p>
                <MapPin /> {event.venue}, {event.city}
              </p>
              <p>
                <ShieldCheck /> Desde {event.min_age} años · Presenta tu DNI
              </p>
            </div>
          </div>
        </div>
        <aside className="purchase-panel">
          <span className="eyebrow">HAZ QUE SUCEDA</span>
          <h2>Tu lugar está aquí.</h2>
          <p>
            Elige tu entrada. El precio mostrado es el total antes de aplicar
            cupones.
          </p>
          {entries.map((t) => (
            <div className="ticket-option" key={t.id}>
              <div>
                <strong>{t.name}</strong>
                <span>{money(t.price_cents)}</span>
              </div>
              <Link className="button" to={`/checkout/${event.id}/${t.id}`}>
                Reservar entrada <ArrowRight size={17} />
              </Link>
            </div>
          ))}
          {!entries.length && (
            <Notice>Las entradas aún no están disponibles.</Notice>
          )}
          <div className="fineprint">
            <ShieldCheck size={18} />
            <span>
              Tu compra vive en tu cuenta. Recibes el QR después de la revisión
              del pago.
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function Checkout() {
  return <CheckoutForm />;
}
function CheckoutForm() {
  const { eventId, typeId } = useParams(),
    { events, types, session } = useApp(),
    [captcha, setCaptcha] = useState(""),
    [nonce, setNonce] = useState(0),
    navigate = useNavigate(),
    [key] = useState(() => crypto.randomUUID());
  const event = events.find((e) => e.id === eventId),
    type = types.find((t) => t.id === typeId && t.event_id === eventId);
  if (!event || !type)
    return (
      <div className="page">
        <Notice kind="error">Entrada no disponible.</Notice>
      </div>
    );
  return (
    <div className="page narrow">
      <PageTitle eyebrow="01 / RESERVA" title="Una gran noche empieza aquí." />
      <Notice>
        Compra sin registrarte. Te enviaremos tu entrada por correo al aprobar
        el pago. Dispondrás de 30 minutos para adjuntar tu comprobante. El cupón
        y la disponibilidad se verifican al reservar.
      </Notice>
      <Form
        onSubmit={async (f) => {
          const parsed = attendeeSchema.safeParse({
            name: f.get("name"),
            dni: f.get("dni"),
            birth: f.get("birth"),
          });
          if (!parsed.success) throw new Error(parsed.error.issues[0].message);
          if (demo)
            throw new Error(
              "Las compras no están habilitadas en esta vista previa.",
            );
          if (!session) {
            if (import.meta.env.VITE_TURNSTILE_SITE_KEY && !captcha)
              throw new Error("Completa la verificación de seguridad.");
            const { error } = await db().auth.signInAnonymously({
              options: { captchaToken: captcha || undefined },
            });
            setCaptcha("");
            setNonce((n) => n + 1);
            if (error) throw error;
          }
          const email = String(
            f.get("email") || session?.user.email || "",
          ).trim();
          if (
            email !==
            String(f.get("email_confirm") || session?.user.email || "").trim()
          )
            throw new Error("Los correos no coinciden.");
          const id = await rpc<string>("reserve_ticket", {
            p_email: email,
            p_event: event.id,
            p_type: type.id,
            p_name: parsed.data.name,
            p_dni: parsed.data.dni,
            p_birth: parsed.data.birth,
            p_coupon: String(f.get("coupon") || ""),
            p_key: key,
            p_terms: f.get("terms") === "on",
          });
          navigate(`/orders/${id}`);
        }}
      >
        <div className="summary-line">
          <strong>
            {event.title} · {type.name}
          </strong>
          <span>{money(type.price_cents)}</span>
        </div>
        {(!session || session.user.is_anonymous) && (
          <>
            <label>
              Correo donde recibirás tu entrada
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
              />
            </label>
            <label>
              Repite tu correo
              <input
                name="email_confirm"
                type="email"
                maxLength={254}
                required
              />
            </label>
            <p>
              Puedes comprar como invitado.{" "}
              <Link to="/auth">Ingresar o crear una cuenta</Link> es opcional.
            </p>
          </>
        )}
        <label>
          Nombre completo del asistente
          <input
            name="name"
            autoComplete="name"
            required
            minLength={3}
            maxLength={120}
          />
        </label>
        <div className="form-row">
          <label>
            DNI
            <input
              name="dni"
              inputMode="numeric"
              pattern="[0-9]{8}"
              maxLength={8}
              required
            />
          </label>
          <label>
            Fecha de nacimiento
            <input
              type="date"
              name="birth"
              required
              max={new Date().toISOString().slice(0, 10)}
            />
          </label>
        </div>
        <label>
          Cupón (opcional)
          <input
            name="coupon"
            maxLength={30}
            placeholder="Tu código promocional"
          />
        </label>
        <label className="checkbox">
          <input name="terms" type="checkbox" required />
          <span>
            Acepto las{" "}
            <Link to="/terms" target="_blank">
              condiciones de compra
            </Link>{" "}
            y he leído el{" "}
            <Link to="/privacy" target="_blank">
              aviso de privacidad
            </Link>
            .
          </span>
        </label>
        {!session && <Captcha nonce={nonce} onToken={setCaptcha} />}
        <button className="button" type="submit" disabled={demo}>
          Confirmar reserva <ArrowRight size={18} />
        </button>
      </Form>
    </div>
  );
}

export function Tickets() {
  return (
    <AuthRequired guest>
      <TicketsList />
    </AuthRequired>
  );
}
function TicketsList() {
  const { session, events } = useApp(),
    [orders, setOrders] = useState<Order[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    db()
      .from("orders")
      .select("*")
      .eq("user_id", session!.user.id)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setOrders(data);
        setLoading(false);
      });
  }, [session]);
  return (
    <div className="page">
      <PageTitle eyebrow="TU COLECCIÓN DE MOMENTOS" title="Mis entradas." />
      <Notice>
        Los pagos se revisan manualmente. Las entradas confirmadas incluyen tu
        QR personal.
      </Notice>
      {error && <Notice kind="error">{error}</Notice>}
      {loading ? (
        <p>Cargando tus entradas…</p>
      ) : orders.length ? (
        <div className="orders-list">
          {orders.map((o) => (
            <Link to={`/orders/${o.id}`} key={o.id} className="order-card">
              <Ticket size={28} />
              <div>
                <span className={`status ${o.status}`}>
                  {statusLabel[o.status]}
                </span>
                <h3>
                  {events.find((e) => e.id === o.event_id)?.title || "Evento"}
                </h3>
                <p>
                  {o.attendee_name} · {money(o.amount_cents)}
                </p>
              </div>
              <ArrowUpRight />
            </Link>
          ))}
        </div>
      ) : (
        <Empty title="Tu próxima historia está por empezar">
          <p>Aquí encontrarás tus reservas y entradas.</p>
          <Link className="button" to="/">
            Descubrir eventos
          </Link>
        </Empty>
      )}
    </div>
  );
}

export function OrderPage() {
  return (
    <AuthRequired guest>
      <OrderDetail />
    </AuthRequired>
  );
}
function OrderDetail() {
  const { id } = useParams(),
    { session, events } = useApp(),
    [order, setOrder] = useState<Order | null>(null),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [note, setNote] = useState("");
  async function load() {
    const { data, error } = await db()
      .from("orders")
      .select("*")
      .eq("id", id!)
      .eq("user_id", session!.user.id)
      .maybeSingle();
    if (error) setError(error.message);
    setOrder(data);
    setLoading(false);
    if (data && ["approved", "checked_in"].includes(data.status)) {
      const s = await db()
        .from("ticket_secrets")
        .select("token")
        .eq("order_id", id!)
        .maybeSingle();
      if (s.error) setError(s.error.message);
      setToken(s.data?.token || "");
    } else setToken("");
  }
  useEffect(() => {
    void load();
  }, [id, session]);
  if (loading)
    return (
      <div className="page">
        <Notice>Cargando entrada…</Notice>
      </div>
    );
  if (!order)
    return (
      <div className="page">
        <Notice kind="error">
          {error || "No encontramos esta entrada en tu cuenta."}
        </Notice>
      </div>
    );
  const event = events.find((e) => e.id === order.event_id),
    expired =
      order.status === "reserved" && new Date(order.expires_at) < new Date();
  return (
    <div className="page narrow">
      <Link className="back" to="/tickets">
        ← Mis entradas
      </Link>
      <PageTitle
        eyebrow="TU ENTRADA OSZ"
        title={event?.title || "Detalle de entrada"}
      />
      {error && <Notice kind="error">{error}</Notice>}
      {note && <Notice>{note}</Notice>}
      <div className="ticket-detail">
        <span className={`status ${order.status}`}>
          {expired ? "Reserva vencida" : statusLabel[order.status]}
        </span>
        <h2>{order.attendee_name}</h2>
        <p>
          {event && date(event.starts_at)}
          <br />
          {event?.venue}
        </p>
        <strong className="price">{money(order.amount_cents)}</strong>
        {token && (
          <div className="qr">
            <QRCodeSVG id="ticket-qr" value={token} size={220} level="M" />
            <p>Personal e intransferible. Presenta tu DNI.</p>
            <button
              className="button ghost"
              onClick={() => {
                const svg = document.getElementById("ticket-qr");
                if (svg)
                  download(
                    new Blob([new XMLSerializer().serializeToString(svg)], {
                      type: "image/svg+xml",
                    }),
                    `OSZ-${order.id.slice(0, 8)}.svg`,
                  );
              }}
            >
              <Download size={16} />
              Guardar QR
            </button>
          </div>
        )}
        {order.rejection_reason && (
          <Notice kind="error">Motivo: {order.rejection_reason}</Notice>
        )}
        {order.status === "pending" && !expired && (
          <Notice>
            Estamos revisando tu pago. Tu lugar se mantiene reservado hasta que
            el organizador lo apruebe o rechace. No vuelvas a pagar.
          </Notice>
        )}
        <button className="button ghost small" onClick={() => void load()}>
          Actualizar estado
        </button>
      </div>
      {order.status === "reserved" && !expired && (
        <>
          <div className="payment-instructions">
            <span className="eyebrow">02 / PAGO Y COMPROBANTE</span>
            <h2>Ya tienes tu reserva.</h2>
            <p>
              Realiza el pago por Yape o Plin a los datos indicados por el
              organizador. Comprueba el titular antes de pagar.
            </p>
            <dl>
              <dt>Titular</dt>
              <dd>{event?.payment_name}</dd>
              <dt>Número</dt>
              <dd>{event?.payment_number}</dd>
              <dt>Total exacto</dt>
              <dd>{money(order.amount_cents)}</dd>
              <dt>Adjunta antes de</dt>
              <dd>{date(order.expires_at)}</dd>
            </dl>
          </div>
          <Form
            onSubmit={async (f) => {
              const file = f.get("receipt") as File;
              if (!file?.size) throw new Error("Selecciona un comprobante.");
              const blob = await normalizeReceipt(file);
              const path = `${session!.user.id}/${order.id}/${crypto.randomUUID()}.jpg`;
              const upload = await db()
                .storage.from("receipts")
                .upload(path, blob, {
                  contentType: "image/jpeg",
                  upsert: false,
                });
              if (upload.error) throw upload.error;
              await rpc("submit_payment", {
                p_order: order.id,
                p_path: path,
                p_reference: String(f.get("reference")).trim(),
              });
              setNote("Comprobante recibido. El organizador revisará tu pago.");
              await load();
            }}
          >
            <label>
              Número de operación
              <input
                name="reference"
                required
                pattern="[A-Za-z0-9-]{4,40}"
                maxLength={40}
              />
            </label>
            <label>
              Comprobante (JPG, PNG o WebP, hasta 5 MB)
              <input
                type="file"
                name="receipt"
                accept="image/jpeg,image/png,image/webp"
                required
              />
            </label>
            <button className="button" type="submit">
              Enviar para revisión <Check size={18} />
            </button>
          </Form>
          <button
            className="button ghost"
            onClick={async () => {
              if (!confirm("¿Cancelar esta reserva sin comprobante?")) return;
              try {
                await rpc("cancel_reservation", { p_order: order.id });
                await load();
              } catch (e) {
                setError(message(e));
              }
            }}
          >
            Cancelar reserva
          </button>
        </>
      )}
      {expired && (
        <Notice>
          La reserva ya venció. Si realizaste el pago, contacta al organizador
          con tu número de operación.
        </Notice>
      )}
    </div>
  );
}

export function Legal({ privacy = false }: { privacy?: boolean }) {
  return (
    <div className="page narrow legal">
      <PageTitle
        eyebrow="OSZ EVENTS"
        title={privacy ? "Tu privacidad importa." : "Antes de vivirlo."}
      />
      <Notice>
        Documento base pendiente de completar con la razón social, RUC y canal
        de atención del organizador antes de abrir ventas.
      </Notice>
      {privacy ? (
        <>
          <h2>Datos que utilizamos</h2>
          <p>
            Correo para enviarte la entrada y, opcionalmente, crear tu cuenta;
            nombre, DNI y nacimiento para identificar al asistente y comprobar
            la edad mínima; comprobante y referencia para revisar el pago; fecha
            de ingreso para controlar el acceso.
          </p>
          <h2>Acceso y conservación</h2>
          <p>
            Los comprobantes son privados. El personal autorizado del evento
            accede a los datos necesarios para revisar pagos y controlar el
            ingreso. Supabase aloja la información y Cloudflare entrega la web.
            El organizador debe establecer plazos de conservación y un canal
            para ejercer tus derechos antes de publicar el servicio.
          </p>
          <h2>Tu cuenta</h2>
          <p>
            No compartas contraseñas ni códigos QR. Puedes gestionar tu
            contraseña y segundo factor desde Mi cuenta.
          </p>
        </>
      ) : (
        <>
          <h2>Reserva y validación</h2>
          <p>
            El precio se calcula en el servidor e incluye el descuento válido.
            Tienes 30 minutos para enviar el comprobante. El pago no se confirma
            automáticamente: el organizador revisará tu comprobante y conservará
            tu lugar durante la revisión. Si tu reserva vence antes de adjuntar
            un pago ya realizado, contacta al organizador antes de pagar
            nuevamente.
          </p>
          <h2>Ingreso</h2>
          <p>
            La entrada es nominativa, de un solo uso y válida para el evento
            seleccionado. Presenta tu documento de identidad y respeta la edad
            mínima. El acceso se habilita desde cuatro horas antes del inicio
            hasta el cierre del evento.
          </p>
          <h2>Cambios, cancelaciones y reembolsos</h2>
          <p>
            El organizador debe informar las condiciones de cancelación y los
            mecanismos de reembolso antes de vender. Esta versión no procesa
            devoluciones bancarias ni cambios de titular automáticamente.
          </p>
        </>
      )}
    </div>
  );
}
