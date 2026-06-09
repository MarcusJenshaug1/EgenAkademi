# EgenAkademi – Whitelabel LMS: Project Manifest & Status

> **For AI-agenter og utviklere:** Dette dokumentet er kilden til sannhet for teknisk arkitektur, designregler, fullstendig kravstatus og veikart. Les dette FØR du gjør endringer.

> **Statusnotat 2026-06-09:** Kurssystemet (admin + learner) ble gjenopprettet til `main` fra PR #6 (var resatt bort 2026-06-05). Deretter ble fire admin-seksjoner bygget (**Sesjoner, Innhold, Rapporter, Integrasjoner**) og branding-siden overhalt. Statuslegende: `[x]` ferdig · `[~]` delvis (config/admin bygget, runtime/infra gjenstår) · `[ ]` ikke startet.

> **Autonom utbygging 2026-06-09 (PR #8–#19, stacked branches):** Hele resten av veikartet bygget topp-ned. Alt verifisert med `tsc --noEmit` + `next build` (47 ruter) og en adversariell sikkerhets-/konvensjonsgjennomgang per område.
> - **Fase 1:** Frister/resertifisering/eskalering + sesjonsvarsler (PR #8) · Ferdigheter & kompetanse m/ gap-analyse (PR #9) · `[~]` SCORM import + runtime-player (PR #10; full 2004-konformans + object-storage = TODO) · `[~]` Custom domener m/ ekte DNS TXT-verifisering (PR #11; auto-TLS + host-ruting = TODO) · Onboarding-programmer + dynamiske grupper (PR #8).
> - **Plattform:** System-admin-panel (plan/addons per tenant) + plan-basert nav-gating (PR #12).
> - **Fase 2:** `[~]` Full SCIM 2.0 (Users CRUD/Groups/discovery) + audit-retention/CSV + rate-limiting (PR #13) · Webhook-event-wiring + GDPR eksport/anonymisering (PR #14) · 2FA/TOTP self-service (PR #15; login-håndhevelse = TODO) · `[~]` SAML 2.0 SP-runtime m/ bibliotek-validering + Auth.js-bro (PR #16; persistert InResponseTo-cache + live-IdP = TODO).
> - **Fase 3:** Gamification (poeng/badges/nivåer/topplister, PR #17) · Wiki/kunnskapsbase (hierarki/versjoner/godkjenning/tilgang, PR #18).
> - **Marked + LTI:** Markedsnettsted (forside/priser/sikkerhet/bestill demo, PR #19) · `[~]` LTI 1.3 launch-scaffold m/ JWKS-validert id_token (Deep Linking/AGS/NRPS + sesjon = TODO).
>
> **Gjenværende TODO-er er infra-/deploy-avhengige** (auto-TLS, host-basert tenant-ruting, object-storage for SCORM, persistert SAML/LTI nonce-cache, login-tids 2FA-håndhevelse, daglig cron for frist-sweep/audit-retention, live-IdP-verifisering) eller produktbeslutninger — dokumentert per PR.

---

## Teknisk Stack

| Lag | Teknologi |
|---|---|
| Framework | Next.js 16+ (App Router, Turbopack) |
| Database | PostgreSQL via **Neon.tech** (serverless) |
| ORM | **Prisma v7** med `@prisma/adapter-pg` + `pg` |
| Auth | **Auth.js v5 (NextAuth beta)** — Magic Links via **Nodemailer** SMTP |
| Styling | CSS Modules + CSS Custom Properties (glassmorphism, dark mode) |
| Ikoner | **`lucide-react`** — ALDRI emojis |
| Editor | **Lexical** v0.41 — rik tekst-editor for kursinnhold |
| Typografi | System font stack + Google Fonts per tenant |

---

## Designregler (OBLIGATORISKE)

1. **Null emojis** – Alle ikoner er `lucide-react` SVG-vektorer.
2. **Dark First** – Mørk base (`#0a0a0a`), blå accent (`#3b82f6`).
3. **1px grid** – Spacing i multiples av 1px.
4. **Glassmorphism** – `backdrop-filter: blur()`, 1px borders, subtile transparenser.
5. **Whitelabel-ready CSS-variabler:** Alle farger via `--color-bg-primary`, `--color-accent-blue`, `--color-sidebar-*` etc. overstyres dynamisk per Tenant fra database. Se `.github/copilot-instructions.md` for komplett variabel-katalog.
6. **WCAG 2.2 AA** – Minimum kontrastkrav for tekst og interaktive elementer.

### Fargepalett (default — injiseres fra globals.css)
```
--color-bg-primary:    #050505
--color-bg-secondary:  #0f0f11
--color-border:        rgba(255, 255, 255, 0.08)
--color-text-primary:  #ffffff
--color-text-secondary:#9ca3af
--color-accent-blue:   #3b82f6
--color-button-primary:#3b82f6
--color-button-text:   #ffffff
--color-sidebar-bg:    #0a0a0a
--color-sidebar-text:  #a1a1aa
--color-sidebar-active:#3b82f6
--color-success:       #10b981
--color-warning:       #f97316
--color-danger:        #f43f5e
```

---

## Arkitektur — Viktige monstre

### Multi-Tenancy
- Alle brukere tilhører en `Tenant` (organisasjon).
- `tenantId` er påkrevd for tilgang til `/admin`.
- Ny innlogget bruker uten `tenantId` → tvangsrutes til `/onboarding`.
- Branding (farger, logo) lagres på `Tenant`-modellen i databasen.

### Auth-arkitektur (Edge-safe)
- `src/auth.config.ts` → Edge-kompatibel konfig (brukes av Middleware).
- `src/auth.ts` → Full konfig med Prisma Adapter og Nodemailer (Node.js kun).
- `src/middleware.ts` → Importerer kun fra `auth.config.ts`.
- Ruting: `/login` → `/onboarding` → `/admin`.

### Database Access
```ts
// src/lib/prisma.ts - ALLTID bruk singleton-mønster med adapter:
import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
return new PrismaClient({ adapter })
```

### Server Actions (riktig mønster)
```ts
'use server';
export async function myAction(formData: FormData) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return { error: 'Ikke autentisert' };
    // ... db operasjon
    return { success: true };
  } catch (e: any) {
    return { error: e.message };
  }
}
```

---

## Fullstendig Implementeringsstatus

### Ferdig implementert

#### Fundament
- [x] Next.js 16 prosjektoppsett med TypeScript og Turbopack
- [x] PostgreSQL database via Neon.tech
- [x] Prisma v7 med `pg` driver adapter (nødvendig for v7)
- [x] CSS Design System: tokens, glassmorphism, dark mode, CSS-variabler
- [x] `lucide-react` som eneste ikonbibliotek
- [x] Global `SessionProvider` for klientside session-synk

#### Autentisering & Tilgang
- [x] Auth.js v5 med Magic Link (e-post OTP via Nodemailer SMTP)
- [x] Edge-safe middleware med `auth.config.ts`/`middleware.ts`-splitting
- [x] JWT-token inneholder `tenantId`, `globalRole`, `id`
- [x] TypeScript-typer for NextAuth session (`src/types/next-auth.d.ts`)
- [x] Onboarding-flyt for nye brukere (oppretter Tenant + tildeler TENANT_ADMIN)
- [x] RBAC: roller `USER`, `TENANT_ADMIN`, `SYSTEM_ADMIN` i databasen

#### Admin UI
- [x] Admin-layout med sidebar-navigasjon og topbar
- [x] Dashboard-side med statistikk-kort og hurtighandlinger
- [x] Utlogg-funksjon med `signOut()`
- [x] Branding-side (`/admin/branding`) – lagring av farger og logo-URL til DB
- [x] Onboarding-side (`/onboarding`) – organisasjonsopprettelse

#### Branding-system (komplett)
- [x] 14 fargefelter med CSS-variabel-injeksjon fra database til `<html style="">`
- [x] Dynamisk avledede variabler (topbar, sidebar-hover, bg-surface, accent-glow, gradient)
- [x] Logo-opplasting med SVG-fargeredigering (brand-color recoloring)
- [x] Favicon-opplasting med SVG-støtte
- [x] Google Fonts + custom font-opplasting
- [x] URL-basert Brand Detector (farger, favicon, logo, fonter fra eksisterende nettside)
- [x] Manual Color Assistant (5-rolle → 14-felt generator med 3 kontrastprofiler)
- [x] Live forhåndsvisning av alle branding-endringer
- [x] WCAG AA kontrastsjekk per fargefelt
- [x] Tenant-navn redigering i branding-skjema
- [x] NavLink client component for aktive sidebar-lenker
- [x] Null hardkodede temafarger i noen .module.css-fil (fullstendig revisjon utført)

#### Database-modeller (Prisma Schema)
- [x] `Tenant` (med branding-felter: colorPrimary, colorAccent, logoUrl)
- [x] `User` (med tenantId, globalRole, Auth.js felter)
- [x] `Account`, `Session`, `VerificationToken` (Auth.js standard)
- [x] `Group`, `GroupMembership`
- [x] `TenantPlan` enum (`FREE`, `STANDARD`, `PLUS`, `ENTERPRISE`) på `Tenant`
- [x] `Tenant.addons` string-array for feature-flagg
- [x] `Tenant.trialEndsAt` for prøveperiode
- [x] Kurs-system: `Course`, `CourseVersion`, `Module`, `Lesson`, `LessonBlock`
- [x] Taksonomi: `CourseCategory`, `Tag`, `CourseCategoryLink`, `CourseTagLink`
- [x] Tildeling: `CourseAssignmentRule`, `CourseEnrollment`
- [x] Progresjon: `LessonProgress`, `ModuleProgress`, `ProgressEvent`
- [x] Sertifikater: `Certificate` (utstedelse, utløp, sertifikatnummer, mal-data)
- [x] Varsler: `Notification` med `NotificationType` enum (COURSE_ASSIGNED, COURSE_COMPLETED, CERTIFICATE_ISSUED, DEADLINE_REMINDER, GENERAL, SYSTEM)
- [x] Enums: `CourseVisibility`, `CourseStatus`, `CourseDifficulty`, `CourseVersionState`, `LessonType`, `CompletionRule`, `BlockType`, `GatingPolicy`, `TagType`, `AssignmentScope`, `AssignmentState`, `EnrollmentStatus`, `ProgressStatus`, `NotificationType`

#### Kurs-system (Admin)
- [x] Kurskatalog med grid-visning, søk, statusfilter (`/admin/courses`)
- [x] Opprett/slett/arkiver/gjenopprett kurs
- [x] Taksonomihåndtering (kategorier + tagger) inline i katalog
- [x] Kursdetalj med faner: Oversikt, Byggeren, Versjoner (`/admin/courses/[courseId]`)
- [x] Kursbygger: moduler med leksjoner, CRUD, rekkefølge
- [x] Publisering og versjonshåndtering
- [x] Server actions: `courseActions.ts`, `courseBuilderActions.ts`

---

### Ikke startet (prioritert rekkefølge)

#### Fase 1 – Kjernefunksjonalitet (MVP)

**Whitelabel & Branding**
- [x] Dynamisk CSS-variabel-injeksjon fra database til `<html style="">` per Tenant *(ferdig)*
- [ ] Custom domain / subdomain støtte (DNS-verifisering, CNAME, auto-TLS)
- [ ] Domain status-panel for administrator

**Læringsadministrasjon**
- [x] Kurskatalog (kategorier, tags, målgruppe, varighet, type) *(admin CRUD, grid-visning, søk, filter)*
- [x] Kursbygger (modulbasert: tekst, bilde, video, quiz, dokument) *(modul/leksjon CRUD, versjonspublisering)*
- [x] Innholdsblokk-editor (tekst, bilder, video, quiz, dokument, embed inni leksjoner) *(LessonBlockEditor.tsx med per-type redigering, forhåndsvisning, rekkefølge, CRUD)*
- [ ] SCORM 1.2 / 2004 import og runtime (imsmanifest.xml, JS API)
- [x] Kursversjonering (uten å ødelegge fullføringshistorikk) *(draft→published→archived, currentPublishedVersionId)*
- [x] Tildeling av kurs til org, grupper, roller eller enkeltpersoner *(Tildeling-fane med opprett/slett/aktiver/pause regler, tving-innmelding)*
- [ ] Frister og gjentakelse / resertifisering
- [ ] Eskaleringslogikk (påminnelser til bruker → leder/HR)
- [x] Lærerfronted kursvisning (kursspiller for elever) *(learner shell, dashboard, min læring, kursdetalj, player med innholdsblokker, fremdriftsbar, merk som fullført)*

**Learner Experience (ny)**
- [x] Learner shell (`/learn/*`) med egen sidebar, profil, navigasjon
- [x] Dashboard med fortsett-leksjon, statistikk, pågående/forfalt/fullført
- [x] Min læring-side med status-filter, søk, sortering
- [x] Kursdetalj (learner) med moduloversikt, fremdrift, start/fortsett
- [x] Kursspiller med sidebar-TOC, innholdsblokker (tekst, video, bilde, fil), merk som fullført, prev/next-navigasjon
- [x] Rollebasert ruting: USER → `/learn`, TENANT_ADMIN/SYSTEM_ADMIN → `/admin`, med beskyttelse
- [x] Server actions for learner: dashboard, mine kurs, kursdetalj, player, markering, tracking
- [x] Sertifikater-side (`/learn/certificates`) med grid-visning av utstedte sertifikater
- [x] Varsler-side (`/learn/notifications`) med filter (alle/uleste), merk som lest, type-ikoner
- [x] Profil-side (`/learn/profile`) med redigerbart skjema (navn, telefon, lokasjon, stilling, avdeling, bio)

**Planlagte sesjoner & Events**
- [x] Opprette sesjoner (dato, tid, kapasitet, sted/lenke, instruktør) *(`/admin/sessions`, `sessionActions.ts`, gated av `session-events`)*
- [x] Påmelding, venteliste (auto-promotering), avmelding, fremmøteregistrering *(admin-roster + learner `/learn/sessions`)*
- [ ] Automatiske varsler (invitasjon, påminnelse, endring, "no show") *(Notification-modell finnes; ikke koblet til sesjoner ennå)*
- [ ] Intern arrangementskalender *(listevisning gruppert per dag; full kalender-UI gjenstår)*

**Brukeradministrasjon**
- [x] CRUD for brukere i admin (`/admin/users`)
- [x] Gruppe-administrasjon (`/admin/groups`)
- [x] Roller og tilgangsvisning (`/admin/roles`)
- [x] Brukerprofil med avatar (`/admin/profile`)
- [ ] Dynamiske grupper (regelbasert, fra attributter)
- [ ] Individuelle brukerprofiler med ferdighetsprofil

**Progresjon & Analytics**
- [x] Progresjonssporing per kurs per bruker *(completionPercentCached, LessonProgress, ModuleProgress, ProgressEvent)*
- [x] Fullføringsstatus og -dato *(CourseEnrollment.completedAt, status: NOT_STARTED/IN_PROGRESS/COMPLETED)*
- [x] Admin analytics-dashboard (KPI-er, innmeldingsstatus, 30-dagers aktivitet) *(`/admin/reports`, `reportActions.ts`)*
- [x] Drill-down per avdeling/gruppe *(gruppe- og avdelingsfordeling med fullføringsrate)*
- [x] CSV-eksport (fullføringer, brukere, kurs) *(gated av `csv-export`; med formelinjeksjons-beskyttelse)* — API for BI-uttrekk gjenstår

**Onboarding-programmer**
- [ ] Malbibliotek ("Nyansatt", "Ny leder", "Sikkerhet og IT", "Compliance")
- [ ] Automatisk tildeling ved brukeropprettelse eller gruppeendring
- [ ] Tidsgjennomføring ("uke 1/uke 2/uke 4")

#### Fase 2 – Enterprise & Integrasjoner

**Identitet & SSO** *(`/admin/integrations`, `integrationActions.ts` — config/admin bygget, protokoll-runtime gjenstår)*
- [~] SAML 2.0 Service Provider — **config/lagring bygget** (IdP entity/SSO-URL/sertifikat, attributt-mapping, enable). ACS-endepunkt + AuthnRequest + assertion-validering gjenstår.
- [~] SCIM 2.0 API — **fungerende `/api/scim/v2/Users` (GET list + POST create)**. Mangler PATCH/PUT/DELETE, /Groups og discovery-endepunkter.
- [x] Token-basert autentisering for SCIM-endepunkter *(Bearer-token, lagret kun som sha256-hash, vist én gang, revokerbart)*
- [ ] "Sertifiserte oppsett" (playbooks) for Microsoft, Google, Okta

**Sikkerhet & Logging**
- [x] Audit-logging (`AuditLog`-modell, `lib/audit.ts`, viewer i `/admin/integrations`) — integrasjonsendringer + sesjonshendelser logges; flere hendelsestyper kan kobles på
- [ ] Log retention og eksport til SIEM
- [ ] Rate limiting og sperreregler for OTP/Magic Link
- [ ] TOTP / Passkeys / WebAuthn (phishing-resistent 2FA)
- [ ] IP-restriksjoner for SCIM-endepunkter (pr. tenant)

**Compliance**
- [ ] Dataretensjonspolicy pr. tenant (konfigurerbar)
- [ ] Slette- og anonymiseringsfunksjoner (GDPR)
- [ ] Databehandleravtale (DPA) og subdatabehandlerliste (dokumentasjon)
- [ ] SOC 2 Type 2 kontrollrammeverk (intern prosess)
- [ ] ISO 27001 ISMS (policyverk, risikovurdering, internrevisjon)

#### Fase 3 – Avanserte moduler

**Kompetanse & Ferdigheter**
- [ ] Ferdighetstaksonomi (ferdighet → underferdighet → nivå)
- [ ] Skill-to-course mapping
- [ ] Ferdighetsprofiler per bruker og kompetansematrise per team
- [ ] Gap-analyse og regelbaserte kursanbefalinger

**Wiki / Knowledge Base**
- [ ] Strukturerte sider (hierarki, tags, søk)
- [ ] Versjonshistorikk og godkjenningsflyt
- [ ] Tilgangsstyring per seksjon
- [ ] "Hva er nytt"-feed og pinnede sider

**Gamification**
- [ ] Poengregler (fullføring, quiz-score, streaks)
- [ ] Badges og levels (konfigurerbare)
- [ ] Leaderboards (opt-in, per avdeling)
- [ ] Synlighetsnivåer (offentlig, kun team, kun meg)

**LMS-integrasjoner** *(`/admin/integrations`)*
- [~] LTI 1.3 for tredjepartsverktøy — **plattform-registrering bygget** (issuer/clientId/authUrl/jwksUrl + enable). OIDC-launch/handshake + JWT-validering gjenstår.
- [~] Webhooks / event stream — **CRUD + HMAC-signert levering + leveringslogg + test-ping bygget** (`lib/webhooks.ts`). Forretningshendelsene (user.created, course.completed …) må kobles inn i relevante actions.
- [ ] Versjonerte eksportskjemaer for BI-pipeline

---

## Prismodell og Tilleggstjenester

### Abonnement (maanedlig/aarlig)

| Pakke | Inkluderer |
|---|---|
| **Standard** | LMS kjerne, brukerhåndtering, kurskatalog, standard branding (farger), gruppestyring |
| **Plus** | Alt i Standard + custom domene, SCORM, avansert branding (logo, favicon, typografi), onboarding-maler, analytics drill-down |
| **Enterprise** | Alt i Plus + SSO (SAML 2.0), SCIM 2.0, gamification, wiki, LTI 1.3, audit-logging, dedicated support |

### Tilleggstjenester (engangskjoep)

| Tjeneste | Type | Beskrivelse |
|---|---|---|
| **Custom Branding** | Abonnement (Plus+) | Full whitelabel: alle 14 fargefelter, logo med SVG-fargeredigering, favicon, Google Fonts + custom fontopplasting, live forhåndsvisning med WCAG AA kontrastsjekk |
| **Brand Detector** | Engangskjøp | URL-basert automatisk deteksjon av merkevarefarger, favicon og Google Fonts fra eksisterende nettside. Foreslår tilordninger til alle branding-felter med godkjenn/avvis per forslag |
| **Managed Setup** | Engangskjøp | Vi setter opp og konfigurerer hele plattformen for kunden (branding, SSO, SCIM, domene, kursstruktur) |
| **Migrasjonsassistanse** | Engangskjøp | Import av eksisterende kursinnhold, brukere og fullføringsdata fra annet LMS |

### Feature-flagging (implementert)
- [x] `TenantPlan` enum (`FREE`, `STANDARD`, `PLUS`, `ENTERPRISE`) i Prisma-schema
- [x] `Tenant.addons` string-array for tilleggstjenester
- [x] `Tenant.trialEndsAt` for prøveperiodehåndtering
- [x] `src/lib/features.ts` – sentralisert feature-gate med plan-hierarki, addon-sjekk, trial-sjekk
- [x] `tenantPlan` inkludert i JWT-session for klient/server tilgangssjekk
- [ ] UI-gating av admin-seksjoner basert på plan
- [ ] System-admin panel for å endre plan/addons per tenant

---

## Markedsnettsted (ikke startet)

- [ ] Forside med verdiforslag, "Bestill demo", whitelabel-profil
- [ ] "Security you can stand by"-seksjon
- [ ] Informasjonsside: flyt for domene, branding, SSO, SCIM, SCORM
- [ ] Prisside: pakkeoversikt (Standard / Plus / Enterprise)
- [ ] Kommersielle pakker: Managed Setup, Enterprise, tilleggstjenester

---

## Viktige regler for AI-agenter

> **Se `.github/copilot-instructions.md`** for fullstendig regelark inkludert branding-system, CSS-variabel-katalog og koderegler.

1. **Sjekk alltid `session.user.tenantId`** i alle server-side operasjoner.
2. **Middleware = kun `auth.config.ts`** – ingen Prisma/Node.js imports der.
3. **Server Actions** returnerer alltid `{ success: true }` eller `{ error: string }`.
4. **Ingen emojis i UI** – bruk `lucide-react`.
5. **CSS-variabler** for alle farger – aldri hardkode hex-koder i `.module.css` for temafarger.
6. **Prisma v7 = alltid adapter** – `new PrismaClient({ adapter })` i `src/lib/prisma.ts`.
7. **Type-oppdatering** – ved endringer i session, oppdater `src/types/next-auth.d.ts`.
