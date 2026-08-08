export type AuthEmailType = 'email-verification' | 'password-reset';

type AuthEmailContent = {
  subject: string;
  preheader: string;
  eyebrow: string;
  title: string;
  message: string;
  actionLabel: string;
  validity: string;
  notice: string;
};

const contentByType: Record<AuthEmailType, AuthEmailContent> = {
  'email-verification': {
    subject: 'Verifica tu correo de PassNexus',
    preheader: 'Confirma tu dirección para activar tu espacio seguro.',
    eyebrow: 'CONFIRMACIÓN DE IDENTIDAD',
    title: 'Confirma que eres tú.',
    message:
      'Tu espacio seguro está listo. Verifica esta dirección de correo para activar tu cuenta y continuar en PassNexus.',
    actionLabel: 'Verificar correo',
    validity: '24 horas',
    notice:
      'Si no esperabas este correo, puedes ignorarlo. Tu cuenta no se activará sin esta confirmación.',
  },
  'password-reset': {
    subject: 'Restablece tu contraseña de PassNexus',
    preheader: 'Usa este enlace seguro para crear una contraseña nueva.',
    eyebrow: 'SEGURIDAD DE CUENTA',
    title: 'Crea una contraseña nueva.',
    message:
      'Recibimos una solicitud para restablecer la contraseña de tu cuenta. Continúa sólo si reconoces esta acción.',
    actionLabel: 'Restablecer contraseña',
    validity: '1 hora',
    notice:
      'Si no solicitaste este cambio, ignora el correo. Tu contraseña actual seguirá funcionando.',
  },
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderAuthEmail(type: AuthEmailType, actionUrl: string) {
  const content = contentByType[type];
  const safeUrl = escapeHtml(actionUrl);
  const text = [
    'PassNexus',
    '',
    content.title,
    '',
    content.message,
    '',
    `${content.actionLabel}: ${actionUrl}`,
    '',
    `Vigencia: ${content.validity}.`,
    'Protección: enlace personal y de un solo uso.',
    '',
    content.notice,
    '',
    'PassNexus · Tus secretos, bajo tu control.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${content.subject}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef4f1;color:#172522;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${content.preheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#eef4f1;">
      <tr>
        <td align="center" style="padding:32px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #d6e2dd;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#123b36;padding:22px 28px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="width:34px;height:34px;background:#2ba98e;border-radius:6px;color:#ffffff;font-size:13px;font-weight:700;text-align:center;vertical-align:middle;">PN</td>
                    <td style="padding-left:11px;color:#f0f8f5;font-size:18px;font-weight:700;vertical-align:middle;">PassNexus</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 18px;">
                <div style="color:#0b6e62;font-size:11px;font-weight:700;letter-spacing:1.2px;line-height:1.5;">${content.eyebrow}</div>
                <h1 style="margin:12px 0 14px;color:#172522;font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:500;line-height:1.12;">${content.title}</h1>
                <p style="margin:0;color:#53635e;font-size:16px;line-height:1.65;">${content.message}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 32px 30px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="background:#0b6e62;border-radius:6px;">
                      <a href="${safeUrl}" style="display:inline-block;padding:13px 18px;color:#ffffff;font-size:14px;font-weight:700;line-height:1.2;text-decoration:none;white-space:nowrap;">${content.actionLabel}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3f7f5;border:1px solid #dce7e2;">
                  <tr>
                    <td style="padding:14px 16px;border-bottom:1px solid #dce7e2;color:#64746f;font-size:11px;line-height:1.5;">VIGENCIA</td>
                    <td align="right" style="padding:14px 16px;border-bottom:1px solid #dce7e2;color:#263a34;font-size:13px;font-weight:700;line-height:1.5;">${content.validity}</td>
                  </tr>
                  <tr>
                    <td style="padding:14px 16px;color:#64746f;font-size:11px;line-height:1.5;">PROTECCIÓN</td>
                    <td align="right" style="padding:14px 16px;color:#263a34;font-size:13px;font-weight:700;line-height:1.5;">Personal · Un solo uso</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 28px;">
                <p style="margin:0 0 12px;color:#65736f;font-size:13px;line-height:1.6;">${content.notice}</p>
                <p style="margin:0;color:#7a8782;font-size:11px;line-height:1.6;">Si el botón no funciona, copia este enlace en tu navegador:<br><a href="${safeUrl}" style="color:#0b6e62;word-break:break-all;">${safeUrl}</a></p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e3ebe7;padding:20px 32px;color:#7a8782;font-size:11px;line-height:1.5;">PassNexus · Tus secretos, bajo tu control.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject: content.subject, text, html };
}
