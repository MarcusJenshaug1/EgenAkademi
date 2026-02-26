# Copilot Instructions for EgenAkademi

## Prosjektbeskrivelse
EgenAkademi er en **whitelabel LMS-plattform** (Learning Management System) bygget med Next.js App Router. Plattformen støtter full merkevare-tilpasning per organisasjon (tenant) via et komplett CSS-variabel-basert branding-system.

---

## Prioritetsregler (høyest først)
1. **Sikkerhet og autentisering** — alltid sjekk `session.user.tenantId`.
2. **Branding-systemet** — ALLE farger via CSS-variabler, ALDRI hardkodede hex/rgba.
3. **Type-sikkerhet** — Prisma-typer og TypeScript-kontrakter gjelder.
4. **WCAG AA kontrast** — minimum 4.5:1 for tekst, 3.0:1 for interaktive elementer.
5. **Ytelse** — server-side rendering foretrekkes, `'use client'` kun der nødvendig.

---

## Teknisk stack

| Lag | Teknologi |
|---|---|
| Framework | Next.js 16+ (App Router, Turbopack) |
| Database | PostgreSQL via Neon.tech (serverless) |
| ORM | Prisma v7 med `@prisma/adapter-pg` + `pg` |
| Auth | Auth.js v5 (NextAuth) – Magic Links via Nodemailer |
| Styling | CSS Modules + CSS Custom Properties |
| Ikoner | `lucide-react` — ALDRI emojis i UI |

---

## Arbeidskommandoer
- **Dev:** `npm run dev`
- **Build:** `npm run build`
- **Lint:** `npm run lint`
- **Prisma migrering:** `npx prisma migrate dev`
- **Prisma generering:** `npx prisma generate`

---

## Repo-struktur

```
.github/
  copilot-instructions.md  ← Dette dokumentet
  agents/
    code-reviewer.md       ← AI-agent for kodegjennomgang
.knowledge/                ← BASB kunnskapssystem
src/
  auth.config.ts           ← Edge-kompatibel auth-konfig (middleware)
  auth.ts                  ← Full auth-konfig med Prisma + Nodemailer
  middleware.ts            ← Route-beskyttelse (importerer KUN auth.config)
  app/
    globals.css            ← Root CSS-variabler (branding defaults)
    layout.tsx             ← Server-side branding CSS-injeksjon
    page.tsx               ← Landing page
    actions/
      brandingActions.ts   ← Lagring/reset av branding
      courseActions.ts      ← Kurs CRUD, taksonomi, katalog
      courseBuilderActions.ts ← Modul/leksjon CRUD, versjonering
      groupActions.ts       ← Gruppe-operasjoner
      learnerActions.ts     ← Dashboard, progresjon, player-data
      profileActions.ts     ← Profil-oppdatering
      roleActions.ts        ← Rolle-endringer
      tenantActions.ts      ← Tenant-opprettelse
      userActions.ts        ← Bruker CRUD
    admin/
      layout.tsx           ← Admin shell: sidebar + topbar
      NavLink.tsx          ← Client component for aktive sidebar-lenker
      page.tsx             ← Dashboard med statistikk
      branding/            ← Tema & Branding admin-side
      courses/             ← Kurskatalog, kursdetalj, kursbygger
        [courseId]/         ← Dynamisk kursdetalj med faner
      groups/              ← Gruppeadministrasjon
      users/               ← Brukeradministrasjon
      roles/               ← Rolle- og tilgangsvisning
      profile/             ← Admin-profil
    api/
      auth/                ← Auth.js API-ruter
      detect-brand/        ← Brand Detector API
      upload/              ← Filopplasting API
    learn/
      layout.tsx           ← Learner shell: sidebar + navigasjon
      page.tsx             ← Learner dashboard
      DashboardClient.tsx  ← Dashboard med kurs-kort, statistikk
      courses/             ← Kurskatalog for elever
        [courseId]/         ← Kursdetalj + kursspiller
      my-learning/         ← Mine kurs med filter og søk
      certificates/        ← Utstedte sertifikater
      notifications/       ← Varsler med filter og merk-som-lest
      profile/             ← Elevprofil med redigerbart skjema
    login/                 ← Magic Link innlogging
    onboarding/            ← Organisasjonsopprettelse for nye brukere
  components/
    Providers.tsx          ← SessionProvider wrapper
    ConfirmDialog.tsx      ← Gjenbrukbar bekreftelsesdialog
    LexicalEditor/         ← Rik tekst-editor (Lexical)
      RichTextEditor.tsx   ← Hovedkomponent
      ToolbarPlugin.tsx    ← Verktøylinje
  lib/
    prisma.ts              ← Prisma singleton med pg-adapter
    brandingGenerator.ts   ← 5-rolle → 14-felt palett-generator med WCAG
    colorUtils.ts          ← Kontrast- og fargeberegninger
    features.ts            ← Feature flags og plan-gating
    groupColors.ts         ← Farger for grupper
  types/
    next-auth.d.ts         ← Session type-utvidelser (id, tenantId, globalRole, tenantPlan)
prisma/
  schema.prisma            ← Database-schema med 20+ modeller
PROJECT_MANIFEST.md        ← Implementeringsstatus og veikart
```

