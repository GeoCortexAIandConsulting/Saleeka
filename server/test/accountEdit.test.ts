import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createMemoryRepos, type Repos } from '../src/db/index.js';
import { RulesLlm } from '../src/services/llm.js';
import { modestAnswers } from './fixtures.js';
import { signUp } from './helpers.js';

let repos: Repos;
let app: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  repos = createMemoryRepos();
  app = await createApp({ repos, llm: new RulesLlm(), rateLimit: false });
});

async function withProfile(email: string) {
  const agent = request.agent(app);
  expect((await signUp(agent, { email, password: 'correct-horse-9', name: 'Edit Test', consent: true })).status).toBe(201);
  expect((await agent.post('/api/quiz/answers').send({ ...modestAnswers, gender: 'female', ageRange: '25-34' })).status).toBe(201);
  return agent;
}

// 1x1 transparent PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('editing the profile later', () => {
  it('returns the current answers and changes just the ones sent', async () => {
    const agent = await withProfile('edit1@example.com');
    const before = (await agent.get('/api/profile/answers')).body.answers;
    expect(before.ageRange).toBe('25-34');

    const res = await agent.patch('/api/profile/answers').send({ ageRange: '35-44', budget: 'b2' });
    expect(res.status).toBe(200);
    expect(res.body.answers.ageRange).toBe('35-44');
    expect(res.body.answers.budget).toBe('b2');
    expect(res.body.answers.colorsLiked).toEqual(before.colorsLiked); // untouched
    expect(res.body.profile.ageRange).toBe('35-44');
  });

  it('keeps what ranking rounds learned when an unrelated answer changes', async () => {
    const agent = await withProfile('edit2@example.com');
    const userId = (await agent.get('/api/me')).body.user.id;
    const mine = (await repos.profiles.findOne({ id: userId }))!;
    // Simulate learning from rounds: a new liked feature and a stricter coverage.
    await repos.profiles.upsert({ ...mine, taste: { ...mine.taste, 'color:teal': 2 }, coverage: 5, roundsDone: 2 });

    const res = await agent.patch('/api/profile/answers').send({ budget: 'b4' });
    expect(res.status).toBe(200);
    expect(res.body.profile.taste['color:teal']).toBe(2);
    expect(res.body.profile.coverage).toBe(5);
    expect(res.body.profile.roundsDone).toBe(2);
  });

  it('rejects invalid edits and leaves the profile alone', async () => {
    const agent = await withProfile('edit3@example.com');
    expect((await agent.patch('/api/profile/answers').send({ colorsLiked: ['not-a-colour'] })).status).toBe(400);
    expect((await agent.patch('/api/profile/answers').send({ ageRange: '99' })).status).toBe(400);
    expect((await agent.get('/api/profile/answers')).body.answers.ageRange).toBe('25-34');
  });

  it('changes the display name', async () => {
    const agent = await withProfile('edit4@example.com');
    expect((await agent.patch('/api/me').send({ name: '  Ayesha  ' })).body.user.name).toBe('Ayesha');
    expect((await agent.patch('/api/me').send({ name: '' })).status).toBe(400);
    expect((await agent.get('/api/me')).body.user.name).toBe('Ayesha');
  });
});

describe('profile photo', () => {
  it('uploads, serves, replaces and removes a photo', async () => {
    const agent = await withProfile('photo1@example.com');
    expect((await agent.get('/api/me')).body.user.photoVersion).toBeNull();
    expect((await agent.get('/api/me/photo')).status).toBe(404);

    const up = await agent.put('/api/me/photo').send({ dataUrl: PNG });
    expect(up.status).toBe(200);
    expect((await agent.get('/api/me')).body.user.photoVersion).toBe(up.body.photoVersion);
    const img = await agent.get('/api/me/photo');
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toContain('image/png');

    expect((await agent.delete('/api/me/photo')).status).toBe(200);
    expect((await agent.get('/api/me/photo')).status).toBe(404);
  });

  it('rejects non-images and oversized uploads, and needs sign-in', async () => {
    const agent = await withProfile('photo2@example.com');
    expect((await agent.put('/api/me/photo').send({ dataUrl: 'data:text/html;base64,PGgxPg==' })).status).toBe(400);
    const huge = 'data:image/jpeg;base64,' + 'A'.repeat(390_000);
    expect([400, 413]).toContain((await agent.put('/api/me/photo').send({ dataUrl: huge })).status);
    expect((await request(app).put('/api/me/photo').send({ dataUrl: PNG })).status).toBe(401);
  });

  it('is deleted with the account', async () => {
    const agent = await withProfile('photo3@example.com');
    await agent.put('/api/me/photo').send({ dataUrl: PNG });
    expect((await agent.delete('/api/me')).status).toBe(200);
    expect(await repos.users.findOne({ email: 'photo3@example.com' })).toBeNull();
  });
});

