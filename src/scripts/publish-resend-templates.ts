import fs from 'fs';
import path from 'path';
import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error('ERROR: Please set RESEND_API_KEY in your environment.');
  process.exit(1);
}

const resend = new Resend(apiKey);

type TemplateDef = {
  id: string;
  file: string;
  subject?: string;
  variables: Array<{ key: string; type: 'string' | 'number' | 'boolean'; fallbackValue?: string | number | boolean }>;
};

const templates: TemplateDef[] = [
  {
    id: 'subscription_abandoned',
    file: 'subscription_abandoned.html',
    subject: '{{planName}} subscription incomplete',
    variables: [
      { key: 'customerName', type: 'string', fallbackValue: 'Customer' },
      { key: 'merchantName', type: 'string', fallbackValue: 'Merchant' },
      { key: 'planName', type: 'string', fallbackValue: 'Plan' },
      { key: 'checkoutUrl', type: 'string', fallbackValue: '' },
      { key: 'date', type: 'string', fallbackValue: new Date().toUTCString() },
    ],
  },
  {
    id: 'subscription_active',
    file: 'subscription_active.html',
    subject: '{{planName}} subscription is active',
    variables: [
      { key: 'customerName', type: 'string', fallbackValue: 'Customer' },
      { key: 'merchantName', type: 'string', fallbackValue: 'Merchant' },
      { key: 'planName', type: 'string', fallbackValue: 'Plan' },
      { key: 'duration', type: 'string', fallbackValue: '1 month' },
      { key: 'amount', type: 'number', fallbackValue: 0 },
      { key: 'currency', type: 'string', fallbackValue: 'USD' },
      { key: 'startsAt', type: 'string', fallbackValue: new Date().toUTCString() },
      { key: 'expiresAt', type: 'string', fallbackValue: new Date().toUTCString() },
      { key: 'date', type: 'string', fallbackValue: new Date().toUTCString() },
    ],
  },
  {
    id: 'subscription_cancelled',
    file: 'subscription_cancelled.html',
    subject: '{{planName}} subscription cancelled',
    variables: [
      { key: 'customerName', type: 'string', fallbackValue: 'Customer' },
      { key: 'merchantName', type: 'string', fallbackValue: 'Merchant' },
      { key: 'planName', type: 'string', fallbackValue: 'Plan' },
      { key: 'cancelledAt', type: 'string', fallbackValue: new Date().toUTCString() },
      { key: 'expiresAt', type: 'string', fallbackValue: '' },
      { key: 'date', type: 'string', fallbackValue: new Date().toUTCString() },
    ],
  },
  {
    id: 'subscription_expired',
    file: 'subscription_expired.html',
    subject: '{{planName}} has expired',
    variables: [
      { key: 'customerName', type: 'string', fallbackValue: 'Customer' },
      { key: 'merchantName', type: 'string', fallbackValue: 'Merchant' },
      { key: 'planName', type: 'string', fallbackValue: 'Plan' },
      { key: 'duration', type: 'string', fallbackValue: '1 month' },
      { key: 'expiresAt', type: 'string', fallbackValue: new Date().toUTCString() },
      { key: 'checkoutUrl', type: 'string', fallbackValue: '' },
      { key: 'date', type: 'string', fallbackValue: new Date().toUTCString() },
    ],
  },
  {
    id: 'subscription_reminder',
    file: 'subscription_reminder.html',
    subject: '{{planName}} renews soon',
    variables: [
      { key: 'customerName', type: 'string', fallbackValue: 'Customer' },
      { key: 'merchantName', type: 'string', fallbackValue: 'Merchant' },
      { key: 'planName', type: 'string', fallbackValue: 'Plan' },
      { key: 'duration', type: 'string', fallbackValue: '1 month' },
      { key: 'amountDue', type: 'number', fallbackValue: 0 },
      { key: 'currency', type: 'string', fallbackValue: 'USD' },
      { key: 'daysLeft', type: 'number', fallbackValue: 3 },
      { key: 'expiresAt', type: 'string', fallbackValue: new Date().toUTCString() },
      { key: 'checkoutUrl', type: 'string', fallbackValue: '' },
      { key: 'date', type: 'string', fallbackValue: new Date().toUTCString() },
    ],
  },
];

async function readHtml(fileName: string) {
  const p = path.join(__dirname, '..', 'html', fileName);
  try {
    return await fs.promises.readFile(p, 'utf8');
  } catch (err: any) {
    console.warn(`Warning: could not read ${p}: ${err.message}`);
    return null;
  }
}

async function createAndPublishTemplate(t: TemplateDef) {
  const html = await readHtml(t.file);
  if (!html) {
    console.error(`Skipping ${t.id} - missing HTML file.`);
    return;
  }

  try {
    console.log(`Creating template ${t.id}...`);
    // create then publish in one chain if SDK supports it
    // @ts-ignore - some SDKs allow chaining publish()
    const created = await (resend.templates.create({
      name: t.id,
      subject: t.subject,
      html,
      variables: t.variables.map(v => ({ key: v.key, type: v.type, fallbackValue: v.fallbackValue })),
    }) as any).publish();

    console.log(`Template ${t.id} created & published.`);
  } catch (err: any) {
    // fallback: try create, then publish separately
    try {
      console.warn(`Create+publish chain failed for ${t.id}, attempting create then publish separately...`);
      const created = await resend.templates.create({
        name: t.id,
        subject: t.subject,
        html,
        variables: t.variables.map(v => ({ key: v.key, type: v.type, fallbackValue: v.fallbackValue })),
      });
      if ((created as any).id) {
        try {
          // @ts-ignore
          await resend.templates.publish((created as any).id);
          console.log(`Template ${t.id} published (separate publish).`);
        } catch (pubErr: any) {
          console.warn(`Publish failed for ${t.id}: ${pubErr.message}`);
        }
      }
    } catch (createErr: any) {
      console.error(`Failed to create template ${t.id}: ${createErr.message || createErr}`);
    }
  }
}

(async function main() {
  console.log('Publishing templates to Resend (TS script)...');
  for (const t of templates) {
    // small delay between calls to avoid rate limits
    await createAndPublishTemplate(t);
    await new Promise(r => setTimeout(r, 300));
  }
  console.log('All done.');
})();
