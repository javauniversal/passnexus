import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import { AuthEmailType, renderAuthEmail } from './auth-email.templates';

@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);

  async sendVerificationEmail(email: string, token: string) {
    await this.send(email, '#verify-email', token, 'email-verification');
  }

  async sendPasswordResetEmail(email: string, token: string) {
    await this.send(email, '#reset', token, 'password-reset');
  }

  private async send(
    email: string,
    path: string,
    token: string,
    category: AuthEmailType,
  ) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
      throw new ServiceUnavailableException(
        'El servicio de correo no está configurado.',
      );
    }
    const url = `${(process.env.WEB_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '')}/${path}?token=${encodeURIComponent(token)}`;
    const template = renderAuthEmail(category, url);
    let response: Awaited<ReturnType<Resend['emails']['send']>>;
    try {
      response = await new Resend(apiKey).emails.send(
        {
          from,
          to: [email],
          subject: template.subject,
          text: template.text,
          html: template.html,
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
