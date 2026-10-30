# OSZ Events — puesta en marcha

## 1. Proyecto nuevo en Supabase

En https://supabase.com/dashboard crea **New project**, nombre **OSZ Events**, organización propia y región cercana a tus usuarios. Guarda la contraseña de PostgreSQL en tu gestor de contraseñas. No se incluye en el frontend.

En **Connect**, copia Project URL y Publishable key (`sb_publishable_...`). También aparecen en Settings → Data API / API Keys. Copia `.env.example` como `.env.local` y completa ambos valores públicos. Reinicia Vite después de cambiar variables.

En **SQL Editor → New query**, ejecuta en orden los tres archivos de `supabase/migrations`. Son para un proyecto vacío, no para IT-Management ni para MySQL/PHP. La migración crea tablas, funciones, políticas y buckets. No importes los datos ni las credenciales del ZIP original.

## 2. Autenticación

Configura estos valores en el panel del proyecto alojado; `supabase/config.toml` configura el entorno CLI local, NO modifica por sí solo el proyecto alojado:

- Authentication → Providers / Email: registro habilitado, **Confirm email activado** y confirmación de cambio de correo activada.
- Contraseña mínima: **12 caracteres**. Activa protección contra contraseñas filtradas si tu plan la permite.
- MFA: TOTP habilitado. La base de datos exige `aal2` para administrar, revisar pagos y escanear.
- URL Configuration: Site URL será tu URL final de Cloudflare. Redirect URLs deben incluir exactamente `/auth/callback` y `/account?recovery=1` para esa URL y el origen de desarrollo que uses (`http://127.0.0.1:5173` o `http://localhost:5173`). Evita comodines amplios.
- Configura **SMTP propio** con dominio verificado para correo de confirmación, recuperación y reautenticación. El servicio de prueba de Supabase tiene restricciones y no es un servicio de correo de producción.
- Authentication → Attack Protection: activa Cloudflare Turnstile. La clave **secreta** de Turnstile va en Supabase; la clave pública en `VITE_TURNSTILE_SITE_KEY`. Añade los dominios correctos al widget. Configura límites de intentos/envíos en Supabase. No basta con mostrar el CAPTCHA en el navegador.
- Activa secure password change; la pantalla Mi cuenta permite solicitar el código de reautenticación por correo.

Los enlaces PKCE deben abrirse preferiblemente en el navegador que inició el registro o la recuperación. Una vez confirmado el correo, el usuario puede iniciar sesión normalmente. La aplicación no implementa un OTP por correo en cada inicio de sesión: verifica el correo en el alta y ofrece TOTP para sesiones, obligatorio para el personal.

## 3. Primer administrador

El registro de compradores es opcional. Para administrar, registra tu cuenta desde la app y verifica el correo. En SQL Editor, sustituye el correo siguiente por el tuyo y ejecuta:

```sql
insert into public.app_roles(user_id,role)
select id,'admin' from auth.users
where lower(email)=lower('TU_CORREO_VERIFICADO') and email_confirmed_at is not null
on conflict(user_id) do nothing;
```

Sal y vuelve a ingresar. En **Mi cuenta** configura tu autenticador y verifica un código. En **Organizar**, crea un evento, añade portada y tipos de entrada y publícalo. El precio se guarda en céntimos enteros PEN. Una entrada con importe final cero se confirma sin exigir voucher.

Los miembros del equipo deben registrarse y verificar su correo primero. Desde Equipo y cupones asigna por correo el rol de revisor o de puerta. Cada miembro debe verificar TOTP en su sesión. Solo el rol admin, asignado desde el entorno de confianza, puede dar permisos.

## 4. Cloudflare Pages

El frontend es estático, no requiere PHP, cPanel ni Workers para servir las páginas.

