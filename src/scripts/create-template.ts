import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';
const resend = new Resend(process.env.RESEND_API_KEY);
const html = fs.readFileSync(path.join( "@/src/html", 'waitlist.html'), 'utf-8');

const create = async() => {
    await resend.templates.create({
  name: 'waitlist-email',
  html,
  variables: [
    {
      key: 'to',
      type: 'string',
      fallbackValue: 'there',
    }
  ],
}).publish();
}

create();
