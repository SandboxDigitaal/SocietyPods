import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type Db } from '../src/db.js';
import { createApp } from '../src/app.js';

let db: Db;
let app: ReturnType<typeof createApp>;

beforeEach(() => { db = createDatabase(':memory:'); app = createApp(db); });

async function login(phone = '9876543210') {
  const response = await request(app).post('/api/auth/phone').send({ phone });
  return response.body.token as string;
}
async function verify(token: string, value = 'TRUST-99', method: 'invite_code' | 'work_email' = 'invite_code', society = 'society-prestige-shantiniketan') {
  return request(app).post('/api/onboarding/verify').set('Authorization', `Bearer ${token}`).send({ society_id: society, flat_no: '1202', method, value });
}

describe('Society Pods API', () => {
  it('validates phone authentication and returns a mock JWT', async () => {
    await request(app).post('/api/auth/phone').send({ phone: '123' }).expect(400);
    const response = await request(app).post('/api/auth/phone').send({ phone: '9876543210' }).expect(200);
    expect(response.body.token).toEqual(expect.any(String));
  });

  it('verifies an invite-code resident and saves the seed parent', async () => {
    const response = await verify(await login());
    expect(response.status).toBe(200);
    expect(response.body.resident).toMatchObject({ is_verified: true, invited_by_resident_id: 'resident-seed-parent-001' });
  });

  it.each(['parent@google.com', 'parent@microsoft.com', 'parent@tcs.com'])('verifies trusted work email %s', async (email) => {
    const response = await verify(await login(`98${String(Math.floor(Math.random() * 100000000)).padStart(8, '0')}`), email, 'work_email');
    expect(response.body.resident.is_verified).toBe(true);
  });

  it('keeps an untrusted resident pending and blocks joining', async () => {
    const token = await login('9876543211');
    const resident = await verify(token, 'NOPE');
    expect(resident.body.resident.is_verified).toBe(false);
    await request(app).post('/api/pods/join').set('Authorization', `Bearer ${token}`).send({ pod_id: 'pod-greenwood-morning', kids: [{ name: 'Maya', age: 8 }] }).expect(403);
  });

  it('scopes pods to the selected society, enforces children, and records a join', async () => {
    const token = await login('9876543212');
    await verify(token, 'TRUST-99', 'invite_code', 'society-sobha-elan');
    const pods = await request(app).get('/api/pods').set('Authorization', `Bearer ${token}`).expect(200);
    expect(pods.body.pods).toHaveLength(1);
    expect(pods.body.pods[0].id).toBe('pod-sobha-school-run');
    await request(app).post('/api/pods/join').set('Authorization', `Bearer ${token}`).send({ pod_id: 'pod-sobha-school-run', kids: [] }).expect(403);
    await request(app).post('/api/pods/join').set('Authorization', `Bearer ${token}`).send({ pod_id: 'pod-sobha-school-run', kids: [{ name: 'Ari', age: 7 }] }).expect(201);
    const refreshedPods = await request(app).get('/api/pods').set('Authorization', `Bearer ${token}`).expect(200);
    expect(refreshedPods.body.pods[0]).toMatchObject({ joined: 1, memberCount: 1 });
    await request(app).post('/api/pods/join').set('Authorization', `Bearer ${token}`).send({ pod_id: 'pod-sobha-school-run', kids: [{ name: 'Ari', age: 7 }] }).expect(409);
  });

  it('persists children, launches a pod, and creates an SOS handover alert', async () => {
    const token = await login('9876543213');
    await verify(token);
    const auth = { Authorization: 'Bearer ' + token };
    const child = await request(app).post('/api/kids').set(auth).send({ name: 'Aarav', age: 8, school_name: 'Inventure Academy' }).expect(201);
    const pod = await request(app).post('/api/pods').set(auth).send({
      name: 'Inventure Champions', school_name: 'Inventure Academy', departure_time: '08:00', max_capacity: 4, kid_ids: [child.body.kid.id]
    }).expect(201);
    const alert = await request(app).post('/api/sos/trigger').set(auth).send({
      pod_id: pod.body.pod.id, child_id: child.body.kid.id, reason: 'Traffic delay near the school; requesting pickup support.'
    }).expect(201);
    expect(alert.body.alert.handshakeOtp).toMatch(/^\d{4}$/);
  });
});
