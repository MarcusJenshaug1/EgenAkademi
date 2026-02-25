# EgenAkademi – Whitelabel LMS: Project Manifest & Status

> **For AI-agenter og utviklere:** Dette dokumentet er kilden til sannhet for teknisk arkitektur, designregler, fullstendig kravstatus og veikart. Les dette FØR du gjør endringer.

---

## 🛠 Teknisk Stack

| Lag | Teknologi |
|---|---|
| Framework | Next.js 15+ (App Router, Turbopack) |
| Database | PostgreSQL via **Neon.tech** (serverless) |
| ORM | **Prisma v7** – MÅ bruke `@prisma/adapter-pg` + `pg`-pakken |
| Auth | **Auth.js v5 (NextAuth beta)** – Magic Links via Nodemailer SMTP |
| Styling | Vanilla CSS + CSS Modules (glassmorphism, dark mode) |
| Ikoner | **`lucide-react`** — ALDRI emojis |
| Typografi | System font stack (kan utvides til Sana Sans / Inter) |

---

## 🎨 Designregler (OBLIGATORISKE)

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

## 🏗 Arkitektur – Viktige mønstre

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

## ✅ Fullstendig Implementeringsstatus

### ✅ Ferdig implementert

#### Fundament
- [x] Next.js 15 prosjektoppsett med TypeScript og Turbopack
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

---

### ✅ Fullstendig gjennomført (branding separat)

- [~] **Dynamisk CSS-injeksjon:** ~~Fargene injiseres ikke dynamisk~~ → **FERDIG.** Server-side CSS-variabel-injeksjon fra database i `src/app/layout.tsx`. Alle 14 felter + 7 avledede variabler.

---

### ❌ Ikke startet (prioritert rekkefølge)

#### Fase 1 – Kjernefunksjonalitet (MVP)

**Whitelabel & Branding**
- [x] Dynamisk CSS-variabel-injeksjon fra database til `<html style="">` per Tenant *(ferdig)*
- [ ] Custom domain / subdomain støtte (DNS-verifisering, CNAME, auto-TLS)
- [ ] Domain status-panel for administrator

**Læringsadministrasjon**
- [ ] Kurskatalog (kategorier, tags, målgruppe, varighet, type)
- [ ] Kursbygger (modulbasert: tekst, bilde, video, quiz, dokument)
- [ ] SCORM 1.2 / 2004 import og runtime (imsmanifest.xml, JS API)
- [ ] Kursversjonering (uten å ødelegge fullføringshistorikk)
- [ ] Tildeling av kurs til org, grupper, roller eller enkeltpersoner
- [ ] Frister og gjentakelse / resertifisering
- [ ] Eskaleringslogikk (påminnelser til bruker → leder/HR)

**Planlagte sesjoner & Events**
- [ ] Opprette sesjoner (dato, tid, kapasitet, sted/lenke, instruktør)
- [ ] Påmelding, venteliste, avmelding, fremmøteregistrering
- [ ] Automatiske varsler (invitasjon, påminnelse, endring, "no show")
- [ ] Intern arrangementskalender

**Brukeradministrasjon**
- [ ] CRUD for brukere i admin (`/admin/users`)
- [ ] Gruppe-administrasjon (`/admin/groups`)
- [ ] Dynamiske grupper (regelbasert, fra attributter)
- [ ] Individuelle brukerprofiler med ferdighetsprofil

**Progresjon & Analytics**
- [ ] Progresjonssporing per kurs per bruker
- [ ] Fullføringsstatus og -dato
- [ ] Sanntidsnær admin-dashboard (aktive læringsløp, fristbrudd)
- [ ] Drill-down per avdeling/gruppe/rolle
- [ ] CSV-eksport / API for BI-uttrekk (brukere, kurs, fullføringer, testresultater)

**Onboarding-programmer**
- [ ] Malbibliotek ("Nyansatt", "Ny leder", "Sikkerhet og IT", "Compliance")
- [ ] Automatisk tildeling ved brukeropprettelse eller gruppeendring
- [ ] Tidsgjennomføring ("uke 1/uke 2/uke 4")

#### Fase 2 – Enterprise & Integrasjoner

**Identitet & SSO**
- [ ] SAML 2.0 Service Provider (IdP metadata-import, attributt-mapping)
- [ ] SCIM 2.0 API (opprettelse, oppdatering, deaktivering av brukere og grupper)
- [ ] Token-basert autentisering for SCIM-endepunkter
- [ ] "Sertifiserte oppsett" (playbooks) for Microsoft, Google, Okta

**Sikkerhet & Logging**
- [ ] Audit-logging (innlogging, rolleendringer, tildelinger, eksport, integrasjonsendringer)
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

**LMS-integrasjoner**
- [ ] LTI 1.3 for tredjepartsverktøy
- [ ] Webhooks / event stream (user.created, course.completed, etc.)
- [ ] Versjonerte eksportskjemaer for BI-pipeline

---

## 💰 Prismodell & Tilleggstjenester

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

### Feature-flagging (implementeres)
- Custom branding-seksjonen i admin vises kun for tenants med `plan >= 'plus'`
- Brand Detector vises kun for tenants med `addons.includes('brand-detector')`
- System-admin kan aktivere/deaktivere features per tenant

> **TODO:** Implementer `Tenant.plan` enum (`STANDARD`, `PLUS`, `ENTERPRISE`) og `Tenant.addons` string-array i Prisma-skjemaet. Gate UI-seksjoner basert på disse feltene.

---

## 🌐 Markedsnettsted (ikke startet)

- [ ] Forside med verdiforslag, "Bestill demo", whitelabel-profil
- [ ] "Security you can stand by"-seksjon
- [ ] Informasjonsside: flyt for domene, branding, SSO, SCIM, SCORM
- [ ] Prisside: pakkeoversikt (Standard / Plus / Enterprise)
- [ ] Kommersielle pakker: Managed Setup, Enterprise, tilleggstjenester

---

## 🔑 Viktige regler for AI-agenter

> **Se `.github/copilot-instructions.md`** for fullstendig regelark inkludert branding-system, CSS-variabel-katalog og koderegler.

1. **Sjekk alltid `session.user.tenantId`** i alle server-side operasjoner.
2. **Middleware = kun `auth.config.ts`** – ingen Prisma/Node.js imports der.
3. **Server Actions** returnerer alltid `{ success: true }` eller `{ error: string }`.
4. **Ingen emojis i UI** – bruk `lucide-react`.
5. **CSS-variabler** for alle farger – aldri hardkode hex-koder i `.module.css` for temafarger.
6. **Prisma v7 = alltid adapter** – `new PrismaClient({ adapter })` i `src/lib/prisma.ts`.
7. **Type-oppdatering** – ved endringer i session, oppdater `src/types/next-auth.d.ts`.