---

## 🎨 BRANDING-SYSTEM (KRITISK — LES DETTE)

### Arkitektur
1. **Database:** `Tenant`-modellen har 14 fargefelter + logo/favicon/font-felter.
2. **CSS-injeksjon:** `src/app/layout.tsx` leser tenant-branding fra DB og injiserer som `<style>` tag med CSS custom properties i `<html>`.
3. **Defaults:** `src/app/globals.css` definerer `:root`-variabler som fallback.
4. **Generator:** `src/lib/brandingGenerator.ts` genererer alle 14 felter fra 5 roller med WCAG-kontrastsjekk.

### CSS-variabel-katalog (komplett)

| CSS-variabel | Bruk | DB-felt |
|---|---|---|
| `--color-bg-primary` | Hovedbakgrunn | `colorBgPrimary` |
| `--color-bg-secondary` | Kort, paneler, sidebar | `colorBgSecondary` |
| `--color-bg-surface` | *Avledet* — subtil overflate | — |
| `--color-text-primary` | Overskrifter, brødtekst | `colorTextPrimary` |
| `--color-text-secondary` | Labels, metadata, hjelpetekst | `colorTextSecondary` |
| `--color-border` | Kanter, skillelinjer | `colorBorder` |
| `--color-accent-blue` | Lenker, fokus, valgte elementer | `colorAccent` |
| `--color-accent-glow` | *Avledet* — glow/shadow-effekter | — |
| `--gradient-primary` | *Avledet* — gradient for badges/hero | — |
| `--color-button-primary` | Primærknapp bakgrunn | `colorButtonPrimary` |
| `--color-button-text` | Primærknapp tekst | `colorButtonText` |
| `--color-topbar-bg` | *Avledet* — topbar bakgrunn | — |
| `--color-topbar-text` | *Avledet* — topbar tekst | — |
| `--color-sidebar-bg` | Sidebar bakgrunn | `colorSidebarBg` |
| `--color-sidebar-text` | Sidebar menypunkter | `colorSidebarText` |
| `--color-sidebar-active` | Aktiv sidebar-lenke | `colorSidebarActive` |
| `--color-sidebar-hover-bg` | *Avledet* — hover-bakgrunn (lys/mørk-aware) | — |
| `--color-sidebar-hover-text` | *Avledet* — hover-tekst | — |
| `--color-success` | Suksessmeldinger | `colorSuccess` |
| `--color-warning` | Advarsler | `colorWarning` |
| `--color-danger` | Feil og destruktive handlinger | `colorDanger` |

### Avledede variabler
Disse beregnes automatisk i `layout.tsx` basert på tenant-verdier:
- `--color-bg-surface` — `rgba(textPrimary, 0.03)`
- `--color-accent-glow` — `rgba(accent, 0.15)`
- `--gradient-primary` — `linear-gradient(135deg, accent, hue-shifted)`
- `--color-topbar-bg` — `rgba(bgPrimary, 0.8)`
- `--color-topbar-text` — `textPrimary`
- `--color-sidebar-hover-bg/text` — luminansebasert: lyse sidebarer mørkner, mørke lysner

