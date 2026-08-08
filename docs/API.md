# API

La API usa el prefijo `/api`; la especificación interactiva Swagger está disponible en `/docs`. Las peticiones JSON usan `Content-Type: application/json`.

## Autenticación

| Método | Ruta | Cuerpo | Resultado |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | `email`, `password`, `displayName` | Crea una cuenta pendiente de verificación. |
| POST | `/api/auth/verify-email` | `token` | Activa una cuenta mediante token. |
| POST | `/api/auth/resend-verification` | `email` | Solicita un nuevo correo de verificación. |
| POST | `/api/auth/forgot-password` | `email` | Devuelve un mensaje genérico y, para cuentas activas, envía un enlace. |
| POST | `/api/auth/reset-password` | `token`, `password` | Restablece la contraseña y revoca sesiones. La contraseña requiere 12 a 128 caracteres. |
| POST | `/api/auth/login` | `email`, `password` | Devuelve `accessToken` y usuario; establece la cookie refresh. |
| POST | `/api/auth/refresh` | Ninguno | Renueva la sesión usando la cookie refresh. |
| POST | `/api/auth/logout` | Ninguno | Revoca y elimina la cookie refresh. |
| GET | `/api/auth/me` | Bearer token | Devuelve la identidad del access token. |

Las rutas protegidas usan `Authorization: Bearer <accessToken>`. Los endpoints de vault, organizaciones, navegación y administración se exponen desde sus módulos Nest correspondientes; Swagger refleja sus DTOs y requisitos de autorización.

## Flujo de recuperación

El cliente abre `#recuperar`, envía el correo a `POST /api/auth/forgot-password` y muestra siempre la respuesta genérica del servidor. El correo enlaza a `#reset?token=...`. La vista valida la confirmación y longitud de contraseña antes de llamar a `POST /api/auth/reset-password`.