# CI/CD

GitHub Actions ejecuta `.github/workflows/ci.yml` al subir a `main`, abrir o actualizar un pull request hacia `main`, o solicitar una ejecución manual. Instala con `npm ci`, ejecuta pruebas unitarias, pruebas de permisos y reglas de negocio en PostgreSQL embebido, compila y prueba la interfaz en escritorio y móvil. No requiere secretos ni accede a la base de datos de producción.

Cloudflare Pages usa la integración GitHub del repositorio `Edyckzon/events-osz`. Configurar rama de producción `main`, Node 24, comando `npm run build:ci`, salida `dist` y las variables públicas Vite. Cada push inicia automáticamente un despliegue; solo publica si sus pruebas y compilación terminan correctamente.

GitHub CI y Cloudflare corren independientemente: Pages no espera al resultado de GitHub Actions. El comando `build:ci` repite las pruebas unitarias y de base de datos en Pages; las pruebas de navegador corren solo en GitHub. Para exigir todos los checks antes de integrar cambios, configurar una regla de protección de `main` que requiera pull request y el check `verify`. Esa regla no se configura desde este archivo.

Las migraciones SQL y Edge Functions de Supabase no se despliegan automáticamente con el frontend. Sus credenciales privadas permanecen en Supabase. El primer despliegue de Pages debe terminar para confirmar que la integración funciona.