1. Repositorio: https://github.com/Edyckzon/events-osz, rama `main`. `.env.local` y credenciales quedan excluidos.
2. Cloudflare → Workers & Pages → Create → Pages → conecta el repositorio.
3. Build: `npm run build:ci`. Output: `dist`. Root: carpeta del proyecto. Variable `NODE_VERSION=24`. Este comando impide publicar si fallan las pruebas unitarias, de base de datos o la compilación.
4. Define las tres variables públicas `VITE_*` de `.env.example` en el entorno de producción de Pages y vuelve a desplegar.
5. Ajusta Site URL, redirects de Supabase y dominios de Turnstile con la URL `https://...pages.dev` o tu dominio final.
6. Comprueba HTTPS, `/auth/callback`, recargar `/tickets` directamente y las cabeceras de seguridad. `public/_redirects` y `public/_headers` se copian al build.

Puedes desplegar también `dist` mediante Direct Upload después del build. Las variables Vite se incorporan DURANTE la compilación; añadirlas después sin recompilar no cambia el JS publicado. Nunca uses `service_role`, `sb_secret_...`, tokens de correo, Telegram o contraseñas como `VITE_*`.

## 5. Avisos de entradas y Telegram (opcional, separado de Auth)

El sistema siempre muestra el estado y QR en **Mis entradas**, aunque los avisos por correo no estén configurados. Los correos de Supabase Auth son independientes del worker de avisos.

Despliega la función `supabase/functions/notify` con Supabase CLI:

```sh
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy notify --no-verify-jwt
```

En **Edge Functions → Secrets** configura:

- `NOTIFY_SECRET`: valor aleatorio nuevo de al menos 32 caracteres; solo para tu scheduler.
- `SITE_URL`: URL HTTPS de la aplicación, sin barra final.
- `MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `MAIL_FROM=notificaciones@onesecurezone.com`: credenciales nuevas de Mailjet y dominio/remitente verificados.
- Opcional: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, nuevos y privados.

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` se proporcionan al runtime de Edge Functions, nunca al frontend. La función utiliza `x-notify-secret` como autenticación propia; no publiques el endpoint sin ese secreto. No acepta destinatarios ni contenido desde la petición.

Configura un scheduler para POST cada minuto a `https://PROJECT_REF.supabase.co/functions/v1/notify` con la cabecera `x-notify-secret`. Guarda el secreto en el almacén del scheduler; no en archivos públicos. Puedes usar Supabase Cron + Vault/pg_net o un scheduler de tu infraestructura. No quedó programado automáticamente.

La cola toma hasta 10 tareas, con lease de 5 minutos y máximo 10 intentos. Mailjet y Telegram pueden duplicar un aviso si el proveedor lo recibe pero falla la confirmación local. La aprobación solo sucede en la app con MFA. Telegram no recibe DNI, comprobantes ni QR. Revisa en SQL Editor las tareas con `attempts >= 10 and delivered_at is null`; resuelve la causa antes de reiniciar intentos. Si no configuras Telegram se marca ese canal como omitido.

## 6. Antes de abrir ventas

Completa razón social/RUC, canal de atención, reglas de reembolso y plazos de conservación en Condiciones y Privacidad. Prueba con dos cuentas de prueba, un administrador y un usuario de puerta: verificación de correo, recuperación, MFA, reserva, voucher, aprobación/rechazo, QR doble, aforo, cupón y acceso denegado a datos ajenos. Prueba cámara desde HTTPS en el dispositivo real. No uses pagos reales para la primera prueba.

Configura backups PostgreSQL y Storage y prueba una restauración. El frontend no descarga ni genera dumps de la base de datos. Los archivos antiguos del PHP permanecen intactos. Define una tarea operacional para retirar subidas huérfanas y aplicar tu política de conservación; no se eliminan comprobantes automáticamente.

## Fuentes de configuración

- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/auth/auth-mfa
- https://supabase.com/docs/guides/auth/auth-captcha
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/

La actualización de compra como invitado y los pasos de Mailjet/Telegram están en [INTEGRACIONES.md](INTEGRACIONES.md). Si instalaste el SQL combinado original, aplica ACTUALIZAR_INVITADOS.sql, sin repetir la instalación base.
