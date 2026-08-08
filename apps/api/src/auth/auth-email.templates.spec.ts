import { renderAuthEmail } from './auth-email.templates';

describe('auth email templates', () => {
  it('renders a branded email verification message', () => {
    const email = renderAuthEmail(
      'email-verification',
      'https://passnexus.fiiss.com/verify-email?token=verification-token',
    );

    expect(email.subject).toBe('Verifica tu correo de PassNexus');
    expect(email.html).toContain('Confirma que eres tú.');
    expect(email.html).toContain('Verificar correo');
    expect(email.html).toContain('24 horas');
    expect(email.text).toContain(
      'Protección: enlace personal y de un solo uso.',
    );
  });

  it('renders a distinct password reset message', () => {
    const email = renderAuthEmail(
      'password-reset',
      'https://passnexus.fiiss.com/#reset?token=reset-token',
    );

    expect(email.subject).toBe('Restablece tu contraseña de PassNexus');
    expect(email.html).toContain('Crea una contraseña nueva.');
    expect(email.html).toContain('Restablecer contraseña');
    expect(email.html).toContain('1 hora');
    expect(email.html).not.toContain('Verificar correo');
  });

  it('escapes action URLs in HTML and does not load external assets', () => {
    const email = renderAuthEmail(
      'password-reset',
      'https://passnexus.fiiss.com/#reset?token=a&next="unsafe"',
    );

    expect(email.html).toContain('token=a&amp;next=&quot;unsafe&quot;');
    expect(email.html).not.toContain('<script');
    expect(email.html).not.toMatch(/<(img|link)\b/i);
  });
});
