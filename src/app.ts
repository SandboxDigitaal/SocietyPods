import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import morgan from 'morgan';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Db } from './db.js';
import { Repository } from './repository.js';
import { config, TRUSTED_EMAIL_DOMAINS } from './config.js';

type AuthRequest = Request & { userId?: string };

const phoneSchema = z.object({ phone: z.string().regex(/^\d{10}$/, 'Phone must contain exactly 10 digits.') });
const onboardingSchema = z.object({
  society_id: z.string().min(1),
  flat_no: z.string().trim().min(1).max(20),
  method: z.enum(['invite_code', 'work_email']),
  value: z.string().trim().min(1).max(254)
});
const joinSchema = z.object({
  pod_id: z.string().min(1),
  kids: z.array(z.object({ name: z.string().trim().min(1).max(100), age: z.number().int().min(1).max(18) })).min(1, 'Add at least one child before joining.')
});
const kidSchema = z.object({ name: z.string().trim().min(1).max(100), age: z.number().int().min(3).max(17), school_name: z.string().trim().min(1).max(150) });
const createPodSchema = z.object({ name: z.string().trim().min(3).max(100), school_name: z.string().trim().min(2).max(150), departure_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM time.'), max_capacity: z.number().int().min(2).max(8), kid_ids: z.array(z.string().min(1)).min(1) });
const sosSchema = z.object({ pod_id: z.string().min(1), child_id: z.string().min(1), reason: z.string().trim().min(10).max(500) });

export function createApp(db: Db) {
  const app = express();
  const repository = new Repository(db);
  app.use(cors());
  app.use(express.json({ limit: '32kb' }));
  app.use(morgan('dev'));

  const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.header('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Bearer token required.' } });
    try {
      const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
      if (!payload.sub || typeof payload.sub !== 'string') throw new Error('Invalid token subject');
      req.userId = payload.sub;
      return next();
    } catch {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token.' } });
    }
  };

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'society-pods-api' }));
  app.get('/api/societies', (_req, res) => res.json({ societies: repository.getSocieties() }));
  app.get('/dashboard', (_req, res) => {
    const source = readFileSync(resolve(process.cwd(), 'templates/dashboard-source.html'), 'utf8')
      // The supplied second screen is a modal-state reference; start the working app on its dashboard state.
      .replace('class="fixed md:absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center"', 'class="hidden fixed md:absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center"');
    const inlineScriptStart = source.lastIndexOf('<script>');
    const inlineScriptEnd = source.lastIndexOf('</script>');
    const ui = `${source.slice(0, inlineScriptStart)}<script src="/app.js"></script>${source.slice(inlineScriptEnd + 9)}`;
    res.type('html').send(ui);
  });
  app.get('/pods/:podId', (_req, res) => {
    const source = readFileSync(resolve(process.cwd(), 'templates/pod-detail-source.html'), 'utf8')
      .replace('class="p-4 flex flex-col gap-6" id="view-onboarding"', 'class="hidden p-4 flex flex-col gap-6" id="view-onboarding"')
      .replace('class="hidden p-4 flex flex-col gap-4" id="view-dashboard"', 'class="p-4 flex flex-col gap-4" id="view-dashboard"')
      .replace('class="hidden absolute bottom-0 left-0 right-0 bg-white border-t border-[#e0e3e5] px-4 py-2 flex justify-between items-center z-20" id="bottom-nav"', 'class="absolute bottom-0 left-0 right-0 bg-white border-t border-[#e0e3e5] px-4 py-2 flex justify-between items-center z-20" id="bottom-nav"');
    const inlineScriptStart = source.lastIndexOf('<script>');
    const inlineScriptEnd = source.lastIndexOf('</script>');
    const ui = `${source.slice(0, inlineScriptStart)}<script src="/pod-detail.js"></script>${source.slice(inlineScriptEnd + 9)}`;
    res.type('html').send(ui);
  });

  app.post('/api/auth/phone', (req, res) => {
    const result = phoneSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: result.error.issues[0]?.message } });
    const user = repository.findOrCreateUser(result.data.phone);
    const token = jwt.sign({ phone: user.phone_number }, config.jwtSecret, { subject: user.id, expiresIn: '8h' });
    return res.status(200).json({ token, user: { id: user.id, phone: user.phone_number, active_society_id: user.active_society_id } });
  });

  app.post('/api/onboarding/verify', authenticate, (req: AuthRequest, res) => {
    const result = onboardingSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: result.error.issues[0]?.message } });
    if (!repository.societyExists(result.data.society_id)) return res.status(404).json({ error: { code: 'SOCIETY_NOT_FOUND', message: 'Society not found.' } });
    const value = result.data.method === 'work_email' ? result.data.value.toLowerCase() : result.data.value;
    const verified = result.data.method === 'invite_code'
      ? value === 'TRUST-99'
      : TRUSTED_EMAIL_DOMAINS.some((domain) => value.endsWith(domain));
    const status = verified
      ? result.data.method === 'invite_code' ? 'verified_by_seed_parent' : 'verified_by_work_email'
      : 'pending_verification';
    const resident = repository.saveVerification({ userId: req.userId!, societyId: result.data.society_id, flatNo: result.data.flat_no, method: result.data.method, value, verified, status });
    return res.json({ resident: { ...resident, is_verified: Boolean(resident.is_verified) } });
  });

  app.get('/api/pods', authenticate, (req: AuthRequest, res) => {
    const resident = repository.getActiveResident(req.userId!);
    if (!resident) return res.status(404).json({ error: { code: 'SOCIETY_ASSIGNMENT_REQUIRED', message: 'Complete society onboarding first.' } });
    return res.json({ society_id: resident.society_id, pods: repository.listPods(resident.society_id, resident.id) });
  });

  app.get('/api/profile', authenticate, (req: AuthRequest, res) => {
    const resident = repository.getActiveResident(req.userId!);
    if (!resident) return res.status(404).json({ error: { code: 'SOCIETY_ASSIGNMENT_REQUIRED', message: 'Complete society onboarding first.' } });
    const society = repository.getSociety(resident.society_id);
    const displayName = resident.flat_no === 'Tower 11, Flat 1104' ? 'Neighbour Parent' : 'Vikram Kapoor';
    return res.json({
      profile: {
        display_name: displayName,
        flat_no: resident.flat_no,
        is_verified: Boolean(resident.is_verified),
        verification_status: resident.verification_status,
        society: society ? { name: society.name, locality: society.locality, city: society.city } : null,
        children: repository.listKids(resident.id)
      }
    });
  });

  app.get('/api/schedule', authenticate, (req: AuthRequest, res) => {
    const resident = repository.getActiveResident(req.userId!);
    if (!resident) return res.status(404).json({ error: { code: 'SOCIETY_ASSIGNMENT_REQUIRED', message: 'Complete society onboarding first.' } });
    const joinedPods = repository.listPods(resident.society_id, resident.id).filter((pod: any) => Boolean(pod.joined));
    const start = new Date();
    const mondayOffset = (8 - start.getDay()) % 7 || 7;
    start.setDate(start.getDate() + mondayOffset);
    const day = (offset: number, heading: string, status: string) => {
      const date = new Date(start); date.setDate(start.getDate() + offset);
      return {
        heading: `${heading}, ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        status,
        rides: joinedPods.length ? joinedPods.map((pod: any, index: number) => ({ pod_name: pod.name, time: pod.departureTime, driver: index === 0 && offset === 1 ? 'You (Parent Duty)' : index === 0 ? 'Priya M.' : 'Rajesh K.', state: offset === 0 ? (index === 0 ? 'Done' : 'Pending') : 'Scheduled' })) : []
      };
    };
    return res.json({ days: [day(0, 'Monday', joinedPods.length ? 'All Rides Confirmed' : 'No rides scheduled'), day(1, 'Tuesday', joinedPods.length ? 'Driver Swap Needed' : 'Plan a pod')] });
  });

  app.post('/api/pods/join', authenticate, (req: AuthRequest, res) => {
    const result = joinSchema.safeParse(req.body);
    if (!result.success) return res.status(403).json({ error: { code: 'KIDS_REQUIRED', message: result.error.issues[0]?.message } });
    const resident = repository.getActiveResident(req.userId!);
    if (!resident) return res.status(404).json({ error: { code: 'SOCIETY_ASSIGNMENT_REQUIRED', message: 'Complete society onboarding first.' } });
    if (!resident.is_verified) return res.status(403).json({ error: { code: 'VERIFICATION_REQUIRED', message: 'Your resident verification is pending.' } });
    const joined = repository.joinPod(resident, result.data.pod_id, result.data.kids);
    if (!joined.ok) {
      const status = joined.reason === 'not_found' ? 404 : 409;
      const message = joined.reason === 'full' ? 'This pod is already full.' : joined.reason === 'duplicate' ? 'You have already joined this pod.' : 'Pod not found in your society.';
      return res.status(status).json({ error: { code: joined.reason.toUpperCase(), message } });
    }
    return res.status(201).json({ message: 'Pod joined successfully.', pod: joined.pod });
  });

  app.get('/api/kids', authenticate, (req: AuthRequest, res) => {
    const resident = repository.getActiveResident(req.userId!);
    if (!resident) return res.status(404).json({ error: { code: 'SOCIETY_ASSIGNMENT_REQUIRED', message: 'Complete society onboarding first.' } });
    return res.json({ kids: repository.listKids(resident.id) });
  });

  app.post('/api/kids', authenticate, (req: AuthRequest, res) => {
    const result = kidSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: result.error.issues[0]?.message } });
    const resident = repository.getActiveResident(req.userId!);
    if (!resident) return res.status(404).json({ error: { code: 'SOCIETY_ASSIGNMENT_REQUIRED', message: 'Complete society onboarding first.' } });
    return res.status(201).json({ kid: repository.addKid(resident.id, { name: result.data.name, age: result.data.age, schoolName: result.data.school_name }) });
  });

  app.delete('/api/kids/:kidId', authenticate, (req: AuthRequest, res) => {
    const resident = repository.getActiveResident(req.userId!);
    if (!resident) return res.status(404).json({ error: { code: 'SOCIETY_ASSIGNMENT_REQUIRED', message: 'Complete society onboarding first.' } });
    if (!repository.removeKid(resident.id, String(req.params.kidId))) return res.status(404).json({ error: { code: 'KID_NOT_FOUND', message: 'Child not found.' } });
    return res.status(204).send();
  });

  app.post('/api/pods', authenticate, (req: AuthRequest, res) => {
    const result = createPodSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: result.error.issues[0]?.message } });
    const resident = repository.getActiveResident(req.userId!);
    if (!resident) return res.status(404).json({ error: { code: 'SOCIETY_ASSIGNMENT_REQUIRED', message: 'Complete society onboarding first.' } });
    if (!resident.is_verified) return res.status(403).json({ error: { code: 'VERIFICATION_REQUIRED', message: 'Only verified residents can create pods.' } });
    const pod = repository.createPod(resident, { name: result.data.name, schoolName: result.data.school_name, departureTime: result.data.departure_time, maxCapacity: result.data.max_capacity, kidIds: result.data.kid_ids });
    if (!pod) return res.status(400).json({ error: { code: 'INVALID_KID_SELECTION', message: 'Select one or more of your registered children.' } });
    return res.status(201).json({ message: 'Pod launched to your society board.', pod });
  });

  app.delete('/api/pods/:podId', authenticate, (req: AuthRequest, res) => {
    const resident = repository.getActiveResident(req.userId!);
    if (!resident) return res.status(404).json({ error: { code: 'SOCIETY_ASSIGNMENT_REQUIRED', message: 'Complete society onboarding first.' } });
    if (!resident.is_verified) return res.status(403).json({ error: { code: 'VERIFICATION_REQUIRED', message: 'Only verified residents can remove pods.' } });
    if (!repository.removePod(resident, String(req.params.podId))) return res.status(404).json({ error: { code: 'POD_NOT_FOUND', message: 'Joined pod not found.' } });
    return res.status(204).send();
  });

  app.get('/api/sos', authenticate, (req: AuthRequest, res) => {
    const resident = repository.getActiveResident(req.userId!);
    if (!resident) return res.status(404).json({ error: { code: 'SOCIETY_ASSIGNMENT_REQUIRED', message: 'Complete society onboarding first.' } });
    return res.json({ alerts: repository.listSos(resident) });
  });

  app.post('/api/sos/trigger', authenticate, (req: AuthRequest, res) => {
    const result = sosSchema.safeParse(req.body);
    if (!result.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: result.error.issues[0]?.message } });
    const resident = repository.getActiveResident(req.userId!);
    if (!resident) return res.status(404).json({ error: { code: 'SOCIETY_ASSIGNMENT_REQUIRED', message: 'Complete society onboarding first.' } });
    if (!resident.is_verified) return res.status(403).json({ error: { code: 'VERIFICATION_REQUIRED', message: 'Only verified residents can trigger SOS.' } });
    const alert = repository.triggerSos(resident, { podId: result.data.pod_id, childId: result.data.child_id, reason: result.data.reason });
    if (!alert) return res.status(400).json({ error: { code: 'INVALID_SOS_CONTEXT', message: 'Choose your enrolled pod and registered child.' } });
    return res.status(201).json({ message: 'SOS broadcast to verified society parents.', alert });
  });

  app.post('/api/sos/:sosId/claim', authenticate, (req: AuthRequest, res) => {
    const resident = repository.getActiveResident(req.userId!);
    if (!resident) return res.status(404).json({ error: { code: 'SOCIETY_ASSIGNMENT_REQUIRED', message: 'Complete society onboarding first.' } });
    if (!resident.is_verified) return res.status(403).json({ error: { code: 'VERIFICATION_REQUIRED', message: 'Only verified residents can claim a swap.' } });
    const result = repository.claimSos(resident, String(req.params.sosId));
    if (result === 'not_found') return res.status(404).json({ error: { code: 'SOS_NOT_FOUND', message: 'SOS alert not found in your society.' } });
    if (result === 'unavailable') return res.status(409).json({ error: { code: 'SOS_UNAVAILABLE', message: 'This SOS cannot be claimed.' } });
    return res.json({ message: 'Swap claimed. Confirm the handoff OTP in person.' });
  });

  app.post('/api/sos/:sosId/complete', authenticate, (req: AuthRequest, res) => {
    const resident = repository.getActiveResident(req.userId!);
    if (!resident) return res.status(404).json({ error: { code: 'SOCIETY_ASSIGNMENT_REQUIRED', message: 'Complete society onboarding first.' } });
    const result = repository.completeSos(resident, String(req.params.sosId));
    if (result === 'not_found') return res.status(404).json({ error: { code: 'SOS_NOT_FOUND', message: 'SOS alert not found in your society.' } });
    if (result === 'forbidden') return res.status(403).json({ error: { code: 'SOS_FORBIDDEN', message: 'Only the affected or claimed parent can complete this SOS.' } });
    return res.json({ message: 'Handover marked safe and complete.' });
  });

  app.use(express.static('public'));
  app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } }));
  return app;
}
