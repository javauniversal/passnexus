# Despliegue

El proyecto requiere Node.js 22.18 o posterior. Instala dependencias desde la raíz y construye todas las aplicaciones con:

```sh
npm install
npm run build
```

Para desarrollo local, `docker compose up -d` inicia PostgreSQL 17 en el puerto 5432 y Mailpit (SMTP 1025 e interfaz 8025). Ejecuta `npm run dev:api` y `npm run dev:web`; el frontend queda en `http://localhost:5173`.

La API lee `.env` local o el `.env` de la raíz. Configura al menos `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `WEB_ORIGIN`, `API_PORT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` y `SMTP_FROM` según el entorno. El despliegue debe aplicar las migraciones de Prisma antes de iniciar la API y servir web y API bajo orígenes HTTPS compatibles con `WEB_ORIGIN`.

Los enlaces de recuperación se construyen desde `WEB_ORIGIN` y apuntan a `#reset?token=...`; ese fragmento se procesa en el navegador y no se envía al servidor web.