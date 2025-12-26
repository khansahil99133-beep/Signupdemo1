import test from 'node:test';
import assert from 'node:assert/strict';
import supertest from 'supertest';
import { newDb } from 'pg-mem';
import { closePool } from '../db.js';

process.env.NODE_ENV = 'test';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_PASS = process.env.ADMIN_PASS || 'password';
process.env.SESSION_COOKIE = process.env.SESSION_COOKIE || 'admin_session';

async function makeApp() {
  const { initApp } = await import('../server.js');
  const db = newDb();
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool();
  const { app } = await initApp({ pool });
  return { app, pool };
}

test.beforeEach(async (t) => {
  const ctx = await makeApp();
  t.context = ctx;
});

test.afterEach(async (t) => {
  await closePool();
});

test('signup stores and returns normalized data', async (t) => {
  const { app } = t.context;
  const payload = {
    telegram: '@testuser',
    password: 'SuperSecret123!',
    name: 'Tester',
    email: 'tester@example.com',
    whatsapp: '+911234567890',
  };

  const res = await supertest(app).post('/api/signup').send(payload);
  assert.equal(res.status, 201);
  assert.equal(res.body.ok, true);
  const user = res.body.user;
  assert.ok(user.id);
  assert.equal(user.telegram, '@testuser');
  assert.equal(user.email, payload.email);
  assert.equal(user.name, payload.name);
  assert.equal(user.whatsapp, payload.whatsapp);
  assert.ok(user.createdAt);
  assert.equal(user.password, undefined);
});

test('admin auth can list, export, and delete users', async (t) => {
  const { app } = t.context;
  const signupPayload = {
    telegram: '@sample',
    password: 'AnotherSecret1',
  };
  const signupRes = await supertest(app).post('/api/signup').send(signupPayload);
  const createdUser = signupRes.body.user;
  assert.ok(createdUser);

  const loginRes = await supertest(app)
    .post('/admin/login')
    .send({
      username: process.env.ADMIN_USER,
      password: process.env.ADMIN_PASS,
    })
    .expect(302);
  assert.ok(loginRes.headers['set-cookie']);
  const sessionCookie = loginRes.headers['set-cookie'][0].split(';')[0];

  const usersRes = await supertest(app)
    .get('/api/users')
    .set('Cookie', sessionCookie)
    .expect(200);
  assert.equal(usersRes.body.count, 1);
  assert.equal(usersRes.body.users[0].id, createdUser.id);

  const csvRes = await supertest(app)
    .get('/api/export')
    .set('Cookie', sessionCookie)
    .expect(200);
  assert.match(csvRes.headers['content-type'], /text\/csv/);
  assert.ok(csvRes.text.includes(createdUser.telegram));

  await supertest(app)
    .delete(`/api/users/${createdUser.id}`)
    .set('Cookie', sessionCookie)
    .expect(200);

  const postDelete = await supertest(app)
    .get('/api/users')
    .set('Cookie', sessionCookie)
    .expect(200);
  assert.equal(postDelete.body.count, 0);
});