### 🚨 ABSOLUTTE REGLER FOR BRANDING

1. **ALDRI hardkod hex/rgba farger** i `.module.css` eller inline styles for tematiske elementer.
   - ✅ `color: var(--color-text-primary)`
   - ✅ `background: color-mix(in srgb, var(--color-accent-blue) 10%, transparent)`
   - ❌ `color: #ffffff`
   - ❌ `background: rgba(59, 130, 246, 0.1)`

2. **Bruk `color-mix()` for alpha-blending** med CSS-variabler:
   ```css
   background: color-mix(in srgb, var(--color-accent-blue) 10%, transparent);
   border: 1px solid color-mix(in srgb, var(--color-accent-blue) 20%, transparent);
   ```

3. **Sidebar-kontekst:** Elementer inne i sidebaren SKAL bruke `--color-sidebar-*`-variabler, IKKE `--color-text-*`.
   - ✅ `.navSection { color: var(--color-sidebar-text); opacity: 0.6; }`
   - ❌ `.navSection { color: var(--color-text-secondary); }`

4. **Nye CSS-filer:** Alle nye `.module.css`-filer SKAL kun bruke `var(--color-*)` for farger.

5. **Unntak:** Nøytrale bakgrunner for forhåndsvisning (f.eks. logo preview med sjakkmønster) KAN bruke faste farger for å sikre synlighet uavhengig av tema.

6. **Ved nye fargefelter:**
   - Legg til felt i `prisma/schema.prisma` → `Tenant`-modellen
   - Legg til mapping i `CSS_VAR_MAP` i `src/app/layout.tsx`
   - Legg til default i `src/app/globals.css`
   - Legg til felt i `BrandingData` interface i `BrandingForm.tsx`
   - Legg til i `BRANDING_FIELDS` i `brandingActions.ts`
   - Legg til i `SECTIONS` array i `BrandingForm.tsx`
   - Oppdater generator i `brandingGenerator.ts`

---

## Sikkerhetsregler for AI-generert kode (KRITISK)

AI-assistenter introduserer ofte sikkerhetshull. Disse reglene er UFRAVIKELIGE:

### 1. ALDRI la CORS stå åpen
- ALDRI sett CORS til `"*"` (tillat alle domener).
- Konfigurer CORS til KUN å tillate forespørsler fra produksjonsdomener definert i `.env` (variabel: `ALLOWED_ORIGINS`, støtter kommaseparerte domener).
- Oppdater `.env.example` med `ALLOWED_ORIGINS=https://example.com,https://app.example.com`.

### 2. Valider alle redirects
- ALDRI redirect brukere til en vilkårlig URL fra query-parametere (f.eks. `?redirect=evil.com`).
- Valider alle redirect-URL-er mot en allowlist før redirect.
- Tillatte redirect-domener defineres i `.env` (variabel: `ALLOWED_REDIRECT_HOSTS`).
- Oppdater `.env.example` med `ALLOWED_REDIRECT_HOSTS=localhost,example.com`.

### 3. Lås ned fillagring / storage
- ALDRI gjør hele storage-bucketen offentlig.
- Sett RLS-policyer / tilgangskontroll slik at brukere kun kan aksessere filer de selv har lastet opp.
- Unntak krever eksplisitt begrunnelse (f.eks. publiserte profilbilder som skal være åpne).

### 4. Fjern debug-statements før deploy
- ALDRI la `console.log()` med brukerdata, tokens, eller sensitiv info stå i produksjonskode.
- Erstatt med proper error logging (server-side only) før deploy.
- Kjør søk etter `console.log` før bygg og fjern alle instanser.

### 5. Alltid verifiser webhooks
- ALDRI prosesser webhook-data uten å verifisere signaturen.
- For Stripe: bruk `stripe.webhooks.constructEvent()` med webhook secret.
- For andre tjenester: verifiser HMAC-signatur med tjenestens SDK før noe prosesseres.

