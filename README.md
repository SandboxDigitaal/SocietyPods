# Society Pods

A buildathon-ready, trust-based apartment carpool prototype. One Express process serves the responsive demo UI and REST API; SQLite keeps local data between restarts.

## Run locally

```bash
cp .env.example .env
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Do not open `public/index.html` with `file://`: browser security prevents that page from reaching the API. The green **API connected** badge confirms that the UI reached `GET /health`.

## Live demo script

1. Enter any 10-digit phone number.
2. Pick a society, flat number, and enter `TRUST-99`.
3. Add a child and join a pod: you will see a persisted success state.
4. Repeat with a different phone and an invalid invite code: the pending banner appears and joining gets a backend `403`.
5. Trigger an SOS, use **Switch to Neighbor View** to claim it, then switch back to mark the handover safe.
6. Use the bottom tabs for My Pods, the API-backed weekly Schedule, and the resident Profile.

Alternatively, use `parent@google.com`, `parent@microsoft.com`, or `parent@tcs.com` in the work-email route.

## API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/health` | Service availability |
| `GET` | `/api/societies` | Seeded society discovery |
| `POST` | `/api/auth/phone` | 10-digit phone → mock JWT |
| `POST` | `/api/onboarding/verify` | Store society and trust status |
| `GET` | `/api/pods` | Pods in the JWT user's assigned society |
| `POST` | `/api/pods/join` | Join a pod after trust and children checks |
| `GET` | `/api/profile` | Current resident, trust state, society, and children |
| `GET` | `/api/schedule` | Upcoming demo rides derived from joined pods |

All routes except health, societies, and phone auth require `Authorization: Bearer <token>`.

### Curl proof

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/phone -H 'Content-Type: application/json' -d '{"phone":"9876543210"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl -X POST http://localhost:3000/api/onboarding/verify \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"society_id":"society-prestige-shantiniketan","flat_no":"1202","method":"invite_code","value":"TRUST-99"}'

curl http://localhost:3000/api/pods -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:3000/api/pods/join \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"pod_id":"pod-greenwood-morning","kids":[{"name":"Maya","age":8}]}'
```

## Data and safeguards

`db/schema.sql` is the local relational schema. Startup creates `data/society-pods.db` and safely applies idempotent seed data. The hardcoded `TRUST-99` and mock JWT are intentionally demo-only; replace them with authenticated invite records and a managed identity provider before deployment.

## Quality checks

```bash
npm run build
npm test
```

Tests cover authentication, trust paths, pending sandbox access control, society filtering, empty-child rejection, successful join, and duplicate join handling.

## Deploy to Vercel

This folder is self-contained and ready to be its own Git repository. It includes the supplied UI source in `templates/`, a Vercel Express function in `api/index.ts`, and `vercel.json` routing.

```bash
git init
git add .
git commit -m "Society Pods demo"
```

Import this `society-pods-api` folder into Vercel (or run `vercel` from it). Set `JWT_SECRET` in Vercel’s Environment Variables to any long random value. The deployed SQLite file uses Vercel’s `/tmp` directory, so it is suitable for a buildathon demo but data may reset when a serverless instance restarts. Use a managed database before treating it as production data.
