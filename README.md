# IshuriApp

Mobile education platform for Rwanda. Every approved school gets a public website-style profile inside one app — home, about, staff, events, announcements, gallery, ranking and contact — plus school operations for directors, teachers, discipline, accountants, students and parents.

Built with **Expo SDK 57** (React Native), **Express** and **MongoDB**. SMS is sent through Digital Services Center. Every number begins with 250.

## What you can do

- Search schools and universities by name, type and district
- Open a school like a website: homepage, about, staff (phone, email, WhatsApp, socials), events, ads, gallery, national rank, map/contact
- Students and parents follow campuses
- Super admins review school applications before they go public (Google Business-style safety)
- Super admins manage subscriptions and in-app ads (internships, new schools, events)
- Directors register teachers, staff, subjects and classes; they approve public staff profiles
- Teachers register students with parent phones and send assessment SMS
- Discipline office reports cases and can notify parents
- Accountants manage stock in and out
- Universities publish scholarships, graduations and ceremonies (no class marks system)

## SMS

Parent notices and school messages are sent by the API. The gateway is Digital Services Center at `https://bulksms.digitalservicescenter.rw/api/v2/sms/send`. Phone numbers are sent as `250` plus 9 digits. Set `SMS_ENABLED`, `DSC_API_BASE`, `DSC_API_KEY`, `DSC_USERNAME`, and `DSC_PASSWORD` in `backend/.env`. Those values stay on the server.

## Run locally

You need Node 20+ and MongoDB on `127.0.0.1:27017`.

```bash
# MongoDB (if you use Docker)
docker run -d --name ishuri-mongo -p 27017:27017 mongo:7

# API
cd backend
npm install
copy .env.example .env   # already created on Windows setups
npm run seed
npm run dev
```

```bash
# App
cd mobile
npm install
npx expo start
```

Open with Expo Go, an emulator, or press `w` for web. The app talks to `http://<your-lan-ip>:4000/api` automatically when you scan the QR code, `http://10.0.2.2:4000/api` on Android emulator, and `http://localhost:4000/api` on web. Override with `EXPO_PUBLIC_API_URL` if needed.

## Demo accounts (after seed)

| Role | Email | Password |
|---|---|---|
| Super admin | admin@ishuri.rw | IshuriAdmin@2026 |
| School director | director@gsnyarugenge.rw | School@123 |
| Mathematics teacher | maths@gsnyarugenge.rw | Teacher@123 |
| Discipline | discipline@gsnyarugenge.rw | Discipline@123 |
| University admin | admin@ur.ac.rw | University@123 |

Parents and students do not create accounts. They browse school profiles without signing in. Teachers still register student records (with parent phones) for SMS — that is school data, not an IshuriApp login.

GS Nyarugenge is already approved and ranked. Lycee de Kigali is waiting in the super-admin review queue.

## Project layout

```
backend/          Express API + MongoDB models
mobile/            Expo Router app (SDK 57)
```