### 6. Sjekk tilganger server-side
- Å skjule en knapp i UI-et er IKKE tilgangskontroll.
- HVER beskyttet rute/server action SKAL sjekke `user.role` / `user.tenantId` på serveren før utførelse.
- ALDRI stol på client-side rollesjekker alene.

### 7. Hold dependencies oppdatert
- AI kan scaffolde med utdaterte pakker med kjente sårbarheter.
- Etter scaffolding / nye pakker: kjør `npm audit fix` og sjekk for breaking changes.
- Oppdater til nyeste stabile versjoner med mindre det er en dokumentert grunn til å la være.

### 8. Rate-limit sensitive endepunkter
- Legg til rate limiting på passord-reset, innlogging, og andre sensitive ruter.
- Standard: maks 3 forespørsler per e-post per time for passord-reset.
- Konfigurerbart via `.env` (variabler: `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`).
- Oppdater `.env.example` med disse variablene.

### 9. ALDRI vis råe feilmeldinger til brukere
- ALDRI returner stack traces, filstier, eller interne feilmeldinger til klienten.
- Catch alle feil og returner generiske feilmeldinger (f.eks. `"Noe gikk galt"`).
- Logg den fulle feilen server-side for debugging.

### 10. Sett session-utløp
- ALDRI konfigurer auth slik at brukere er innlogget for alltid.
- Sett JWT-utløp til 7 dager (konfigurerbar via `.env`: `SESSION_MAX_AGE_DAYS`).
- Implementer refresh token-rotasjon der det er mulig.
- Oppdater `.env.example` med `SESSION_MAX_AGE_DAYS=7`.

---

## Auth-arkitektur

### Edge-safe splitting
- `src/auth.config.ts` → Edge-kompatibel konfig (middleware).
- `src/auth.ts` → Full konfig med Prisma + Nodemailer (Node.js).
- `src/middleware.ts` → Importerer KUN fra `auth.config.ts`.

### Session-data
JWT inneholder: `id`, `tenantId`, `globalRole`.
Roller: `USER`, `TENANT_ADMIN`, `SYSTEM_ADMIN`.

### Ruting
```
/login → Magic Link → /onboarding (hvis ny) → /admin
```

---

## Server Actions
Alle server actions SKAL følge dette mønsteret:
```ts
'use server';
export async function myAction(formData: FormData) {
    const session = await auth();
    if (!session?.user?.tenantId) return { error: 'Ikke autentisert' };
    // ... operasjon
    return { success: true };
}
```

---

## Database
- **Prisma v7** krever `@prisma/adapter-pg` + `pg` pool.
- Singleton i `src/lib/prisma.ts`.
- Ved schema-endringer: `npx prisma migrate dev --name <beskrivelse>`.

---

## UI-standarder

### Ikoner
- ALLTID `lucide-react` — ALDRI emojis (✏️, ✕, ← osv.).
- Import: `import { IconName } from 'lucide-react'`.

### Komponenter
- Server Components som standard; `'use client'` kun for interaktivitet.
- CSS Modules for styling (`.module.css`).
- Alle farger via CSS-variabler (se branding-regler ovenfor).

### Tilgjengelighet
- WCAG AA kontrast (4.5:1 tekst, 3.0:1 interaktive).
- Tydelige focus states med `outline` eller `box-shadow`.
- `aria-label` på ikonknapper.

---

## UI-komponentbibliotek og Storybook

Prosjektet SKAL opprettholde et gjenbrukbart, dokumentert komponentbibliotek. Storybook er planlagt som kanonisk arbeidsflate for UI-utvikling, gjennomgang, gjenbruk, tilgjengelighetskontroll og dokumentasjon.

> **Merk:** Storybook er IKKE satt opp ennae. Nar det settes opp, gjelder disse reglene.

### Komponentbibliotek-regler

