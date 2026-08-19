import { smtpService } from './smtp.service.js';

export interface EmailSendParams {
  recipient: string;
  subject: string;
  body: string;
  sender: {
    email: string;
    displayName: string;
  };
}

export const emailService = {
  async sendEmail(params: EmailSendParams): Promise<{ messageId: string; previewUrl?: string }> {
    return smtpService.sendMail({
      to: params.recipient,
      subject: params.subject,
      text: params.body,
      fromName: params.sender.displayName,
      fromAddress: params.sender.email,
    });
  },
};
