import { ServiceUnavailableException } from '@nestjs/common';
import { AuthMailService } from './auth-mail.service';

const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

describe('AuthMailService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RESEND_API_KEY = 'test-resend-key';
    process.env.EMAIL_FROM = 'PassNexus <no-reply@mail.passnexus.fiiss.com>';
    process.env.EMAIL_REPLY_TO = 'support@fiiss.com';
    process.env.WEB_ORIGIN = 'https://passnexus.fiiss.com';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('sends a password reset through Resend with an encoded URL', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-id' }, error: null });

    await new AuthMailService().sendPasswordResetEmail(
      'user@example.com',
      'token+with/symbols',
    );

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'PassNexus <no-reply@mail.passnexus.fiiss.com>',
        to: ['user@example.com'],
        replyTo: 'support@fiiss.com',
        subject: 'Restablece tu contraseña de PassNexus',
        text: expect.stringContaining(
          'https://passnexus.fiiss.com/#reset?token=token%2Bwith%2Fsymbols',
        ),
        html: expect.stringContaining('Crea una contraseña nueva.'),
        tags: [{ name: 'category', value: 'password-reset' }],
      }),
      {
        idempotencyKey: expect.stringMatching(/^password-reset\/[a-f0-9]{64}$/),
      },
    );
  });

  it('fails safely when Resend rejects the email', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'Domain not verified' },
    });

    await expect(
      new AuthMailService().sendVerificationEmail(
        'user@example.com',
        'verification-token',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('requires both the API key and sender address', async () => {
    delete process.env.RESEND_API_KEY;

    await expect(
      new AuthMailService().sendPasswordResetEmail(
        'user@example.com',
        'reset-token',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