1. **Gjenbruk foer nytt:** Foer du bygger en ny UI-seksjon eller komponent, sjekk eksisterende komponenter og Storybook-stories for gjenbrukbare primitiver, monstre og layouter.
2. **Aldri bygg enkelt-bruk UI nar biblioteket burde eie monsteret.** Hvis et monster er gjenbrukbart pa mer enn een skjerm, hoerer det hjemme i komponentbiblioteket.
3. **Foretrekk komposisjon over duplisering.** Utvid komponenter med props, varianter og komposisjon foer du oppretter parallelle komponenter.
4. **Trenger du en ny knappevariant? Legg til en variant, ikke en ny komponent.** Hvis en eksisterende komponent dekker 80% av brukstilfellet, utvid den med en ny variant.
5. **Bruk kun designtokens.** Aldri hardkod farger, spacing, radii eller skygger i gjenbrukbare komponenter.
6. **Bruk semantisk navngivning.** Komponenter, props, varianter og tokens skal beskrive formal, ikke bare utseende.

### Storybook-regler (nar satt opp)

1. Storybook er obligatorisk for alle gjenbrukbare UI-komponenter.
2. Autodocs maa vaere aktivert globalt.
3. Hver ny gjenbrukbar komponent MAA ha sin egen story-fil.
4. Hver endret gjenbrukbar komponent MAA faa oppdaterte stories.
5. Stories skal reflektere ekte bruk, ikke lekeeksempler.

### Paakrevd story-dekning

Hver gjenbrukbar komponent boer inkludere stories for alle relevante tilstander:
- Default, Varianter, Stoerrelser, Loading, Tom, Feil, Deaktivert
- Hover, Focus-visible, Valgt/aktiv
- Langt innhold / overflow, Responsiv layout
- Moerk modus (stoeettes via CSS-variabler)

### Arbeidsflyt for ny UI-seksjon

1. Sjekk eksisterende komponenter og Storybook
2. List gjenbrukbare komponenter som allerede loeser deler av problemet
3. Identifiser mangler som krever ny gjenbrukbar komponent
4. Bygg seksjonen med eksisterende komponenter foerst
5. Hvis ny komponent er noedvendig: opprett, eksporter, legg til stories, dokumenter
6. Hvis eksisterende komponent trenger ny variant: utvid den, IKKE opprett ny komponent
7. Oppdater tokens hvis et manglende semantisk token er det egentlige gapet
8. Verifiser kontrast og tastaturnavigasjon

---

## Markdown-formatering (KRITISK)

Alle `.md`-filer i dette prosjektet SKAL rendres korrekt i VS Code Markdown Preview.

### Code fence-regler

1. **ALDRI nest ` ``` ` inne i ` ``` `.** Markdown-parsere matcher det innerste ` ``` ` med det ytterste og ødelegger all formatering.
2. **Ved nesting:** Bruk **4+ backticks** på ytre blokk, 3 backticks på indre:
   - Ytre: ` ```` ` eller ` ````` `
   - Indre: ` ``` `
3. **Hvert nivå med nesting krever ett ekstra backtick.** Tre nivåer = ` ````` ` > ` ```` ` > ` ``` `.
4. **Valider alltid** at antall åpne fences = antall lukkede fences, og at nesting-nivåene er korrekte.
5. **Test i Preview** etter endringer i `.md`-filer med code blocks — spesielt filer som inneholder markdown-maler (templates med code block-eksempler).

### Andre markdown-regler

6. **Konsistent heading-hierarki:** Ikke hopp over nivåer (`##` etter `#`, `###` etter `##`).
7. **Blank linje** før og etter headings, code blocks, tabeller og lister.
8. **Tabeller:** Bruk `|---|` separator-rad. Alle rader skal ha samme antall kolonner.
9. **Ingen emojis** i dokumentasjon — bruk ren tekst (`[x]`/`[ ]` for status).

---

## Knowledge Management System (BASB)

Prosjektet bruker et kunnskapshåndteringssystem basert på Tiago Fortes "Building a Second Brain" (PARA + CODE + Eisenhower+ICE prioritering). Alt ligger i `.knowledge/`-mappen.

### Før du starter arbeid:
1. **Les `.knowledge/priorities.md`** — gjeldende prioriteringer med ICE-scoring
2. **Les siste daglige notat** i `.knowledge/daily/` — kontekst fra forrige sesjon
3. **Les relevant prosjektfil** i `.knowledge/projects/` — aktiv prosjektstatus

