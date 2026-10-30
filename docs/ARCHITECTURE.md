# OSZ Events: alcance y decisiones

React + TypeScript + Vite sirve la interfaz en Cloudflare Pages. Supabase proporciona Auth, PostgreSQL, RLS, Storage y una Edge Function opcional para avisos. El navegador solo lleva una clave pública. No se ejecutó el PHP original ni se conectó a su MySQL.

## Flujo

Invitado o cuenta verificada → reserva de 30 minutos → comprobante privado → revisión humana del depósito → entrada QR → escaneo único. La reserva calcula importe, descuento y aforo dentro de una transacción con bloqueo del evento. Los datos enviados por el navegador nunca deciden el precio ni el rol. Las reservas con comprobante pendiente conservan su cupo hasta revisión. Una entrada gratuita se aprueba al reservar. Las reservas sin comprobante se liberan de forma diferida cuando otra operación consulta/actualiza el aforo; el frontend señala su vencimiento por fecha.

## Correspondencia con el PHP

| Función anterior | Implementación nueva |
|---|---|
| Formulario público con DNI y voucher | Invitado o cuenta opcional, reserva y comprobante privado |
| Un evento / configuración global | Varios eventos, portadas, tipos de entradas, cuotas |
| Yape/Plin manual | Datos del organizador, operación única por evento, revisión manual |
| Cupón fijo | Descuento fijo PEN, vigencia y límite de usos transaccional |
| Confirmado/rechazado/asistió | Estado de reserva, pago, entrada e ingreso con auditoría |
| QR y ticket público | QR aleatorio consultable por su dueño o enlace privado de correo; imprimible |
| Scanner de acceso | Permiso por evento, MFA, ventana horaria y consumo de QR atómico |
| Admin y promotores | Administrador, revisor y personal de puerta por evento |
| Avisos Telegram y correo | Cola de avisos, worker opcional, enlaces a la app; sin aprobar desde webhook |
| CSV y backups desde PHP | CSV neutraliza fórmulas; backups en infraestructura, fuera del navegador |

No se trasladó el OCR del comprobante: no verifica depósitos y no sustituye la consulta bancaria. No hay integración RENIEC, pasarela, conciliación bancaria automática, reembolsos automáticos ni sincronización con los usuarios del PHP. La fecha de nacimiento/DNI son declarados por el comprador; el personal verifica documento al ingresar. La plantilla legal no equivale a una validación jurídica.

## Controles

- RLS en todas las tablas públicas. Comprador solo accede a sus órdenes/QR; scanner obtiene nombre y últimos cuatro dígitos al validar, no la lista de vouchers. Revisor limitado a sus eventos.
- Administración, revisión y escaneo requieren JWT `aal2` y rol autorizado comprobados en PostgreSQL. El rol nunca se toma de metadatos editables por el usuario.
- RPC `security definer` con `search_path` vacío y permisos mínimos; funciones internas no expuestas para mutaciones. Workers solo con rol de servicio y secreto propio.
- Capacidad/cupones bloqueados por evento, idempotencia de reservas y operación única. QR largo aleatorio, rechazo del segundo ingreso y límite de escaneos por usuario.
- Bucket de vouchers privado, tamaños y MIME restringidos, URL firmada de 60 segundos para revisión. No se pueden actualizar ni eliminar vouchers desde el cliente. Frontend decodifica y recodifica imágenes; esto no equivale a antivirus ni validación server-side del contenido real.
- CSP, protección contra framing, tipos MIME, política de cámara y no HTML arbitrario. La SPA guarda la sesión mediante el SDK de Supabase; prevenir XSS sigue siendo importante. No se promete seguridad absoluta ni certificaciones empresariales.
- Confirmación de correo, SMTP, CAPTCHA, límites de Auth y backups dependen de la configuración del proyecto alojado, documentada en SETUP.

## Pruebas y límites

`npm run test:db` ejecuta las migraciones en PostgreSQL WASM (PGlite) con mocks de auth/storage. Verifica políticas, cuotas, transiciones y permisos con roles SQL reales. No sustituye una prueba de servicios Supabase alojados, de simultaneidad en varias conexiones, entrega de correo, cámara física o proveedores externos.

`npm test` valida funciones del frontend. `npm run test:e2e` usa Chrome en escritorio y tamaño móvil contra Vite: filtros, detalles, rutas protegidas, estado de vista previa y ausencia de desbordamiento. Las pruebas usan un servidor aislado sin credenciales. Las pruebas públicas no ejercen sesiones reales de Supabase ni el panel conectado.

Los eventos de muestra son ficticios y solo aparecen cuando no hay conexión. No se permite iniciar sesión ni comprar en esa vista. En producción, un proyecto nuevo comienza sin eventos.

Desde migración 003, can_buy permite sesiones anónimas para operar solo sus compras; verified sigue siendo obligatorio para vincular por correo y para roles de personal. read_ticket_link revela solo la entrada mínima mediante un secreto aleatorio diferente del QR. Los enlaces caducan 30 días después del evento. Ver INTEGRACIONES.md.
