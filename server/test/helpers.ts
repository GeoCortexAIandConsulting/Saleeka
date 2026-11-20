import type request from 'supertest';
import { sentInTests } from '../src/services/email.js';

let k = 0;

/** A valid, unique username made from a name or an email: "Ayesha Khan" becomes ayesha_7. */
export function usernameFor(nameOrEmail: string) {
  const base = nameOrEmail.split(/[@\s]/)[0].toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  return `${base.length >= 2 ? base : 'user'}_${++k}`;
}

/** The newest link sent to this address (verification or reset). */
export function linkTo(email: string) {
  const mail = sentInTests.filter((m) => m.to === email).at(-1);
  return mail ? new URL(mail.text.match(/https?:\/\/\S+/)![0]) : null;
}

/**
 * Creates an account the way a player does: sign up, then open the link in the confirmation email,
 * which finishes the account and signs the agent in. Returns the sign-up response.
 */
export async function signUp(
  agent: ReturnType<typeof request.agent>,
  body: { email: string; name: string; password?: string; username?: string; ref?: string; consent?: boolean },
) {
  const res = await agent.post('/api/auth/signup').send({ password: 'correct-horse-9', consent: true, username: usernameFor(body.name || body.email), ...body });
  if (res.status !== 201) throw new Error(`sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);
  const token = linkTo(body.email)?.searchParams.get('token');
  const verified = await agent.post('/api/auth/verify').send({ token });
  if (verified.status !== 200) throw new Error(`confirming the email failed: ${verified.status} ${JSON.stringify(verified.body)}`);
  return res;
}
