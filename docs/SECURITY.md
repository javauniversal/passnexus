# Seguridad

Las contraseñas de cuenta y refresh tokens se almacenan con Argon2id. Los access tokens se envían en `Authorization: Bearer`; los refresh tokens se guardan en la cookie HTTP-only `passnexus_refresh`, con `SameSite=Lax`, ruta `/api/auth` y `Secure` en producción.

Las solicitudes de recuperación no revelan si una cuenta existe. Se genera un token aleatorio de 32 bytes, se persiste únicamente su SHA-256, expira a la hora, se invalida al emitir uno nuevo y solo puede consumirse una vez. Al restablecer una contraseña se revocan las sesiones activas del usuario.

Nest aplica `helmet`, CORS restringido a `WEB_ORIGIN` y una tubería global que valida, transforma, elimina y rechaza campos no permitidos. El límite global actual es 120 peticiones por 60 segundos.

El contenido de los vaults y las claves de compartición se mantienen cifrados. La contraseña maestra se procesa en el cliente para desbloquear el vault y no se envía como parte de ese flujo. En producción se deben definir secretos JWT, `DATABASE_URL`, un SMTP autenticado, `WEB_ORIGIN` HTTPS y contraseñas de PostgreSQL no predeterminadas.

## Recuperación de contraseña maestra

Al crear un vault, el navegador genera una clave de recuperación aleatoria de 256 bits y la muestra una sola vez. La clave del vault se guarda en el servidor solamente como un segundo envelope AES-GCM cifrado con esa clave de recuperación; la clave en claro no se transmite ni se persiste. Si se olvida la contraseña maestra, el usuario autenticado puede usar la clave de recuperación para descifrar el vault en su navegador y crear un envelope nuevo derivado de una contraseña maestra nueva. PassNexus no puede regenerar una clave de recuperación perdida ni descifrar un vault por cuenta propia.

## MFA TOTP

PassNexus usa TOTP RFC 6238 de seis dígitos, período de 30 segundos y una ventana de tolerancia de un período para desajustes de reloj. Los secretos no se almacenan como texto: se cifran con AES-256-GCM antes de persistirse, usando `TOTP_ENCRYPTION_KEY`, una clave base64 de exactamente 32 bytes. Esta variable es obligatoria para configurar, verificar o usar MFA; se debe generar con `openssl rand -base64 32`, custodiar fuera del repositorio y rotar mediante un procedimiento de re-cifrado planificado.

Después de comprobar la contraseña, una cuenta con MFA activo recibe únicamente un desafío opaco de un solo uso, almacenado como SHA-256 y válido durante cinco minutos. La cookie de refresh y la sesión se emiten solo después de validar el TOTP. Desactivar MFA requiere un código válido y revoca todas las sesiones activas.