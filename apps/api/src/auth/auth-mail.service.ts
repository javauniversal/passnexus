import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Resend } from 'resend';

@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);

  async sendVerificationEmail(email: string, token: string) {
    await this.send(
      email,
      'Verifica tu correo de PassNexus',
      'verify-email',
      token,
      'Verifica tu correo para activar tu cuenta de PassNexus.',
      'email-verification',
    );
  }

  async sendPasswordResetEmail(email: string, token: string) {
    await this.send(
      email,
      'Restablece tu contraseña de PassNexus',
      '#reset',
      token,
      'Restablece tu contraseña de PassNexus. Si no solicitaste este cambio, ignora este correo.',
      'password-reset',
    );
  }

  private async send(
    email: string,
    subject: string,
    path: string,
    token: string,
    message: string,
    category: 'email-verification' | 'password-reset',
  ) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      throw new ServiceUnavailableException(
        'El servicio de correo no está configurado.',
      );
    }
    const url = `${(process.env.WEB_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '')}/${path}?token=${encodeURIComponent(token)}`;
    let response: Awaited<ReturnType<Resend['emails']['send']>>;
    try {
      response = await new Resend(apiKey).emails.send(
        {
          from,
          to: [email],
          subject,
          text: `${message}\n\n${url}`,
          ...(process.env.EMAIL_REPLY_TO
            ? { replyTo: process.env.EMAIL_REPLY_TO }
            : {}),
          tags: [{ name: 'category', value: category }],
        },
        {
          idempotencyKey: `${category}/${createHash('sha256').update(token).digest('hex')}`,
        },
      );
    } catch (error) {
      this.logger.error(
        'No fue posible contactar a Resend.',
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException(
        'No fue posible enviar el correo de autenticación.',
      );
    }
    if (response.error) {
      this.logger.error(
        `Resend rechazó el correo de autenticación: ${response.error.name}: ${response.error.message}`,
      );
      throw new ServiceUnavailableException(
        'No fue posible enviar el correo de autenticación.',
      );
    }
    this.logger.log('Authentication email accepted by Resend.');
  }
}
