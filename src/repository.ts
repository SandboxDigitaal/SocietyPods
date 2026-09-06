import type { Db } from './db.js';
import { newId } from './db.js';
import { SEED_PARENT_ID } from './config.js';

export type User = { id: string; phone_number: string; active_society_id: string | null };
export type Resident = { id: string; user_id: string; society_id: string; flat_no: string; is_verified: number; verification_method: string; verification_status: string; work_email: string | null; invited_by_resident_id: string | null };

export class Repository {
  constructor(private readonly db: Db) {}

  findOrCreateUser(phone: string): User {
    let user = this.db.prepare('SELECT id, phone_number, active_society_id FROM users WHERE phone_number = ?').get(phone) as User | undefined;
    if (!user) {
      const id = newId();
      this.db.prepare('INSERT INTO users (id, phone_number) VALUES (?, ?)').run(id, phone);
      user = { id, phone_number: phone, active_society_id: null };
    }
    return user;
  }

  getSocieties() {
    return this.db.prepare('SELECT id, name, city, locality FROM societies ORDER BY name').all();
  }

  getSociety(societyId: string) {
    return this.db.prepare('SELECT id, name, city, locality FROM societies WHERE id = ?').get(societyId) as { id: string; name: string; city: string; locality: string } | undefined;
  }

  societyExists(societyId: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM societies WHERE id = ?').get(societyId));
  }

