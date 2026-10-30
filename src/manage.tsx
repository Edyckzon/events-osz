import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Camera,
  Check,
  Download,
  Plus,
  ScanLine,
  Ticket,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { AuthRequired, Empty, Form, Notice, PageTitle } from "./components";
import { useApp } from "./context";
import {
  date,
  db,
  download,
  message,
  money,
  normalizeReceipt,
  rpc,
  safeCsv,
  statusLabel,
} from "./lib";
import type { Event, Order } from "./lib";

export function Manage() {
  return (
    <AuthRequired staff>
      <Dashboard />
    </AuthRequired>
  );
}
function Dashboard() {
  const { events, admin, reload } = useApp(),
    [selected, setSelected] = useState(""),
    [orders, setOrders] = useState<Order[]>([]),
    [tab, setTab] = useState("payments"),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState("");
  const event = events.find((e) => e.id === selected);
  async function load() {
    if (!selected) return;
    const { data, error } = await db()
      .from("orders")
      .select("*")
      .eq("event_id", selected)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setOrders(data);
  }
  useEffect(() => {
    if (!selected && events.length) setSelected(events[0].id);
  }, [events, selected]);
  useEffect(() => {
    setOrders([]);
    void load();
  }, [selected]);
  async function review(id: string, approve: boolean) {
    if (busy) return;
    const reason = approve
      ? ""
      : prompt("Motivo del rechazo (mínimo 5 caracteres)");
    if (reason === null) return;
    if (
      approve &&
      !confirm(
        "¿Verificaste que el importe y la operación llegaron a la cuenta del organizador?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await rpc("review_payment", {
        p_order: id,
        p_approve: approve,
        p_reason: reason,
      });
      setNote(
        approve
          ? "Pago aprobado. La entrada ya está disponible en la cuenta del comprador."
          : "Pago rechazado.",
      );
      await load();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  const sold = orders.filter((o) =>
      ["approved", "checked_in"].includes(o.status),
    ),
    pending = orders.filter((o) => o.status === "pending"),
    rows = orders.filter(
      (o) =>
        (tab !== "payments" || o.status === "pending") &&
        `${o.attendee_name} ${o.dni} ${o.payment_reference}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  return (
    <div className="page">
      <PageTitle
        eyebrow="OSZ / ORGANIZACIÓN"
        title="Cada detalle, bajo control."
      >
        <Link className="button" to="/scan">
          <ScanLine size={18} />
          Control de acceso
        </Link>
      </PageTitle>
      <div className="manage-toolbar">
        <label>
          Evento
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Selecciona un evento</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} · {e.status}
              </option>
            ))}
          </select>
        </label>
        <button className="button ghost" onClick={() => void load()}>
          Actualizar
        </button>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {note && <Notice>{note}</Notice>}
      <div className="stats">
        <div>
          <Ticket />
          <span>Entradas aprobadas</span>
          <strong>{sold.length}</strong>
        </div>
        <div>
          <Wallet />
          <span>Importe aprobado</span>
          <strong>{money(sold.reduce((a, o) => a + o.amount_cents, 0))}</strong>
        </div>
        <div>
          <Users />
          <span>Ingresos</span>
          <strong>
            {orders.filter((o) => o.status === "checked_in").length}
          </strong>
        </div>
        <div>
          <Check />
          <span>Por revisar</span>
          <strong>{pending.length}</strong>
        </div>
      </div>
      <div className="filters tabs">
        {[
          ["payments", "Revisar pagos"],
          ["orders", "Entradas y asistentes"],
          ...(admin
            ? [
                ["settings", "Configurar evento"],
                ["new", "Nuevo evento"],
                ["team", "Equipo y cupones"],
                ["audit", "Auditoría"],
              ]
            : []),
        ].map(([id, label]) => (
          <button
            className={tab === id ? "chip active" : "chip"}
            key={id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {["payments", "orders"].includes(tab) && (
        <>
          <div className="manage-toolbar">
            <input
              aria-label="Buscar asistente"
              placeholder="Buscar por nombre, DNI u operación"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className="button ghost"
              onClick={() =>
                download(
                  new Blob(
                    [
                      safeCsv([
                        [
                          "Nombre",
                          "DNI",
                          "Estado",
                          "Importe PEN",
                          "Operación",
                          "Ingreso",
                        ],
                        ...rows.map((o) => [
                          o.attendee_name,
                          o.dni,
                          statusLabel[o.status],
                          (o.amount_cents / 100).toFixed(2),
                          o.payment_reference || "",
                          o.checked_in_at || "",
                        ]),
                      ]),
                    ],
                    { type: "text/csv;charset=utf-8" },
                  ),
                  "osz-asistentes.csv",
                )
              }
            >
              <Download size={16} />
              Exportar CSV
            </button>
          </div>
          {rows.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Asistente</th>
                    <th>Estado</th>
                    <th>Importe</th>
                    <th>Operación</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.attendee_name}</strong>
                        <small>DNI {o.dni}</small>
                      </td>
                      <td>
                        <span className={`status ${o.status}`}>
                          {statusLabel[o.status]}
                        </span>
                      </td>
                      <td>{money(o.amount_cents)}</td>
                      <td>{o.payment_reference || "—"}</td>
                      <td>
                        <div className="row-actions">
                          {o.receipt_path && (
                            <button
                              className="button ghost small"
                              onClick={async () => {
                                const { data, error } = await db()
                                  .storage.from("receipts")
                                  .createSignedUrl(o.receipt_path!, 60);
                                if (error) setError(error.message);
                                else
                                  window.open(
                                    data.signedUrl,
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                              }}
                            >
                              Comprobante
                            </button>
                          )}
                          {o.status === "pending" && (
                            <>
                              <button
                                className="icon-button accept"
                                aria-label={`Aprobar pago de ${o.attendee_name}`}
                                disabled={busy}
                                onClick={() => void review(o.id, true)}
                              >
                                <Check />
                              </button>
                              <button
                                className="icon-button reject"
                                aria-label={`Rechazar pago de ${o.attendee_name}`}
                                disabled={busy}
                                onClick={() => void review(o.id, false)}
                              >
                                <X />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Todo al día">
              <p>
                No hay registros para este filtro. El personal de puerta solo ve
                el resultado de cada escaneo.
              </p>
            </Empty>
          )}
        </>
      )}
      {admin && tab === "settings" && event && (
        <EventForm
          key={event.id}
          event={event}
          onSaved={async () => {
            await reload();
            setNote("Evento actualizado.");
          }}
        />
      )}
      {admin && tab === "new" && (
        <EventForm
          onSaved={async (id) => {
            await reload();
            if (id) setSelected(id);
            setNote(
              "Evento creado como borrador. Añade entradas y publica desde Configurar evento.",
            );
            setTab("settings");
          }}
        />
      )}
      {admin && tab === "team" && event && <Team event={event} />}{" "}
      {admin && tab === "audit" && <Audit />}
    </div>
  );
}
function EventForm({
  event,
  onSaved,
}: {
  event?: Event;
  onSaved: (id?: string) => Promise<void>;
}) {
  const { types, reload } = useApp(),
    [note, setNote] = useState("");
  const local = (d: string) => {
    const date = new Date(d);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };
  return (
    <div className="narrow-left">
      <Form
        onSubmit={async (f) => {
          const starts = new Date(String(f.get("starts"))).toISOString(),
            ends = new Date(String(f.get("ends"))).toISOString();
          if (ends <= starts)
            throw new Error("El cierre debe ser posterior al inicio.");
          if (event) {
            await rpc("update_event", {
              p_id: event.id,
              p_title: f.get("title"),
              p_description: f.get("description"),
              p_venue: f.get("venue"),
              p_city: f.get("city"),
              p_starts: starts,
              p_ends: ends,
              p_capacity: Number(f.get("capacity")),
              p_status: f.get("status"),
              p_payment_name: f.get("payment_name"),
              p_payment_number: f.get("payment_number"),
            });
          } else {
            const { data, error } = await db()
              .from("events")
              .insert({
                title: f.get("title"),
                slug: f.get("slug"),
                description: f.get("description"),
                venue: f.get("venue"),
                city: f.get("city"),
                category: f.get("category"),
                starts_at: starts,
                ends_at: ends,
                capacity: Number(f.get("capacity")),
                min_age: Number(f.get("age")),
                payment_name: f.get("payment_name"),
                payment_number: f.get("payment_number"),
                status: "draft",
              })
              .select("id")
              .single();
            if (error) throw error;
            await onSaved(data.id);
            return;
          }
          await onSaved();
        }}
      >
        <h2>{event ? "Información del evento" : "Crea tu próximo evento"}</h2>
        <label>
          Nombre
          <input
            name="title"
            defaultValue={event?.title}
            required
            minLength={3}
            maxLength={120}
          />
        </label>
        {!event && (
          <>
            <label>
              Dirección corta (slug)
              <input
                name="slug"
                pattern="[a-z0-9-]{3,80}"
                placeholder="noche-osz"
                required
              />
            </label>
            <label>
              Categoría
              <input name="category" defaultValue="Música" required />
            </label>
            <label>
              Edad mínima
              <input
                name="age"
                type="number"
                min={0}
                max={100}
                defaultValue={18}
                required
              />
            </label>
          </>
        )}
        <label>
          Descripción
          <textarea
            name="description"
            rows={4}
            defaultValue={event?.description}
            required
          />
        </label>
        <div className="form-row">
          <label>
            Lugar
            <input name="venue" defaultValue={event?.venue} required />
          </label>
          <label>
            Ciudad
            <input name="city" defaultValue={event?.city || "Lima"} required />
          </label>
        </div>
        <div className="form-row">
          <label>
            Inicio (hora de este equipo)
            <input
              type="datetime-local"
              name="starts"
              defaultValue={event ? local(event.starts_at) : ""}
              required
            />
          </label>
          <label>
            Fin (hora de este equipo)
            <input
              type="datetime-local"
              name="ends"
              defaultValue={event ? local(event.ends_at) : ""}
              required
            />
          </label>
        </div>
        <label>
          Aforo total
          <input
            name="capacity"
            type="number"
            min={1}
            defaultValue={event?.capacity || 100}
            required
          />
        </label>
        <div className="form-row">
          <label>
            Titular Yape / Plin
            <input
              name="payment_name"
              defaultValue={event?.payment_name}
              required
            />
          </label>
          <label>
            Número para pago
            <input
              name="payment_number"
              defaultValue={event?.payment_number}
              required
            />
          </label>
        </div>
        {event && (
          <label>
            Publicación
            <select name="status" defaultValue={event.status}>
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
              <option value="closed">Cerrado</option>
            </select>
          </label>
        )}
        <button className="button" type="submit">
          {event ? "Guardar cambios" : "Crear borrador"}
        </button>
      </Form>
      {event && <CoverUpload event={event} />}
      {event && (
        <section className="panel">
          <h2>Tipos de entrada</h2>
          {types
            .filter((t) => t.event_id === event.id)
            .map((t) => (
              <p key={t.id}>
                {t.name} · {money(t.price_cents)} · Cupo {t.quota}
              </p>
            ))}
          {note && <Notice>{note}</Notice>}
          <Form
            onSubmit={async (f) => {
              const { error } = await db()
                .from("ticket_types")
                .insert({
                  event_id: event.id,
                  name: f.get("name"),
                  price_cents: Math.round(Number(f.get("price")) * 100),
                  quota: Number(f.get("quota")),
                });
              if (error) throw error;
              setNote("Tipo de entrada añadido.");
              await reload();
            }}
          >
            <label>
              Nombre
              <input
                name="name"
                required
                placeholder="General / VIP / Preventa"
              />
            </label>
            <div className="form-row">
              <label>
                Precio S/
                <input
                  name="price"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                />
              </label>
              <label>
                Cupo
                <input name="quota" type="number" min={1} required />
              </label>
            </div>
            <button className="button ghost">
              <Plus size={16} />
              Añadir tipo de entrada
            </button>
          </Form>
        </section>
      )}
    </div>
  );
}
function Team({ event }: { event: Event }) {
  const [note, setNote] = useState("");
  return (
    <div className="two-panels">
      {note && <Notice>{note}</Notice>}
      <section className="panel">
        <h2>Personal por evento</h2>
        <p>
          La persona debe registrarse, verificar su correo y activar MFA. No se
          asigna el rol de administrador desde el navegador.
        </p>
        <Form
          onSubmit={async (f) => {
            await rpc("assign_staff", {
              p_event: event.id,
              p_email: f.get("email"),
              p_role: f.get("role"),
            });
            setNote("Permisos del evento actualizados.");
          }}
        >
          <label>
            Correo
            <input name="email" type="email" required />
          </label>
          <label>
            Permiso
            <select name="role">
              <option value="scanner">Solo control de ingreso</option>
              <option value="reviewer">
                Revisar pagos y controlar ingreso
              </option>
              <option value="remove">Revocar acceso al evento</option>
            </select>
          </label>
          <button className="button">Guardar permiso</button>
        </Form>
      </section>
      <section className="panel">
        <h2>Cupones de descuento</h2>
        <Form
          onSubmit={async (f) => {
            const { error } = await db()
              .from("coupons")
              .insert({
                event_id: event.id,
                code: String(f.get("code")).toUpperCase(),
                discount_cents: Math.round(Number(f.get("discount")) * 100),
                max_uses: Number(f.get("uses")),
                expires_at: new Date(String(f.get("expires"))).toISOString(),
              });
            if (error) throw error;
            setNote(
              "Cupón creado. Los cupos se reservan de forma atómica con la entrada.",
            );
          }}
        >
          <label>
            Código
            <input name="code" pattern="[A-Za-z0-9-]{3,30}" required />
          </label>
          <div className="form-row">
            <label>
              Descuento S/
              <input
                name="discount"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
            </label>
            <label>
              Máximo de usos
              <input name="uses" type="number" min={1} required />
            </label>
          </div>
          <label>
            Vencimiento
            <input name="expires" type="datetime-local" required />
          </label>
          <button className="button">Crear cupón</button>
        </Form>
      </section>
    </div>
  );
}
function Audit() {
  const [rows, setRows] = useState<
      {
        id: number;
        action: string;
        created_at: string;
        entity_id: string;
        actor_id: string;
      }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    db()
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setRows(data);
      });
  }, []);
  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}
      <p>
        Últimas 100 acciones. Los clientes no pueden modificar este historial.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Acción</th>
              <th>Fecha</th>
              <th>Actor</th>
              <th>Registro</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.action}</td>
                <td>{date(r.created_at)}</td>
                <td>{r.actor_id?.slice(0, 8)}</td>
                <td>{r.entity_id?.slice(0, 8)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Scanner() {
  return (
    <AuthRequired staff>
      <Scan />
    </AuthRequired>
  );
}
function Scan() {
  const { events } = useApp(),
    [selected, setSelected] = useState(""),
    [active, setActive] = useState(false),
    [cameraBusy, setCameraBusy] = useState(false),
    [result, setResult] = useState<{
      status: string;
      message: string;
      name?: string;
      dni_last4?: string;
    } | null>(null),
    [error, setError] = useState(""),
    lock = useRef(false),
    scanner = useRef<import("html5-qrcode").Html5Qrcode | null>(null),
    eventRef = useRef(selected);
  eventRef.current = selected;
  useEffect(
    () => () => {
      if (scanner.current?.isScanning)
        void scanner.current.stop().catch(() => {});
    },
    [],
  );
  async function scan(value: string) {
    if (lock.current) return;
    lock.current = true;
    setError("");
    setResult(null);
    try {
      const token = value.trim();
      if (!/^[0-9a-f]{64}$/.test(token))
        throw new Error("Este QR no tiene el formato de OSZ Events.");
      const res = await rpc<NonNullable<typeof result>>("check_in", {
        p_event: eventRef.current,
        p_token: token,
      });
      setResult(res);
    } catch (e) {
      setError(message(e));
    } finally {
      setTimeout(() => {
        lock.current = false;
      }, 2500);
    }
  }
  async function start() {
    if (cameraBusy) return;
    setCameraBusy(true);
    try {
      if (!selected) throw new Error("Selecciona primero el evento.");
      setError("");
      const { Html5Qrcode } = await import("html5-qrcode");
      const reader = new Html5Qrcode("qr-reader");
      scanner.current = reader;
      await reader.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 230, height: 230 } },
        (text) => void scan(text),
        () => {},
      );
      setActive(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setCameraBusy(false);
    }
  }
  return (
    <div className="page narrow">
      <PageTitle eyebrow="OSZ / PUERTA" title="Cada ingreso cuenta." />
      <label>
        Evento
        <select
          value={selected}
          disabled={active || cameraBusy}
          onChange={(e) => {
            setSelected(e.target.value);
            setResult(null);
            setError("");
          }}
        >
          <option value="">Seleccionar</option>
          {events.map((e) => (
            <option value={e.id} key={e.id}>
              {e.title}
            </option>
          ))}
        </select>
      </label>
      <p>
        El acceso se abre cuatro horas antes del inicio. Verifica también el
        documento del asistente.
      </p>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="scanner-box">
        <div id="qr-reader" />
        {!active && (
          <div className="scanner-placeholder">
            <ScanLine size={64} />
            <p>Activa la cámara y apunta al código QR.</p>
          </div>
        )}
      </div>
      <button
        className="button"
        disabled={!selected || cameraBusy}
        onClick={async () => {
          if (active) {
            setCameraBusy(true);
            try {
              await scanner.current?.stop();
              setActive(false);
            } catch (e) {
              setError(message(e));
            } finally {
              setCameraBusy(false);
            }
          } else await start();
        }}
      >
        <Camera size={18} />
        {active ? "Detener cámara" : "Activar cámara"}
      </button>
      {result && (
        <div className={`scan-result ${result.status}`} role="status">
          <h2>{result.message}</h2>
          <p>{result.name}</p>
          {result.dni_last4 && (
            <strong>DNI terminado en {result.dni_last4}</strong>
          )}
        </div>
      )}
      <details className="panel">
        <summary>Ingresar código manualmente</summary>
        <Form onSubmit={async (f) => scan(String(f.get("token")))}>
          <label>
            Contenido del QR
            <input name="token" required minLength={64} maxLength={64} />
          </label>
          <button className="button" disabled={!selected}>
            Validar entrada
          </button>
        </Form>
      </details>
    </div>
  );
}

function CoverUpload({ event }: { event: Event }) {
  const { reload } = useApp();
  const [note, setNote] = useState("");
  return (
    <section className="panel">
      <h2>Portada del evento</h2>
      {note && <Notice>{note}</Notice>}
      <Form
        onSubmit={async (f) => {
          const file = f.get("cover") as File;
          if (!file?.size) throw new Error("Selecciona una imagen.");
          const blob = await normalizeReceipt(file);
          const path = `${event.id}/${crypto.randomUUID()}.jpg`;
          const { error } = await db()
            .storage.from("event-images")
            .upload(path, blob, { contentType: "image/jpeg", upsert: false });
          if (error) throw error;
          await rpc("set_event_cover", { p_event: event.id, p_path: path });
          await reload();
          setNote("Portada actualizada.");
        }}
      >
        <label>
          Imagen (JPG, PNG o WebP, máximo 5 MB)
          <input
            type="file"
            name="cover"
            accept="image/jpeg,image/png,image/webp"
            required
          />
        </label>
        <button className="button ghost">Guardar portada</button>
      </Form>
    </section>
  );
}
