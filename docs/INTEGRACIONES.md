# Compra como invitado, correo y Telegram

Actualización de negocio: no se exige registro ni contraseña para comprar. Supabase crea una sesión anónima interna para proteger la reserva y las subidas del comprador. Eso NO es una cuenta de cliente con email/password. El correo declarado recibe un enlace privado; no se comprueba la propiedad de ese correo antes del pago. Se pide repetirlo para evitar errores. Una cuenta con correo verificado puede vincular compras hechas a ese mismo correo.

## Aplicar la actualización

Si ya ejecutaste `INSTALAR_OSZ.sql`, ejecuta **solo** `ACTUALIZAR_INVITADOS.sql` en SQL Editor. Si no instalaste aún, ejecuta primero INSTALAR y luego ACTUALIZAR. Cada archivo se ejecuta una vez. Las migraciones CLI se aplican en orden 001, 002, 003.

En Supabase Authentication activa **Allow anonymous sign-ins**. Configura Turnstile en Supabase y su site key pública en el frontend. No basta con el CAPTCHA de la pantalla: el proveedor de Auth debe exigirlo. Configura límites de Auth y monitoriza altas anónimas/almacenamiento. El límite por sesión de reservas no reemplaza la protección contra bots distribuidos.

El enlace recibido tiene formato `/ticket#SECRETO_ALEATORIO`. Es de lectura y diferente del QR de puerta; no permite aprobar pagos, modificar reservas ni acceder al voucher. Funciona sin iniciar sesión y vence 30 días después del evento. Quien tenga el enlace puede ver la entrada, por eso no se comparte. El fragmento no se envía como URL HTTP al servidor. Los correos no llevan seguimiento de enlaces/aperturas.

## Mailjet: notificaciones@onesecurezone.com

1. Crea/inicia sesión en una cuenta propia de Mailjet. No reutilices credenciales del PHP.
2. En Senders & Domains añade **onesecurezone.com** y verifica la propiedad con los registros DNS que Mailjet indique.
3. Autentica SPF y DKIM con los valores exactos del panel. Si el dominio ya tiene SPF (por ejemplo cPanel/Microsoft 365), integra el include de Mailjet en el registro existente: no crees dos SPF ni reemplaces el proveedor actual. Revisa DMARC/alineación una vez autenticado. No cambies MX para enviar mediante Mailjet.
4. Autoriza el remitente **notificaciones@onesecurezone.com**. El servicio envía como OSZ Events. Para recibir respuestas debes tener buzón o alias en tu proveedor; Mailjet no crea ese buzón.
5. Crea API Key + Secret Key en Mailjet. En Supabase → Edge Functions → Secrets añade `MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `MAIL_FROM=notificaciones@onesecurezone.com`, `SITE_URL=https://TU_DOMINIO` y `NOTIFY_SECRET` aleatorio de al menos 32 caracteres.
6. Despliega `notify` y configura el scheduler como se indica en SETUP. Los avisos permanecen en la cola hasta tener un worker activo. Las claves son del backend: nunca variables VITE ni repositorios.

El worker envía HTML con identidad OSZ, estado del pago y botón «Ver mi entrada digital». No requiere cuenta para abrir el enlace. Mailjet permite conocer el resultado del envío, pero «aceptado por el proveedor» no garantiza entrega en bandeja de entrada. Hay que revisar rebotes/supresiones en Mailjet. Los reintentos son al menos una vez: si el proveedor acepta y se pierde la respuesta, puede haber un correo duplicado. CustomID correlaciona el envío, no garantiza idempotencia.

Para los correos de registro y recuperación, configura también SMTP de Mailjet en Supabase Authentication → SMTP usando host/puerto/credenciales indicados por Mailjet y el mismo remitente. Esto es independiente de los avisos de entradas. No quedó activado ni probado un envío real.

## Telegram

1. Abre **@BotFather** oficial en Telegram, envía `/newbot`, asigna nombre y usuario al bot y guarda su token.
2. Crea un grupo privado para el equipo, añade el bot y envía `/start` (o inicia el chat privado con el bot). No necesita ser administrador para enviar mensajes si el grupo se lo permite.
3. Obtén el chat ID con `scripts/telegram-chat-id.ps1`: pide el token de forma oculta y consulta getUpdates mostrando solo ID/título. Si no aparece un grupo, envía un comando dirigido al bot y vuelve a consultar. Un bot configurado con webhook no admite getUpdates hasta cambiar ese modo; el script no modifica webhooks.
4. Guarda `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` en los Secrets de Supabase. No pegues el token en el frontend.
5. Con `notify` desplegado y programado, cada comprobante genera un aviso al grupo con enlace a `/manage`. La revisión del pago se realiza con MFA en OSZ. No se mandan DNI, voucher ni QR al grupo.

Esta implementación NO aprueba/rechaza desde botones de Telegram. El PHP tenía ese flujo; aquí la autorización queda en el panel. Implementar aprobaciones desde Telegram requeriría vincular IDs autorizados, validar el webhook, proteger callbacks y auditar cada decisión.

## Otras integraciones

| Servicio | Uso |
|---|---|
| Supabase | PostgreSQL, sesiones invitadas, cuentas opcionales, MFA, permisos y almacenamiento privado |
| Mailjet | Entrada por correo y SMTP para registro/recuperación |
| Telegram Bot API | Avisos de comprobantes al equipo |
| Cloudflare Pages | Publicación del frontend |
| Cloudflare Turnstile | Protección de registro, login y sesiones invitadas |
| Cámara del navegador | Lectura de QR en puerta |
| Yape / Plin | Pago manual a la cuenta del organizador, sin API bancaria ni conciliación automática |

El QR de entrada se genera localmente, sin enviar el secreto a un generador externo. No se integró RENIEC ni OCR del voucher; ninguno prueba que el dinero llegó. El original usaba Mailjet, Telegram, un generador externo de QR y lectura OCR en el navegador, además de PHP/MySQL.

Referencias: https://supabase.com/docs/guides/auth/auth-anonymous · https://dev.mailjet.com/docs/email-api/senders-domains/senders-domains-overview · https://core.telegram.org/bots/tutorial
