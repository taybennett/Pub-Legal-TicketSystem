import { ServerClient } from 'postmark';
import { config } from '../config.js';
import { logger } from '../util/logger.js';

const client = new ServerClient(config.POSTMARK_TOKEN);

async function send(params: { to: string; subject: string; text: string; html: string }) {
  try {
    await client.sendEmail({
      From: `${config.EMAIL_FROM_NAME} <${config.EMAIL_FROM}>`,
      To: params.to,
      Subject: params.subject,
      TextBody: params.text,
      HtmlBody: params.html,
      MessageStream: 'outbound',
    });
  } catch (err) {
    logger.error({ err, to: params.to, subject: params.subject }, 'email send failed');
  }
}

export async function sendInvitationEmail(opts: { to: string; name: string; pin: string }) {
  const portalUrl = config.FRONTEND_URL_PORTAL;
  const subject = 'Welcome to the PUB Legal Portal';
  const text = [
    `Hi ${opts.name},`,
    ``,
    `Your PUB Legal Portal account is ready.`,
    ``,
    `Sign in at: ${portalUrl}`,
    `Email:     ${opts.to}`,
    `PIN:       ${opts.pin}`,
    ``,
    `You can change your PIN from your profile after logging in. If you did not expect this email, reply and let us know.`,
    ``,
    `— PUB Legal`,
  ].join('\n');
  const html = `
    <p>Hi ${escapeHtml(opts.name)},</p>
    <p>Your PUB Legal Portal account is ready.</p>
    <p>
      <strong>Sign in:</strong> <a href="${portalUrl}">${portalUrl}</a><br>
      <strong>Email:</strong> ${escapeHtml(opts.to)}<br>
      <strong>PIN:</strong> <code>${escapeHtml(opts.pin)}</code>
    </p>
    <p>You can change your PIN from your profile after logging in. If you did not expect this email, reply and let us know.</p>
    <p>— PUB Legal</p>`;
  await send({ to: opts.to, subject, text, html });
}

export async function sendTicketActivityEmail(opts: {
  to: string;
  recipientName: string;
  ticketTitle: string;
  ticketUrl: string;
  actorName: string;
  action: 'new_message' | 'ticket_created' | 'status_changed' | 'document_uploaded';
  extra?: string;
}) {
  const actionText = {
    new_message:       'posted a new message on',
    ticket_created:    'opened a new ticket:',
    status_changed:    'updated the status on',
    document_uploaded: 'uploaded a document to',
  }[opts.action];
  const subject = `[PUB Legal] ${opts.actorName} ${actionText} ${opts.ticketTitle}`.slice(0, 120);
  const text = [
    `Hi ${opts.recipientName},`,
    ``,
    `${opts.actorName} ${actionText} "${opts.ticketTitle}".`,
    opts.extra ? `\n${opts.extra}\n` : '',
    `View the ticket: ${opts.ticketUrl}`,
    ``,
    `— PUB Legal`,
  ].filter(Boolean).join('\n');
  const html = `
    <p>Hi ${escapeHtml(opts.recipientName)},</p>
    <p><strong>${escapeHtml(opts.actorName)}</strong> ${actionText} <em>${escapeHtml(opts.ticketTitle)}</em>.</p>
    ${opts.extra ? `<p>${escapeHtml(opts.extra)}</p>` : ''}
    <p><a href="${opts.ticketUrl}">View the ticket</a></p>
    <p>— PUB Legal</p>`;
  await send({ to: opts.to, subject, text, html });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}