### Under arbeid:
1. **Logg viktige beslutninger** i dagens daglige notat
2. **Logg problemer og løsninger** i "Work Log"
3. **Oppdater prosjektfiler** når scope eller status endres
4. **Fang ny informasjon** i riktig PARA-plassering

### Etter fullført arbeid:
1. **Oppdater daglig notat** med oppsummering
2. **Oppdater `priorities.md`** hvis prioriteringer endret seg
3. **Oppdater prosjektfil** med ny status
4. **Legg til "Tomorrow / Next Session"** notater for kontinuitet
5. **Oppdater `PROJECT_MANIFEST.md`** — flytt items fra ❌ til ✅

### Filstruktur:
```
.knowledge/
├── SYSTEM.md              ← Systemregler (les dette for detaljer)
├── inbox.md               ← Hurtigfangst
├── priorities.md          ← Eisenhower-matrise + ICE-scoring
├── daily/                 ← Daglige arbeidsnotater
│   └── YYYY/
│       └── MM - MonthName/
│           └── YYYY-MM-DD.md
├── projects/              ← Aktive prosjekter
├── areas/                 ← Løpende ansvarsområder
├── resources/             ← Referansemateriale
└── archive/               ← Fullførte/inaktive elementer
```

---

## Viktige regler for AI-agenter
1. **Les dette dokumentet** FØR du gjør endringer.
2. **Les `.knowledge/priorities.md` og siste daglige notat** FØR du starter arbeid.
3. **Sjekk `PROJECT_MANIFEST.md`** for fullstendig implementeringsstatus — gå gjennom ALLE seksjoner og sjekk hva som er ferdig (✅), hva som er neste (❌), og hva som er delvis.
4. **Etter fullført oppgave:** Oppdater daglig notat, priorities.md, og foreslå neste steg.
5. **ALDRI hardkod farger** — bruk CSS-variabler (se branding-system).
6. **ALDRI bruk emojis** i kode — bruk `lucide-react`.
7. **Middleware = kun `auth.config.ts`** — ingen Prisma/Node.js.
8. **Server Actions** returnerer `{ success: true }` eller `{ error: string }`.
9. **Prisma v7 = alltid adapter** i `src/lib/prisma.ts`.
10. **Ved type-endringer i session** → oppdater `src/types/next-auth.d.ts`.
11. **Oppdater `PROJECT_MANIFEST.md`** når oppgaver fullføres — flytt items fra ❌ til ✅.
12. **Logg alle viktige beslutninger** i `.knowledge/resources/decisions.md`.
13. **ALDRI nest ` ``` ` inne i ` ``` `** — bruk 4+ backticks på ytre blokk (se Markdown-formatering).
14. **Valider markdown-rendering** etter endringer i `.md`-filer med code blocks.
15. **ALDRI sett CORS til `*`** — bruk allowlist fra `.env` (se Sikkerhetsregler).
16. **ALDRI redirect til ukjente URL-er** — valider mot allowlist (se Sikkerhetsregler).
17. **ALDRI gjør storage-buckets offentlige** uten eksplisitt begrunnelse.
18. **ALDRI returner stack traces til klienten** — logg server-side, vis generisk feil.
19. **Fjern ALLE `console.log`-statements** før deploy.
20. **Verifiser webhook-signaturer** før prosessering av data.
21. **Sjekk tilganger server-side** på HVER beskyttet rute — UI-skjuling er ikke sikkerhet.
22. **Sjekk ALLTID eksisterende Storybook-stories og delte komponenter** før du oppretter ny UI.
23. **ALDRI legg til en gjenbrukbar komponent** uten å opprette eller oppdatere dens Storybook-stories.
24. **Hold Autodocs aktivert og oppdatert** for gjenbrukbar UI.
25. **ALDRI hardkod fargeverdier** i gjenbrukbare komponenter når semantiske tokens finnes.
26. **ALLTID verifiser WCAG AA kontrast** og synlig tastaturfokus for hver ny eller endret UI-komponent.
27. **Foretrekk å utvide komponentbiblioteket** (nye varianter, props, stories) fremfor å lage sidesspesifikk engangs-UI.
