# OSZ Events

Plataforma de eventos en español: React, TypeScript, Vite y Supabase, preparada para Cloudflare Pages.

## Ejecutar

Requiere **Node.js 24**. El Node 16 que estaba en el PATH de este equipo no es compatible. Usa `nvm use 24` si ya lo tienes instalado o instala Node 24 antes de ejecutar:

```sh
npm ci
npm run dev
```

Sin variables de Supabase abre una vista previa con tres eventos ficticios. No procesa registros ni pagos. Para activar el sistema, sigue **[docs/SETUP.md](docs/SETUP.md)**: proyecto nuevo, migraciones, email, MFA y primer administrador.

En este equipo también puedes ejecutar `./start-local.ps1`: usa el Node moderno disponible en Codex sin cambiar el Node del resto de tus proyectos.

```sh
npm run build
npm test
npm run test:db
# Requiere Google Chrome; levanta una vista de prueba aislada:
npm run test:e2e
```

## Incluye

- Catálogo responsive, filtros y detalles de eventos.
- Compra como invitado sin contraseña, enlace privado por correo y cuenta opcional con correo confirmado, recuperación y TOTP.
- Reservas, aforo, tipos de entrada, cupones, Yape/Plin manual y vouchers privados.
- Revisión de pagos, QR personal y control de ingreso con cámara o código manual.
- Administración de eventos y portadas, personal por evento, CSV y auditoría.
- Migraciones con RLS y funciones transaccionales; avisos opcionales de correo/Telegram.
- Cabeceras y rutas para Cloudflare Pages.

[Arquitectura, diferencias con el PHP y límites de las pruebas](docs/ARCHITECTURE.md).

Todavía requiere conectar y configurar tu proyecto Supabase, completar datos legales y validar el flujo con servicios reales antes de vender. No está desplegado en Cloudflare. Ningún archivo del sistema PHP se modificó.

[Configurar compra invitada, Mailjet y Telegram](docs/INTEGRACIONES.md). Los envíos reales requieren verificar onesecurezone.com, configurar Secrets y desplegar/programar el worker.