describe('weight answer', () => {
  it('is optional, range-checked and stored on the profile', async () => {
    const agent = await withProfile('weight1@example.com');
    expect((await agent.get('/api/profile')).body.profile.weightKg).toBeUndefined();
    const ok = await agent.patch('/api/profile/answers').send({ weightKg: 62 });
    expect(ok.status).toBe(200);
    expect(ok.body.profile.weightKg).toBe(62);
    expect((await agent.patch('/api/profile/answers').send({ weightKg: 5 })).status).toBe(400);
    expect((await agent.get('/api/profile')).body.profile.weightKg).toBe(62);
  });
});

describe('3D avatar face', () => {
  // 1x1 white JPEG
  const JPEG =
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const face = () => ({
    points: Array.from({ length: 468 * 3 }, (_, i) => ((i % 7) - 3) * 1.2345678),
    uvs: Array.from({ length: 468 * 2 }, (_, i) => (i % 10) / 10),
    texture: JPEG,
    skinHex: '#C68E6A',
  });

  it('saves, serves, replaces and removes the avatar face', async () => {
    const agent = await withProfile('avatar1@example.com');
    expect((await agent.get('/api/me')).body.user.avatarVersion).toBeNull();
    expect((await agent.get('/api/me/avatar')).status).toBe(404);

    const up = await agent.put('/api/me/avatar').send(face());
    expect(up.status).toBe(200);
    expect((await agent.get('/api/me')).body.user.avatarVersion).toBe(up.body.avatarVersion);

    const got = await agent.get('/api/me/avatar');
    expect(got.status).toBe(200);
    expect(got.body.points).toHaveLength(468 * 3);
    expect(got.body.points[1]).toBe(-2.469); // rounded to 3 decimals
    expect(got.body.skinHex).toBe('#c68e6a');
    expect(got.body.texture).toBeUndefined(); // the image comes from its own URL

    const img = await agent.get('/api/me/avatar/face');
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toContain('image/jpeg');

    expect((await agent.delete('/api/me/avatar')).status).toBe(200);
    expect((await agent.get('/api/me/avatar')).status).toBe(404);
    expect((await agent.get('/api/me/avatar/face')).status).toBe(404);
    expect((await agent.get('/api/me')).body.user.avatarVersion).toBeNull();
  });

  it('rejects malformed faces and needs sign-in', async () => {
    const agent = await withProfile('avatar2@example.com');
    expect((await agent.put('/api/me/avatar').send({ ...face(), points: [1, 2, 3] })).status).toBe(400);
    expect((await agent.put('/api/me/avatar').send({ ...face(), uvs: face().uvs.map(() => 2) })).status).toBe(400);
    expect((await agent.put('/api/me/avatar').send({ ...face(), texture: PNG })).status).toBe(400);
    expect((await agent.put('/api/me/avatar').send({ ...face(), skinHex: 'red' })).status).toBe(400);
    expect((await request(app).put('/api/me/avatar').send(face())).status).toBe(401);
  });

  it('is deleted with the account', async () => {
    const agent = await withProfile('avatar3@example.com');
    await agent.put('/api/me/avatar').send(face());
    expect((await agent.delete('/api/me')).status).toBe(200);
    expect(await repos.users.findOne({ email: 'avatar3@example.com' })).toBeNull();
  });
});
