# PassNexus

PassNexus es un gestor interno de secretos con cifrado en el navegador, control de acceso basado en roles, organizaciones, equipos, compartición de credenciales, auditoría y navegación configurable.

El repositorio es un monorepo npm compuesto por una SPA React y una API NestJS respaldada por PostgreSQL. El servidor almacena contenido cifrado y envelopes de claves; la contraseña maestra y las claves de contenido en claro se procesan en el navegador.

> Estado: aplicación funcional en desarrollo. Antes de exponerla en producción se deben completar los puntos de la [lista de despliegue](#lista-de-despliegue) y resolver el [bootstrap del primer administrador](#primer-administrador).

## Contenido

- [Capacidades](#capacidades)
- [Arquitectura](#arquitectura)
- [Seguridad y criptografía](#seguridad-y-criptografía)
- [Autorización y permisos](#autorización-y-permisos)
- [Modelo de datos](#modelo-de-datos)
- [Estructura del repositorio](#estructura-del-repositorio)
- [Desarrollo local](#desarrollo-local)
- [Variables de entorno](#variables-de-entorno)
- [Base de datos y seed](#base-de-datos-y-seed)
- [Pruebas y calidad](#pruebas-y-calidad)
- [API y URLs](#api-y-urls)
- [Despliegue](#despliegue)
- [Operación y recuperación](#operación-y-recuperación)
- [Limitaciones actuales](#limitaciones-actuales)

## Capacidades

### Vault

- Vault personal protegido por contraseña maestra.
- Tipos de elemento: inicio de sesión, nota segura, tarjeta e identidad.
- Carpetas, etiquetas, favoritos, archivo y papelera.
- Creación, edición, restauración y eliminación permanente.
- Historial cifrado de revisiones y restauración de versiones.
- Importación y exportación de ciphertext para el mismo contexto de claves; no es un backup portátil entre vaults distintos.
- Generador de contraseñas y copia segura de campos desde la interfaz.
- Recuperación de la clave del vault mediante una clave de recuperación mostrada una sola vez.

### Compartición

- Compartición directa con otros usuarios.
- Compartición con equipos de una organización.
- Acceso de solo lectura o con edición.
- Expiración y revocación de accesos.
- Visor de credenciales compartidas con secretos inicialmente ocultos.
- Cifrado por clave de documento para que cada destinatario reciba su propio envelope.

### Identidad y administración

- Inicio de sesión con access token y rotación de refresh token.
- MFA TOTP configurable desde la cuenta.
- Recuperación de contraseña de cuenta y cambio obligatorio de contraseña temporal.
- Usuarios internos, roles configurables y matriz de permisos.
- Organizaciones, miembros y equipos.
- Menú jerárquico configurable con páginas, grupos y enlaces externos.
- Auditoría de operaciones administrativas y de seguridad.

## Arquitectura

```mermaid
flowchart LR
	U[Usuario] --> W[React 19 + Vite]
	W -->|Bearer token + JSON| A[NestJS 11 API]
	W -->|Web Crypto API| C[Criptografía local]
	A -->|Prisma ORM| P[(PostgreSQL)]
	A -->|Nodemailer| S[SMTP]
	C -->|ciphertext + envelopes| A
	S -. desarrollo .-> M[Mailpit]
```

### Componentes

| Componente | Tecnología                                      | Responsabilidad                                                                         |
| ---------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| `apps/web` | React 19, TypeScript, Vite, Material UI, Lucide | Autenticación, dashboard, vault, criptografía cliente, organizaciones y administración. |
| `apps/api` | NestJS 11, TypeScript, Prisma                   | API, autenticación, autorización, persistencia, correo, auditoría y reglas de negocio.  |
| PostgreSQL | PostgreSQL 17 en desarrollo                     | Usuarios, sesiones, RBAC, organizaciones, metadatos, ciphertext y envelopes.            |
| SMTP       | Nodemailer; Mailpit en desarrollo               | Enlaces de verificación y recuperación de cuenta.                                       |

### Flujo de una sesión

1. El cliente restaura la sesión con la cookie HTTP-only o autentica correo y contraseña.
2. La API devuelve un access token de corta duración y rota el refresh token.
3. El dashboard solicita el menú permitido y los vaults del usuario.
4. La navegación se filtra en el servidor según visibilidad y permisos efectivos.
5. El usuario desbloquea localmente el vault con su contraseña maestra.
6. Los payloads se cifran o descifran en el navegador; la API recibe ciphertext y metadatos operativos.

### Módulos de la API

| Módulo          | Responsabilidad                                                                            |
| --------------- | ------------------------------------------------------------------------------------------ |
| `auth`          | Login, refresh, logout, recuperación, contraseñas temporales, MFA y correo.                |
| `vault`         | Vaults, elementos, historial, papelera, claves de compartición y accesos directos/equipos. |
| `organizations` | Organizaciones, membresías, roles internos y equipos.                                      |
| `admin`         | Usuarios, roles, permisos, navegación y auditoría.                                         |
| `navigation`    | Construcción del menú autorizado para el usuario actual.                                   |
| `prisma`        | Ciclo de vida de Prisma Client y acceso a PostgreSQL.                                      |

## Seguridad y criptografía

### Límites de confianza

- La contraseña de la cuenta se envía únicamente al endpoint de autenticación y se verifica contra un hash Argon2id.
- La contraseña maestra del vault se usa en el navegador y no forma parte de las solicitudes de creación o desbloqueo.
- La API conoce metadatos necesarios para operar, como propietario, tipo de elemento, versión, fechas y relaciones de compartición.
- La API almacena el contenido del vault como ciphertext. Este diseño no sustituye una auditoría criptográfica o de seguridad independiente.

### Cifrado del vault

```mermaid
flowchart TD
	MP[Contraseña maestra] --> KDF[Argon2id]
	KDF --> WK[Wrapping key]
	VK[Vault key aleatoria de 256 bits] --> E1[AES-256-GCM]
	WK --> E1
	E1 --> ENV[Envelope persistido]
	VK --> DATA[AES-256-GCM de payloads]
	DATA --> CT[Ciphertext persistido]
	RK[Recovery key aleatoria de 256 bits] --> E2[AES-256-GCM]
	VK --> E2
	E2 --> RENV[Recovery envelope persistido]
```

- Derivación: Argon2id mediante `hash-wasm`.
- Parámetros actuales: 3 iteraciones, 65.536 KiB de memoria, paralelismo 1 y salida de 32 bytes.
- Cifrado autenticado: AES-256-GCM con nonce aleatorio de 12 bytes.
- La clave de recuperación cifra un segundo envelope de la vault key y se muestra una sola vez.
- Perder simultáneamente la contraseña maestra y la clave de recuperación hace irrecuperable el contenido.

### Cifrado de compartición

1. El propietario promueve el elemento a una clave de documento AES de 256 bits.
2. El payload se cifra con esa clave de documento.
3. Cada usuario tiene un par ECDH P-256. La clave privada JWK se cifra con la vault key antes de persistirse.
4. Para cada destinatario se genera una clave ECDH efímera y se deriva una wrapping key AES-GCM.
5. La clave de documento se cifra para ese destinatario y se persiste junto a la clave pública efímera.
6. El destinatario descifra su clave privada localmente, deriva la misma wrapping key y abre el documento.

### Autenticación

- Contraseñas de cuenta y refresh tokens: Argon2id.
- Access token: JWT de 15 minutos.
- Refresh token: JWT de 30 días almacenado en cookie `passnexus_refresh` HTTP-only, `SameSite=Lax`, ruta `/api/auth` y `Secure` en producción.
- MFA: TOTP RFC 6238, 6 dígitos, periodo de 30 segundos y tolerancia de un periodo.
- Secretos TOTP: AES-256-GCM con `TOTP_ENCRYPTION_KEY`.
- Desafíos MFA: token opaco, hash SHA-256, un solo uso y 5 minutos de vigencia.
- Tokens de verificación: 24 horas. Recuperación de contraseña: 1 hora. Cambio de contraseña temporal: 10 minutos. Sólo se persiste su hash SHA-256.
- Restablecer la contraseña o desactivar MFA revoca sesiones activas.

### Controles HTTP

- Helmet para cabeceras de seguridad.
- CORS restringido a `WEB_ORIGIN` con credenciales.
- `ValidationPipe` global con transformación, whitelist y rechazo de campos no declarados.
- Límite global de 120 solicitudes por 60 segundos.
- Login y verificación MFA limitados a 5 solicitudes por 60 segundos.
- Guards Bearer y permisos en rutas protegidas.

Más detalles en [docs/SECURITY.md](docs/SECURITY.md).

## Autorización y permisos

PassNexus combina dos niveles distintos:

1. **RBAC de aplicación:** los roles asignan permisos como `users.read` o `vault.update`.
2. **Membresía de organización:** `OWNER`, `ADMIN` y `MEMBER` regulan acciones dentro de cada organización.

### Permisos incluidos por el seed

| Módulo         | Permisos                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------- |
| Vault          | `vault.read`, `vault.create`, `vault.update`, `vault.delete`                                 |
| Organizaciones | `organizations.read`, `organizations.create`, `organizations.update`, `organizations.delete` |
| Usuarios       | `users.read`, `users.create`, `users.update`                                                 |
| Roles          | `roles.read`, `roles.create`, `roles.update`                                                 |
| Navegación     | `navigation.read`, `navigation.update`                                                       |
| Auditoría      | `audit.read`                                                                                 |

El rol de sistema `ADMINISTRATOR` recibe todos los permisos. `VAULT_MEMBER` recibe los cuatro permisos de vault y `organizations.read`.

### Menú frente a acciones

El permiso de un `MenuItem` controla si la entrada aparece para el usuario; no define por sí solo todas las acciones de la pantalla.

Ejemplo:

- La entrada **Auditoría** requiere `audit.read` para aparecer y abrirse.
- No existe `audit.delete`: los eventos son de consulta y no se pueden borrar desde la aplicación.
- Eliminar la entrada **Auditoría** del menú es una operación administrativa protegida por `navigation.update`.
- Actualmente `navigation.update` protege crear, editar y eliminar elementos del menú; no existen `navigation.create` ni `navigation.delete` separados.

La API es la autoridad final. Ocultar botones en la interfaz mejora la experiencia, pero no reemplaza los guards del servidor.

## Modelo de datos

Las entidades están definidas en [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma).

| Área         | Entidades principales                                             | Relaciones relevantes                                                      |
| ------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Identidad    | `User`, `Session`, `AuthToken`, `TotpFactor`, `MfaLoginChallenge` | Un usuario tiene roles, sesiones, factores MFA y tokens de un solo uso.    |
| RBAC         | `Role`, `Permission`, `UserRole`, `RolePermission`                | Relaciones muchos-a-muchos entre usuarios, roles y permisos.               |
| Navegación   | `MenuItem`                                                        | Jerarquía autorreferenciada, permiso opcional, orden y visibilidad.        |
| Vault        | `Vault`, `VaultItem`, `VaultItemRevision`                         | Un vault pertenece a un usuario y conserva elementos e historial cifrados. |
| Compartición | `UserCryptoKey`, `VaultItemShare`, `VaultItemTeamShare`           | Envelopes por destinatario y accesos directos o por equipo.                |
| Organización | `Organization`, `OrganizationMember`, `Team`, `TeamMember`        | Equipos limitados a miembros de su organización.                           |
| Auditoría    | `AuditEvent`                                                      | Actor opcional, entidad, acción, metadatos y fecha.                        |

Los borrados en relaciones críticas usan cascada según el esquema. Los elementos del vault usan `deletedAt` para papelera antes de la eliminación permanente.

## Estructura del repositorio

```text
PassNexus/
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── migrations/       # Migraciones SQL versionadas
│   │   │   ├── schema.prisma     # Modelo de datos
│   │   │   └── seed.mjs          # Permisos, roles y menú base
│   │   └── src/
│   │       ├── admin/
│   │       ├── auth/
│   │       ├── navigation/
│   │       ├── organizations/
│   │       ├── prisma/
│   │       └── vault/
│   └── web/
│       ├── e2e/                  # Flujos Playwright
│       └── src/
│           ├── App.tsx           # Experiencia principal y módulos
│           └── lib/crypto.ts     # Criptografía cliente
├── docs/                         # Documentación especializada
├── docker-compose.yml            # PostgreSQL y Mailpit para desarrollo
├── .env.example                  # Variables de servicios locales
├── package.json                  # Scripts y workspaces npm
└── README.md
```

## Desarrollo local

### Requisitos

- Node.js 22.18.0 o posterior.
- npm compatible con workspaces.
- Docker Desktop o Docker Engine con Compose.
- Navegador con Web Crypto API.

### Instalación

```sh
git clone <url-del-repositorio>
cd PassNexus
npm ci
cp .env.example .env
```

Completa el `.env` con las variables de la siguiente sección y levanta las dependencias:

```sh
docker compose up -d
npm --workspace api exec -- prisma migrate deploy
npm run db:seed --workspace api
```

Inicia la API y la web en terminales separadas:

```sh
npm run dev:api
npm run dev:web
```

Servicios locales:

| Servicio         | URL o puerto                       |
| ---------------- | ---------------------------------- |
| Web              | `http://localhost:5173`            |
| API              | `http://localhost:3000/api`        |
| Swagger          | `http://localhost:3000/docs`       |
| Health           | `http://localhost:3000/api/health` |
| PostgreSQL       | `localhost:5432`                   |
| SMTP Mailpit     | `localhost:1025`                   |
| Interfaz Mailpit | `http://localhost:8025`            |

Detén los servicios de Docker con `docker compose down`. Añade `-v` sólo cuando quieras eliminar también los datos locales de PostgreSQL.

## Variables de entorno

La API busca `.env` en `apps/api/.env` y después en el `.env` de la raíz. Vite carga sus variables desde `apps/web`; usa `apps/web/.env.local` para `VITE_API_URL`.

### API y aplicación

| Variable              | Requerida        | Desarrollo/default                     | Descripción                                                      |
| --------------------- | ---------------- | -------------------------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`        | Sí               | Sin default                            | URL PostgreSQL usada por Prisma.                                 |
| `JWT_ACCESS_SECRET`   | Producción       | Default local inseguro                 | Firma access tokens de 15 minutos.                               |
| `JWT_REFRESH_SECRET`  | Producción       | Default local inseguro                 | Firma refresh tokens de 30 días.                                 |
| `TOTP_ENCRYPTION_KEY` | Para MFA         | Sin default                            | Base64 de exactamente 32 bytes para cifrar secretos TOTP.        |
| `WEB_ORIGIN`          | Producción       | `http://localhost:5173`                | Origen CORS y base de enlaces enviados por correo.               |
| `API_PORT`            | No               | `3000`                                 | Puerto HTTP de NestJS.                                           |
| `NODE_ENV`            | Producción       | Sin default                            | Con `production`, la cookie refresh usa `Secure`.                |
| `SMTP_HOST`           | No               | `localhost`                            | Servidor SMTP.                                                   |
| `SMTP_PORT`           | No               | `1025`                                 | Puerto SMTP.                                                     |
| `SMTP_SECURE`         | No               | `false`                                | Usa conexión SMTP segura cuando vale `true`.                     |
| `SMTP_USER`           | Según proveedor  | Vacío                                  | Usuario SMTP; sólo se configura auth si existe junto a password. |
| `SMTP_PASSWORD`       | Según proveedor  | Vacío                                  | Contraseña SMTP.                                                 |
| `SMTP_FROM`           | No               | `PassNexus <no-reply@passnexus.local>` | Remitente de correos.                                            |
| `VITE_API_URL`        | Según despliegue | `http://127.0.0.1:3000/api`            | URL base compilada en la SPA.                                    |

### Servicios Docker locales

| Variable            | Default                      |
| ------------------- | ---------------------------- |
| `POSTGRES_DB`       | `passnexus`                  |
| `POSTGRES_USER`     | `passnexus`                  |
| `POSTGRES_PASSWORD` | `change-this-local-password` |
| `POSTGRES_PORT`     | `5432`                       |
| `MAILPIT_PORT`      | `8025`                       |

`WEB_PORT` aparece en `.env.example`, pero Vite no lo consume automáticamente. Para cambiarlo usa `npm run dev:web -- --port 5175`.

### Ejemplo local completo

```env
POSTGRES_DB=passnexus
POSTGRES_USER=passnexus
POSTGRES_PASSWORD=change-this-local-password
POSTGRES_PORT=5432
MAILPIT_PORT=8025

DATABASE_URL=postgresql://passnexus:change-this-local-password@localhost:5432/passnexus?schema=public
API_PORT=3000
WEB_ORIGIN=http://localhost:5173
JWT_ACCESS_SECRET=replace-with-a-long-local-access-secret
JWT_REFRESH_SECRET=replace-with-a-different-long-local-refresh-secret
TOTP_ENCRYPTION_KEY=replace-with-base64-32-byte-key
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_FROM=PassNexus <no-reply@passnexus.local>
```

Genera secretos antes de usarlos:

```sh
openssl rand -base64 48  # JWT_ACCESS_SECRET
openssl rand -base64 48  # JWT_REFRESH_SECRET
openssl rand -base64 32  # TOTP_ENCRYPTION_KEY
```

No reutilices claves entre variables ni las confirmes en Git.

## Base de datos y seed

### Migraciones

```sh
# Aplicar migraciones existentes, recomendado en despliegue
npm --workspace api exec -- prisma migrate deploy

# Ver el estado
npm --workspace api exec -- prisma migrate status

# Crear una migración durante desarrollo
npm --workspace api exec -- prisma migrate dev --name descripcion_del_cambio
```

No uses `prisma db push` en producción: omite el historial de migraciones versionado.

### Seed

```sh
npm run db:seed --workspace api
```

El seed es idempotente y crea o actualiza:

- Los 17 permisos granulares.
- Los roles de sistema `ADMINISTRATOR` y `VAULT_MEMBER`.
- Las asignaciones de permisos de ambos roles.
- El menú base: Vault, Organizaciones, Auditoría, Usuarios, Roles y Navegación.

### Primer administrador

El proyecto no ofrece registro público y el seed **no crea usuarios**. En una base nueva se debe provisionar el primer usuario mediante un procedimiento operativo controlado antes de exponer la aplicación. Ese procedimiento debe:

1. Generar el `passwordHash` con Argon2id; nunca insertar una contraseña en claro.
2. Crear un `User` activo y marcar/verificar su correo según la política del entorno.
3. Asociarlo mediante `UserRole` al rol `ADMINISTRATOR` creado por el seed.
4. Forzar cambio de contraseña o entregar un enlace de configuración por un canal seguro.
5. Retirar o deshabilitar cualquier mecanismo temporal de bootstrap.

Actualmente no existe un script de bootstrap versionado. Esto es un requisito pendiente para instalaciones completamente nuevas; una restauración que ya contenga usuarios no necesita repetirlo.

## Pruebas y calidad

### Comandos

```sh
# Todas las pruebas unitarias disponibles
npm test

# Unitarias de API
npm test --workspace api

# Cobertura de API
npm run test:cov --workspace api

# E2E de web con Playwright
npm run test:e2e --workspace web

# Build de API y web
npm run build

# Lint de todos los workspaces
npm run lint
```

Playwright inicia una web aislada en `http://127.0.0.1:5174` y simula las APIs necesarias para los flujos cubiertos. Las pruebas incluyen autenticación, criptografía, usuarios, roles, auditoría, organizaciones, navegación y credenciales compartidas.

El build produce:

- `apps/api/dist`: aplicación NestJS compilada.
- `apps/web/dist`: archivos estáticos de la SPA.

## API y URLs

La API usa el prefijo `/api`. Swagger se publica fuera de ese prefijo en `/docs`.

| Grupo          | Base                   | Operaciones principales                                                  |
| -------------- | ---------------------- | ------------------------------------------------------------------------ |
| Sistema        | `/api/health`          | Estado básico del proceso. No comprueba PostgreSQL ni SMTP.              |
| Autenticación  | `/api/auth`            | Verificación, recuperación, login, MFA, refresh, logout y sesión actual. |
| Navegación     | `/api/navigation/menu` | Menú filtrado para el usuario autenticado.                               |
| Vault          | `/api/vaults`          | Vaults, items, historial, papelera, claves y comparticiones.             |
| Organizaciones | `/api/organizations`   | Organizaciones, miembros, equipos y membresías.                          |
| Administración | `/api/admin`           | Usuarios, roles, permisos, navegación y auditoría.                       |

No existe `POST /api/auth/register`. Las cuentas se crean desde la administración por un usuario con `users.create`.

Consulta DTOs, cuerpos y respuestas en Swagger, que es la referencia interactiva actual. La API protegida espera:

```http
Authorization: Bearer <access-token>
Content-Type: application/json
```

## Despliegue

### Artefactos

```sh
npm ci
npm run build
```

La API se inicia con:

```sh
NODE_ENV=production npm run start:prod --workspace api
```

La web debe servirse desde `apps/web/dist` con un servidor estático o CDN. Configura fallback a `index.html` para la SPA y compila `VITE_API_URL` con la URL pública de la API.

### Topologías compatibles

**Mismo dominio mediante reverse proxy**

```text
https://passnexus.example.com/      -> apps/web/dist
https://passnexus.example.com/api/  -> NestJS
https://passnexus.example.com/docs  -> Swagger, restringir en producción
```

**Dominios separados**

```text
https://app.example.com  -> web
https://api.example.com  -> API
WEB_ORIGIN=https://app.example.com
VITE_API_URL=https://api.example.com/api
```

Cuando uses dominios separados, valida el comportamiento de la cookie refresh con HTTPS, CORS y la política `SameSite=Lax` del navegador.

### Lista de despliegue

- [ ] Usar Node.js 22.18.0 o posterior.
- [ ] Proporcionar PostgreSQL persistente y `DATABASE_URL` con TLS cuando corresponda.
- [ ] Generar secretos distintos para JWT access, JWT refresh y TOTP.
- [ ] Custodiar secretos en un secret manager; no en archivos de imagen o repositorio.
- [ ] Definir `WEB_ORIGIN` y `VITE_API_URL` con HTTPS.
- [ ] Configurar SMTP autenticado y probar entrega, rebotes y remitente.
- [ ] Ejecutar `prisma migrate deploy` antes de iniciar la nueva versión.
- [ ] Ejecutar el seed al inicializar una base nueva.
- [ ] Provisionar el primer administrador en una instalación nueva.
- [ ] Servir la SPA con fallback a `index.html`.
- [ ] Restringir o desactivar Swagger público según la política del entorno.
- [ ] Configurar health checks contra `/api/health` y una comprobación de dependencia separada.
- [ ] Configurar backups, retención, restauración probada y monitoreo.
- [ ] Ejecutar `npm test`, Playwright y `npm run build` antes de promover.

El `docker-compose.yml` incluido es para desarrollo: expone PostgreSQL, usa una contraseña predeterminada y ejecuta Mailpit. No es una definición de producción. El repositorio tampoco incluye actualmente Dockerfiles, reverse proxy, CI/CD ni infraestructura como código.

Consulta [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) para notas adicionales, tomando las variables de este README como referencia actual.

## Operación y recuperación

### Backups

Respaldar al menos:

- PostgreSQL con una política de retención y restauraciones periódicas probadas.
- `TOTP_ENCRYPTION_KEY`; perderla impide validar los factores MFA existentes.
- Configuración y secretos JWT según la política de rotación.
- Configuración SMTP, DNS y dominios públicos.

Un backup de PostgreSQL conserva ciphertext y envelopes, pero no sustituye las claves de recuperación que cada usuario debe custodiar. La exportación JSON actual contiene ciphertext y nonce, depende del contexto de claves del vault y no reemplaza un backup completo de PostgreSQL, especialmente para elementos promovidos a clave de documento. Prueba la recuperación completa en un entorno aislado.

### Rotación

- Rotar secretos JWT invalida o afecta tokens existentes; planifica el cierre de sesiones.
- Rotar `TOTP_ENCRYPTION_KEY` requiere descifrar y volver a cifrar los factores existentes. No la cambies sin un procedimiento de migración.
- Cambiar `VITE_API_URL` requiere reconstruir la SPA.
- Cambiar la contraseña maestra vuelve a envolver la vault key; no requiere volver a cifrar todos los elementos.

### Observabilidad

- NestJS escribe logs en stdout/stderr.
- `AuditEvent` conserva eventos funcionales y administrativos, pero no reemplaza logs de infraestructura.
- No hay métricas, tracing distribuido ni integración APM incluidos actualmente.
- El health check actual confirma que el proceso responde, no la disponibilidad de base de datos o SMTP.

## Limitaciones actuales

- No existe bootstrap automatizado del primer administrador.
- No hay registro público; el flujo es de usuarios internos administrados.
- La verificación de correo tiene endpoints y correo, pero no una vista dedicada equivalente al reset por hash.
- No hay borrado de eventos de auditoría y sólo existe `audit.read`.
- Navegación agrupa crear, editar y eliminar bajo `navigation.update`.
- La sección activa del dashboard vive en estado React; recargar un deep link como `/admin/navigation` no restaura todavía esa sección automáticamente.
- El frontend concentra gran parte de la experiencia en `App.tsx`; antes de crecer conviene separar dominios y rutas.
- No se incluyen contenedores de producción, pipeline CI/CD, IaC, métricas ni APM.
- La postura criptográfica y de seguridad no cuenta aún con una auditoría externa documentada.

## Documentación relacionada

- [Arquitectura](docs/ARCHITECTURE.md)
- [Seguridad](docs/SECURITY.md)
- [API](docs/API.md), resumen complementario que puede no incluir los endpoints más recientes.
- [Despliegue](docs/DEPLOYMENT.md), notas complementarias; usa las variables de este README como referencia actual.

Cuando exista una discrepancia, el código y las migraciones son la fuente de verdad. Este README refleja el estado verificado del repositorio al momento de su última actualización.
