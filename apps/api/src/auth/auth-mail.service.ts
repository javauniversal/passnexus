import { Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';

@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);
  private readonly transport = createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
  });

  async sendVerificationEmail(email: string, token: string) {
    await this.send(
      email,
      'Verifica tu correo de PassNexus',
      'verify-email',
      token,
      'Verifica tu correo para activar tu cuenta de PassNexus.',
    );
  }

  async sendPasswordResetEmail(email: string, token: string) {
    await this.send(
      email,
      'Restablece tu contraseña de PassNexus',
      '#reset',
      token,
      'Restablece tu contraseña de PassNexus. Si no solicitaste este cambio, ignora este correo.',
    );
  }

  private async send(
    email: string,
    subject: string,
    path: string,
    token: string,
    message: string,
  ) {
    const url = `${(process.env.WEB_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '')}/${path}?token=${encodeURIComponent(token)}`;
    await this.transport.sendMail({
      from: process.env.SMTP_FROM ?? 'PassNexus <no-reply@passnexus.local>',
      to: email,
      subject,
      text: `${message}\n\n${url}`,
    });
    this.logger.log('Authentication email accepted by SMTP transport.');
  }
}