  saveVerification(input: { userId: string; societyId: string; flatNo: string; method: 'invite_code' | 'work_email'; value: string; verified: boolean; status: string; }): Resident {
    const existing = this.db.prepare('SELECT id FROM society_residents WHERE user_id = ? AND society_id = ?').get(input.userId, input.societyId) as { id: string } | undefined;
    const invitedBy = input.method === 'invite_code' && input.verified ? SEED_PARENT_ID : null;
    const email = input.method === 'work_email' ? input.value : null;
    const residentId = existing?.id ?? newId();
    if (existing) {
      this.db.prepare(`UPDATE society_residents SET flat_no = ?, is_verified = ?, verification_method = ?, verification_status = ?, work_email = ?, invited_by_resident_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(input.flatNo, Number(input.verified), input.method, input.status, email, invitedBy, residentId);
    } else {
      this.db.prepare(`INSERT INTO society_residents (id, user_id, society_id, flat_no, is_verified, verification_method, verification_status, work_email, invited_by_resident_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(residentId, input.userId, input.societyId, input.flatNo, Number(input.verified), input.method, input.status, email, invitedBy);
    }
    this.db.prepare('UPDATE users SET active_society_id = ? WHERE id = ?').run(input.societyId, input.userId);
    return this.getActiveResident(input.userId)!;
  }

  getActiveResident(userId: string): Resident | undefined {
    return this.db.prepare(`SELECT r.id, r.user_id, r.society_id, r.flat_no, r.is_verified, r.verification_method, r.verification_status, r.work_email, r.invited_by_resident_id
      FROM society_residents r JOIN users u ON u.active_society_id = r.society_id WHERE r.user_id = ?`).get(userId) as Resident | undefined;
  }

  listPods(societyId: string, residentId = '') {
    return this.db.prepare(`SELECT p.id, p.name, p.school_name AS schoolName, p.departure_time AS departureTime, p.max_capacity AS maxCapacity,
      EXISTS(SELECT 1 FROM pod_members own WHERE own.pod_id = p.id AND own.resident_id = ?) AS joined,
      COUNT(pm.id) AS memberCount FROM pods p LEFT JOIN pod_members pm ON pm.pod_id = p.id
      WHERE p.society_id = ? AND p.status = 'ACTIVE' GROUP BY p.id ORDER BY p.departure_time`).all(residentId, societyId);
  }

  joinPod(resident: Resident, podId: string, kids: unknown[]): { ok: true; pod: unknown } | { ok: false; reason: 'not_found' | 'full' | 'duplicate' } {
    const pod = this.db.prepare(`SELECT p.*, COUNT(pm.id) AS memberCount FROM pods p LEFT JOIN pod_members pm ON pm.pod_id = p.id
      WHERE p.id = ? AND p.society_id = ? AND p.status = 'ACTIVE' GROUP BY p.id`).get(podId, resident.society_id) as { id: string; max_capacity: number; memberCount: number } | undefined;
    if (!pod) return { ok: false, reason: 'not_found' };
    if (Number(pod.memberCount) >= pod.max_capacity) return { ok: false, reason: 'full' };
    if (this.db.prepare('SELECT 1 FROM pod_members WHERE pod_id = ? AND resident_id = ?').get(podId, resident.id)) return { ok: false, reason: 'duplicate' };
    this.db.prepare('INSERT INTO pod_members (id, pod_id, resident_id, kids_json) VALUES (?, ?, ?, ?)').run(newId(), podId, resident.id, JSON.stringify(kids));
    return { ok: true, pod: this.listPods(resident.society_id, resident.id).find((item: any) => item.id === podId) };
  }

  listKids(residentId: string) {
    return this.db.prepare('SELECT id, name, age, school_name AS schoolName FROM kids WHERE resident_id = ? ORDER BY created_at').all(residentId);
  }

  addKid(residentId: string, input: { name: string; age: number; schoolName: string }) {
    const id = newId();
    this.db.prepare('INSERT INTO kids (id, resident_id, name, age, school_name) VALUES (?, ?, ?, ?, ?)').run(id, residentId, input.name, input.age, input.schoolName);
    return this.db.prepare('SELECT id, name, age, school_name AS schoolName FROM kids WHERE id = ?').get(id);
  }

  removeKid(residentId: string, kidId: string): boolean {
    return this.db.prepare('DELETE FROM kids WHERE id = ? AND resident_id = ?').run(kidId, residentId).changes > 0;
  }

  createPod(resident: Resident, input: { name: string; schoolName: string; departureTime: string; maxCapacity: number; kidIds: string[] }) {
    const selectedKids = this.db.prepare(`SELECT id, name, age, school_name AS schoolName FROM kids WHERE resident_id = ? AND id IN (${input.kidIds.map(() => '?').join(',')})`).all(resident.id, ...input.kidIds) as Array<{ id: string }>;
    if (selectedKids.length !== input.kidIds.length) return null;
    const podId = newId();
    const membershipId = newId();
    const transaction = this.db.transaction(() => {
      this.db.prepare('INSERT INTO pods (id, society_id, name, school_name, departure_time, max_capacity) VALUES (?, ?, ?, ?, ?, ?)').run(podId, resident.society_id, input.name, input.schoolName, input.departureTime, input.maxCapacity);
      this.db.prepare('INSERT INTO pod_members (id, pod_id, resident_id, kids_json) VALUES (?, ?, ?, ?)').run(membershipId, podId, resident.id, JSON.stringify(selectedKids));
    });
    transaction();
    return this.listPods(resident.society_id, resident.id).find((item: any) => item.id === podId);
  }

  removePod(resident: Resident, podId: string): boolean {
    const membership = this.db.prepare('SELECT 1 FROM pod_members WHERE pod_id = ? AND resident_id = ?').get(podId, resident.id);
    if (!membership) return false;
    return this.db.prepare('DELETE FROM pods WHERE id = ? AND society_id = ?').run(podId, resident.society_id).changes > 0;
  }

  listSos(resident: Resident) {
    return this.db.prepare(`SELECT s.id, s.pod_id AS podId, p.name AS podName, s.child_id AS childId, k.name AS childName, k.school_name AS schoolName,
      s.reason, s.handshake_otp AS handshakeOtp, s.status, s.created_at AS createdAt, s.triggered_by_resident_id AS triggeredBy,
      s.claimed_by_resident_id AS claimedBy FROM sos_alerts s JOIN pods p ON p.id = s.pod_id JOIN kids k ON k.id = s.child_id
      WHERE s.society_id = ? AND s.status IN ('OPEN', 'CLAIMED') ORDER BY s.created_at DESC`).all(resident.society_id);
  }

  triggerSos(resident: Resident, input: { podId: string; childId: string; reason: string }) {
    const membership = this.db.prepare('SELECT 1 FROM pod_members WHERE pod_id = ? AND resident_id = ?').get(input.podId, resident.id);
    const child = this.db.prepare('SELECT 1 FROM kids WHERE id = ? AND resident_id = ?').get(input.childId, resident.id);
    const pod = this.db.prepare("SELECT 1 FROM pods WHERE id = ? AND society_id = ? AND status = 'ACTIVE'").get(input.podId, resident.society_id);
    if (!membership || !child || !pod) return null;
    const id = newId();
    const otp = String(Math.floor(1000 + Math.random() * 9000));
    this.db.prepare(`INSERT INTO sos_alerts (id, society_id, pod_id, child_id, triggered_by_resident_id, reason, handshake_otp) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, resident.society_id, input.podId, input.childId, resident.id, input.reason, otp);
    return this.db.prepare('SELECT id, handshake_otp AS handshakeOtp, status FROM sos_alerts WHERE id = ?').get(id);
  }

  claimSos(resident: Resident, sosId: string): 'claimed' | 'not_found' | 'unavailable' {
    const alert = this.db.prepare('SELECT status, society_id, triggered_by_resident_id FROM sos_alerts WHERE id = ?').get(sosId) as { status: string; society_id: string; triggered_by_resident_id: string } | undefined;
    if (!alert || alert.society_id !== resident.society_id) return 'not_found';
    if (alert.status !== 'OPEN' || alert.triggered_by_resident_id === resident.id) return 'unavailable';
    const result = this.db.prepare("UPDATE sos_alerts SET status = 'CLAIMED', claimed_by_resident_id = ? WHERE id = ? AND status = 'OPEN'").run(resident.id, sosId);
    return result.changes ? 'claimed' : 'unavailable';
  }

  completeSos(resident: Resident, sosId: string): 'completed' | 'not_found' | 'forbidden' {
    const alert = this.db.prepare('SELECT society_id, triggered_by_resident_id, claimed_by_resident_id, status FROM sos_alerts WHERE id = ?').get(sosId) as { society_id: string; triggered_by_resident_id: string; claimed_by_resident_id: string | null; status: string } | undefined;
    if (!alert || alert.society_id !== resident.society_id) return 'not_found';
    if (alert.triggered_by_resident_id !== resident.id && alert.claimed_by_resident_id !== resident.id) return 'forbidden';
    this.db.prepare("UPDATE sos_alerts SET status = 'COMPLETED', resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'COMPLETED'").run(sosId);
    return 'completed';
  }
}
