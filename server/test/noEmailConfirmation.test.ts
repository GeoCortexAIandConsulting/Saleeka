import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { createMemoryRepos } from '../src/db/index.js';
import { RulesLlm } from '../src/services/llm.js';
import { sentInTests } from '../src/services/email.js';

let app: Awaited<ReturnType<typeof createApp>>;
const was = config.emailConfirmation;

beforeAll(async () => {
  config.emailConfirmation = false;
  app = await createApp({ repos: createMemoryRepos(), llm: new RulesLlm(), rateLimit: false });
});
afterAll(() => {
  config.emailConfirmation = was;
});

describe('with email confirmation switched off', () => {
  it('signs the player in at sign-up, sends no email, and lets them sign in and preview without confirming', async () => {
    const agent = request.agent(app);
    const before = sentInTests.length;
    const made = await agent
      .post('/api/auth/signup')
      .send({ email: 'no-confirm@example.com', password: 'correct-horse-9', name: 'Nida', username: 'nida_nc', consent: true });
    expect(made.status).toBe(201);
    expect(made.body.user.email).toBe('no-confirm@example.com');
    expect(made.headers['set-cookie']).toBeTruthy();
    expect(sentInTests.length).toBe(before);

    expect((await agent.get('/api/me')).status).toBe(200);
    await agent.post('/api/auth/logout').send({});
    expect((await agent.post('/api/auth/login').send({ email: 'no-confirm@example.com', password: 'correct-horse-9' })).status).toBe(200);

    const preview = await agent.get('/api/game/preview');
    if (preview.body.status) expect(preview.body.status.blocked).not.toBe('verify');
  });
});
