import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, ShieldCheck, Mail, KeyRound } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { AuthRequired, Form, Notice, PageTitle } from "./components";
import { useApp } from "./context";
import { db, demo, message, rpc } from "./lib";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}
export function Captcha({
  onToken,
  nonce,
}: {
  onToken: (token: string) => void;
  nonce: number;
}) {
  const ref = useRef<HTMLDivElement>(null),
    cb = useRef(onToken);
  cb.current = onToken;
  useEffect(() => {
    const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    if (!sitekey) return;
    let id: string | undefined,
      disposed = false;
    const render = () => {
      if (!disposed && window.turnstile && ref.current)
        id = window.turnstile.render(ref.current, {
          sitekey,
          theme: "light",
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(""),
        });
    };
    if (window.turnstile) render();
    else {
      let script = document.getElementById(
        "turnstile-script",
      ) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement("script");
        script.id = "turnstile-script";
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("load", render, { once: true });
    }
    return () => {
      disposed = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [nonce]);
  return <div ref={ref} />;
}
export function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login"),
    [note, setNote] = useState(""),
    [captcha, setCaptcha] = useState(""),
    [nonce, setNonce] = useState(0),
    navigate = useNavigate(),
    { session } = useApp();
  return (
    <div className="auth-page">
      <div className="auth-art">
        <span className="eyebrow">OSZ / MEMBERS</span>
        <h1>
          Tu próximo
          <br />
          <em>
            “tenías que
            <br />
            estar ahí”.
          </em>
        </h1>
        <p>Una cuenta. Todos tus momentos.</p>
        <img src="/art/afterglow.svg" alt="" />
      </div>
      <div className="auth-content">
        <span className="eyebrow">
          <ShieldCheck size={16} /> ACCESO A TU CUENTA
        </span>
        <h2>
          {mode === "signup"
            ? "Empieza algo memorable."
            : mode === "reset"
              ? "Recupera tu acceso."
              : "Qué bueno verte."}
        </h2>
        <p>
          {mode === "signup"
            ? "Te enviaremos un enlace para verificar tu correo."
            : "Tus entradas y próximos planes, en un solo lugar."}
        </p>
        {demo && (
          <Notice>
            Esta vista previa no envía correos. Primero conecta Supabase.
          </Notice>
        )}
        {note && <Notice>{note}</Notice>}
        {session && !session.user.is_anonymous && (
          <Notice>
            Ya tienes una sesión activa.{" "}
            <Link to="/account">Ir a mi cuenta</Link>
          </Notice>
        )}
        <Form
          onSubmit={async (f) => {
            if (import.meta.env.VITE_TURNSTILE_SITE_KEY && !captcha)
              throw new Error("Completa la verificación de seguridad.");
            const email = String(f.get("email")).trim(),
              password = String(f.get("password") || "");
            setNote("");
            try {
              if (mode === "signup") {
                if (password.length < 12)
                  throw new Error("Usa al menos 12 caracteres.");
                const { error } = await db().auth.signUp({
                  email,
                  password,
                  options: {
                    emailRedirectTo: `${location.origin}/auth/callback`,
                    captchaToken: captcha || undefined,
                  },
                });
                if (error) throw error;
                setNote(
                  "Si el correo puede registrarse, recibirás un enlace de verificación. Revisa también la carpeta de spam.",
                );
              }
              if (mode === "login") {
                const { error } = await db().auth.signInWithPassword({
                  email,
                  password,
                  options: { captchaToken: captcha || undefined },
                });
                if (error)
                  throw new Error(
                    "No pudimos iniciar sesión. Revisa tus datos y confirma tu correo.",
                  );
                navigate("/account");
              }
              if (mode === "reset") {
                const { error } = await db().auth.resetPasswordForEmail(email, {
                  redirectTo: `${location.origin}/account?recovery=1`,
                  captchaToken: captcha || undefined,
                });
                if (error) throw error;
                setNote(
                  "Si existe una cuenta para ese correo, recibirás un enlace de recuperación.",
                );
              }
            } finally {
              setCaptcha("");
              setNonce((n) => n + 1);
            }
          }}
        >
          <label>
            Correo electrónico
            <input
              name="email"
              type="email"
              autoComplete="email"
              placeholder="tu@correo.com"
              required
              maxLength={254}
            />
          </label>
          {mode !== "reset" && (
            <label>
              Contraseña
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                minLength={mode === "signup" ? 12 : undefined}
                required
              />
              {mode === "signup" && (
                <small>
                  Al menos 12 caracteres. Puedes usar un gestor de contraseñas.
                </small>
              )}
            </label>
          )}
          {mode === "signup" && (
            <label className="checkbox">
              <input type="checkbox" required />
              <span>
                Acepto las <Link to="/terms">condiciones</Link> y el{" "}
                <Link to="/privacy">aviso de privacidad</Link>.
              </span>
            </label>
          )}
          <Captcha nonce={nonce} onToken={setCaptcha} />
          <button type="submit" className="button" disabled={demo}>
            {mode === "login"
              ? "Ingresar"
              : mode === "signup"
                ? "Crear cuenta"
                : "Enviar enlace"}
            <ArrowUpRight size={18} />
          </button>
        </Form>
        <div className="auth-switch">
          {mode === "login" ? (
            <>
              <button
                onClick={() => {
                  setMode("signup");
                  setNote("");
                }}
              >
                Crear una cuenta
              </button>
              <button
                onClick={() => {
                  setMode("reset");
                  setNote("");
                }}
              >
                Olvidé mi contraseña
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setMode("login");
                setNote("");
              }}
            >
              Volver al inicio de sesión
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
export function Callback() {
  const { session, ready } = useApp(),
    [params] = useSearchParams();
  return (
    <div className="page narrow">
      <PageTitle
        eyebrow="VERIFICACIÓN"
        title={session ? "Correo confirmado." : "Validando tu enlace…"}
      />
      {params.get("error_description") ? (
        <Notice kind="error">
          El enlace no es válido o venció. Solicita otro enlace desde el acceso.
        </Notice>
      ) : session ? (
        <>
          <Notice>Ya puedes reservar tus próximas experiencias.</Notice>
          <Link to="/account" className="button">
            Ir a mi cuenta
          </Link>
        </>
      ) : (
        <Notice>
          {ready
            ? "Si abriste el enlace en otro navegador, vuelve al navegador donde te registraste o inicia sesión con tu correo ya verificado."
            : "Esperando confirmación…"}
        </Notice>
      )}
      <Link to="/auth" className="back">
        Ir al acceso
      </Link>
    </div>
  );
}
export function Account() {
  return (
    <AuthRequired>
      <AccountDetail />
    </AuthRequired>
  );
}
function AccountDetail() {
  const { session, aal2, staff } = useApp(),
    [factor, setFactor] = useState(""),
    [uri, setUri] = useState(""),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    db()
      .auth.mfa.listFactors()
      .then(({ data, error }) => {
        if (error) setError(error.message);
        setFactor(data?.totp.find((f) => f.status === "verified")?.id || "");
      });
  }, [session]);
  return (
    <div className="page narrow">
      <PageTitle eyebrow="TU ESPACIO" title="Mi cuenta." />
      <div className="account-row">
        <Mail />
        <div>
          <strong>{session!.user.email}</strong>
          <p>Correo verificado</p>
        </div>
        <span className="status approved">Verificado</span>
      </div>
      {note && <Notice>{note}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}
      <section className="panel">
        <ShieldCheck size={28} />
        <h2>Una capa más de seguridad.</h2>
        <p>
          Usa una app de autenticación para generar códigos de seis dígitos. Es
          obligatorio para el personal del evento.
        </p>
        {aal2 ? (
          <Notice>Segundo factor verificado para esta sesión.</Notice>
        ) : (
          <>
            {!factor ? (
              <button
                className="button"
                onClick={async () => {
                  try {
                    const { data, error } = await db().auth.mfa.enroll({
                      factorType: "totp",
                      friendlyName: `OSZ-${new Date().toISOString()}`,
                    });
                    if (error) throw error;
                    setFactor(data.id);
                    setUri(data.totp.uri);
                  } catch (e) {
                    setError(message(e));
                  }
                }}
              >
                Configurar autenticador
              </button>
            ) : null}
            {uri && (
              <div className="qr">
                <QRCodeSVG value={uri} size={190} />
                <p>Escanea este código con tu autenticador. No lo compartas.</p>
              </div>
            )}
            {factor && (
              <Form
                onSubmit={async (f) => {
                  const { error } = await db().auth.mfa.challengeAndVerify({
                    factorId: factor,
                    code: String(f.get("code")),
                  });
                  if (error) throw error;
                  setUri("");
                  setNote("Segundo factor activado y verificado.");
                  await db().auth.refreshSession();
                }}
              >
                <label>
                  Código de tu autenticador
                  <input
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                  />
                </label>
                <button className="button">Verificar código</button>
              </Form>
            )}
          </>
        )}
        {staff && aal2 && (
          <Link className="button" to="/manage">
            Ir a organización <ArrowUpRight size={18} />
          </Link>
        )}
      </section>
      <section className="panel">
        <KeyRound />
        <h2>Vincular compras anteriores</h2>
        <p>
          Recupera las compras de invitado enviadas a este mismo correo
          verificado.
        </p>
        <button
          className="button ghost"
          onClick={async () => {
            try {
              const count = await rpc<number>("claim_my_guest_orders");
              setNote(`${count} entradas vinculadas a tu cuenta.`);
            } catch (e) {
              setError(message(e));
            }
          }}
        >
          Vincular mis entradas
        </button>
        <h2>Actualizar contraseña</h2>
        <p>
          Si tu sesión es antigua, solicita un código por correo antes de
          guardar.
        </p>
        <button
          className="button ghost small"
          onClick={async () => {
            const { error } = await db().auth.reauthenticate();
            if (error) setError(error.message);
            else
              setNote("Revisa tu correo para obtener el código de seguridad.");
          }}
        >
          Solicitar código de seguridad
        </button>
        <Form
          onSubmit={async (f) => {
            const password = String(f.get("password"));
            if (password !== f.get("repeat"))
              throw new Error("Las contraseñas no coinciden.");
            const { error } = await db().auth.updateUser({
              password,
              ...(f.get("nonce") ? { nonce: String(f.get("nonce")) } : {}),
            });
            if (error) throw error;
            setNote("Contraseña actualizada.");
          }}
        >
          <label>
            Nueva contraseña
            <input
              type="password"
              name="password"
              minLength={12}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Repetir contraseña
            <input
              type="password"
              name="repeat"
              minLength={12}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Código de seguridad (si se solicitó)
            <input name="nonce" autoComplete="one-time-code" />
          </label>
          <button className="button ghost">Guardar contraseña</button>
        </Form>
      </section>
    </div>
  );
}
