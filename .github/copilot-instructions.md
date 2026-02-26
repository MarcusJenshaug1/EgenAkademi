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
src/
  app/
    globals.css          ← Root CSS-variabler (branding defaults)
    layout.tsx           ← Server-side branding CSS-injeksjon
    admin/
      layout.tsx         ← Admin shell: sidebar + topbar
      NavLink.tsx        ← Client component for active link highlighting
      branding/          ← Tema & Branding admin-side
        BrandingForm.tsx ← Hovedskjema for alle branding-felter
        page.tsx         ← Server page, loader tenant-data
    actions/
      brandingActions.ts ← Server actions for lagring/reset av branding
      tenantActions.ts   ← Server action for tenant-opprettelse
    login/               ← Magic Link innlogging
    onboarding/          ← Organisasjonsopprettelse for nye brukere
  components/
    Providers.tsx        ← SessionProvider wrapper
  lib/
    prisma.ts            ← Prisma singleton med pg-adapter
    brandingGenerator.ts ← 5-rolle → 14-felt palett-generator med WCAG
    colorUtils.ts        ← Kontrast- og fargeberegninger
  types/
    next-auth.d.ts       ← Session type-utvidelser
prisma/
  schema.prisma          ← Database-schema med Tenant branding-felter
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

## Viktige regler for AI-agenter
1. **Les dette dokumentet** FØR du gjør endringer.
2. **Sjekk `PROJECT_MANIFEST.md`** for fullstendig implementeringsstatus — gå gjennom ALLE seksjoner og sjekk hva som er ferdig (✅), hva som er neste (❌), og hva som er delvis.
3. **Etter fullført oppgave:** Foreslå alltid neste naturlige steg fra `PROJECT_MANIFEST.md` sin prioriterte liste.
4. **ALDRI hardkod farger** — bruk CSS-variabler (se branding-system).
5. **ALDRI bruk emojis** i kode — bruk `lucide-react`.
6. **Middleware = kun `auth.config.ts`** — ingen Prisma/Node.js.
7. **Server Actions** returnerer `{ success: true }` eller `{ error: string }`.
8. **Prisma v7 = alltid adapter** i `src/lib/prisma.ts`.
9. **Ved type-endringer i session** → oppdater `src/types/next-auth.d.ts`.
10. **Oppdater `PROJECT_MANIFEST.md`** når oppgaver fullføres — flytt items fra ❌ til ✅.
