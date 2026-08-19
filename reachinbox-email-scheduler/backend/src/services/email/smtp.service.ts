import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { RetryableEmailError, PermanentEmailError } from './errors.js';

let transporter: nodemailer.Transporter | null = null;

export const smtpService = {
  getTransporter(): nodemailer.Transporter {
    if (!transporter) {
      if (!env.SMTP_HOST || !env.SMTP_PORT) {
        throw new PermanentEmailError('SMTP host or port configuration is missing.');
      }

      logger.info({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE }, 'Initializing reusable Nodemailer SMTP Transporter');

      transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER && env.SMTP_PASS ? {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        } : undefined,
      });
    }
    return transporter;
  },

  async verifyConnection(): Promise<void> {
    try {
      const client = this.getTransporter();
      await client.verify();
      logger.info('SMTP Transporter verification check succeeded');
    } catch (error: unknown) {
      const err = error as Error & { code?: string };
      logger.error({ err: { message: err.message, code: err.code } }, 'SMTP Transporter verification check failed');
      throw this.classifyError(err);
    }
  },

  async sendMail(payload: { to: string; subject: string; text: string; fromName?: string; fromAddress?: string }): Promise<{ messageId: string; previewUrl?: string }> {
    try {
      const client = this.getTransporter();
      
      const fromName = payload.fromName || env.EMAIL_FROM_NAME;
      const fromAddress = payload.fromAddress || env.EMAIL_FROM_ADDRESS || env.SMTP_USER;

      if (!fromAddress) {
        throw new PermanentEmailError('Email sender FROM address is required but missing.');
      }

      const info = await client.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
      });

      const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;

      return {
        messageId: info.messageId,
        previewUrl,
      };
    } catch (error: unknown) {
      const err = error as Error & { code?: string };
      logger.error({ err: { message: err.message, code: err.code }, recipient: payload.to }, 'SMTP Mail sending failed');
      throw this.classifyError(err);
    }
  },

  classifyError(error: unknown): Error {
    if (error instanceof PermanentEmailError || error instanceof RetryableEmailError) {
      return error;
    }

    const err = error as Error & { code?: string };
    const code = String(err.code || '').toUpperCase();
    const message = String(err.message || '').toLowerCase();

    // 1. Authentication errors
    if (code === 'EAUTH' || message.includes('auth') || message.includes('login') || message.includes('credentials') || message.includes('username or password')) {
      return new PermanentEmailError(`SMTP Auth failed: ${err.message}`);
    }

    // 2. Recipient / Addressing errors
    if (code === 'EENVELOPE' || message.includes('recipient') || message.includes('mailbox unavailable') || message.includes('address rejected')) {
      return new PermanentEmailError(`SMTP Address rejected: ${err.message}`);
    }

    // 3. Syntax or structural validation errors
    if (message.includes('parameters') || message.includes('malformed') || message.includes('syntax')) {
      return new PermanentEmailError(`SMTP Parameters syntax invalid: ${err.message}`);
    }

    // 4. Connection drop, sockets, and timeout issues are transient retries
    return new RetryableEmailError(`SMTP Transient error: ${err.message}`);
  }
};
