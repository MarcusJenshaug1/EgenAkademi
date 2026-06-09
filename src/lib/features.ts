/**
 * EgenAkademi – Feature Flags & Plan Gating
 * 
 * Sentralisert definisjon av hvilke features som er tilgjengelige
 * per plan og per addon. Brukes for å gate UI-seksjoner og API-ruter.
 */

import type { TenantPlan } from '@prisma/client'

// ── Plan-hierarki (høyere indeks = flere features) ──────
const PLAN_RANK: Record<TenantPlan, number> = {
  FREE: 0,
  STANDARD: 1,
  PLUS: 2,
  ENTERPRISE: 3,
}

// ── Features som er inkludert per plan ──────────────────
// Alle features i en lavere plan er automatisk inkludert i høyere planer
const PLAN_FEATURES: Record<TenantPlan, readonly string[]> = {
  FREE: [
    'core-lms',              // Grunnleggende kurskatalog og visning
    'org-name',              // Kun sette organisasjonsnavn (ingen farger/logo)
    'user-management',       // Grunnleggende brukerhåndtering
    'group-management',      // Grupper
  ],
  STANDARD: [
    'basic-branding',        // Farger (begrenset utvalg)
    'course-builder',        // Modulbasert kursbygger
    'course-assignment',     // Tildeling av kurs
    'progress-tracking',     // Progresjonssporing
    'basic-analytics',       // Grunnleggende statistikk
    'onboarding-programs',   // Onboarding-maler
    'session-events',        // Planlagte sesjoner
  ],
  PLUS: [
    'advanced-branding',     // Full branding (logo, favicon, fonter, alle 14 felter)
    'scorm',                 // SCORM 1.2 / 2004 import
    'custom-domain',         // Custom domene med TLS
    'advanced-analytics',    // Drill-down per avdeling/gruppe
    'csv-export',            // CSV-eksport for BI
    'course-versioning',     // Kursversjonering
    'escalation-logic',      // Påminnelser og eskalering
    'advanced-blocks',       // Audio, Kode, Sjekkliste, Embed blokker
  ],
  ENTERPRISE: [
    'sso-saml',              // SAML 2.0 SSO
    'scim',                  // SCIM 2.0 provisjonering
    'audit-logging',         // Full audit-logg
    'gamification',          // Poeng, badges, leaderboards
    'wiki',                  // Knowledge base
    'lti',                   // LTI 1.3 integrasjon
    'competency-management', // Ferdighetstaksonomi
    'ip-restrictions',       // IP-begrensninger
    'data-retention',        // GDPR-verktøy
    'webhooks',              // Event webhooks
    'interactive-blocks',    // Åpne oppgaver (krever instruktør-feedback)
  ],
} as const

// ── Addon-features (kjøpes separat, uavhengig av plan) ─
export const ADDON_FEATURES = {
  'brand-detector': 'Brand Detector – automatisk fargedeteksjon fra URL',
  'managed-setup': 'Managed Setup – vi konfigurerer alt for deg',
  'migration-assist': 'Migrasjonsassistanse – import fra annet LMS',
  'content-pro-pack': 'Content Pro – Alle avanserte innholdsblokker (Audio, Kode, Sjekkliste, Embed)',
  'interactive-learning-pack': 'Interaktiv Læring – Åpne oppgaver og sjekklister',
} as const

export type AddonKey = keyof typeof ADDON_FEATURES

// ── Hjelpefunksjoner ────────────────────────────────────

/**
 * Hent alle features tilgjengelig for en gitt plan (inkl. lavere planer)
 */
export function getFeaturesForPlan(plan: TenantPlan): string[] {
  const rank = PLAN_RANK[plan]
  const allFeatures: string[] = []
  
  for (const [p, features] of Object.entries(PLAN_FEATURES)) {
    if (PLAN_RANK[p as TenantPlan] <= rank) {
      allFeatures.push(...features)
    }
  }
  
  return allFeatures
}

/**
 * Sjekk om en tenant har tilgang til en feature basert på plan + addons
 */
export function hasFeature(
  plan: TenantPlan,
  addons: string[],
  feature: string
): boolean {
  // Sjekk plan-baserte features
  const planFeatures = getFeaturesForPlan(plan)
  if (planFeatures.includes(feature)) return true
  
  // Sjekk addon-baserte features
  if (addons.includes(feature)) return true
  
  return false
}

/**
 * Sjekk om en plan er minst på et gitt nivå
 */
export function hasPlanLevel(current: TenantPlan, required: TenantPlan): boolean {
  return PLAN_RANK[current] >= PLAN_RANK[required]
}

/**
 * Hent plan-rankingnivå (for sammenligning)
 */
export function getPlanRank(plan: TenantPlan): number {
  return PLAN_RANK[plan]
}

/**
 * Sjekk om trial har utløpt
 */
export function isTrialExpired(trialEndsAt: Date | null): boolean {
  if (!trialEndsAt) return false
  return new Date() > trialEndsAt
}

/**
 * Feature-gate for bruk i server components og actions
 */
export function checkAccess(
  tenant: { plan: TenantPlan; addons: string[]; trialEndsAt: Date | null },
  feature: string
): { allowed: boolean; reason?: string } {
  // Trial-sjekk
  if (isTrialExpired(tenant.trialEndsAt)) {
    return { allowed: false, reason: 'Prøveperioden har utløpt. Oppgrader for å fortsette.' }
  }
  
  if (hasFeature(tenant.plan, tenant.addons, feature)) {
    return { allowed: true }
  }
  
  // Finn hvilken plan som kreves
  const requiredPlan = getRequiredPlan(feature)
  if (requiredPlan) {
    return { 
      allowed: false, 
      reason: `Denne funksjonen krever ${requiredPlan}-planen eller høyere.` 
    }
  }
  
  // Sjekk om det er en addon
  if (feature in ADDON_FEATURES) {
    return { 
      allowed: false, 
      reason: `Denne funksjonen krever tillegget "${ADDON_FEATURES[feature as AddonKey]}".` 
    }
  }
  
  return { allowed: false, reason: 'Ingen tilgang til denne funksjonen.' }
}

/**
 * Finn hvilken plan som kreves for en feature
 */
function getRequiredPlan(feature: string): TenantPlan | null {
  for (const plan of ['FREE', 'STANDARD', 'PLUS', 'ENTERPRISE'] as TenantPlan[]) {
    if (PLAN_FEATURES[plan].includes(feature)) return plan
  }
  return null
}

// ── Blokktype → Feature-mapping ─────────────────────────

/**
 * Mapper hver BlockType til den feature-flaggen som kreves.
 * Brukes for å gate hvilke blokker en tenant kan bruke i kursbyggeren.
 *
 * Plan-fordeling:
 * - STANDARD (course-builder): TEXT, IMAGE, VIDEO, DOCUMENT, DIVIDER, CALLOUT, QUIZ
 * - PLUS (advanced-blocks): EMBED, AUDIO, CODE, CHECKLIST
 * - ENTERPRISE (interactive-blocks): OPEN_RESPONSE
 *
 * Addon-overstyrelser:
 * - content-pro-pack: Gir tilgang til advanced-blocks uavhengig av plan
 * - interactive-learning-pack: Gir tilgang til interactive-blocks + advanced-blocks (CHECKLIST)
 */
export const BLOCK_PLAN_MAP: Record<string, string> = {
  TEXT: 'course-builder',
  IMAGE: 'course-builder',
  VIDEO: 'course-builder',
  DOCUMENT: 'course-builder',
  DIVIDER: 'course-builder',
  CALLOUT: 'course-builder',
  QUIZ: 'course-builder',
  EMBED: 'advanced-blocks',
  AUDIO: 'advanced-blocks',
  CODE: 'advanced-blocks',
  CHECKLIST: 'advanced-blocks',
  OPEN_RESPONSE: 'interactive-blocks',
}

/**
 * Sjekk om en tenant kan bruke en gitt blokktype.
 * Sjekker plan-features OG addon-pakker.
 */
export function canUseBlockType(
  plan: TenantPlan,
  addons: string[],
  blockType: string
): boolean {
  const requiredFeature = BLOCK_PLAN_MAP[blockType]
  if (!requiredFeature) return false

  // Sjekk plan-basert tilgang
  if (hasFeature(plan, addons, requiredFeature)) return true

  // Sjekk addon-pakker som gir blokktyper
  if (requiredFeature === 'advanced-blocks') {
    if (addons.includes('content-pro-pack')) return true
    // interactive-learning-pack inkluderer CHECKLIST
    if (blockType === 'CHECKLIST' && addons.includes('interactive-learning-pack')) return true
  }
  if (requiredFeature === 'interactive-blocks') {
    if (addons.includes('interactive-learning-pack')) return true
  }

  return false
}

/**
 * Hent alle tilgjengelige blokktyper for en tenant.
 * Returnerer en liste med BlockType-strenger.
 */
export function getAvailableBlockTypes(
  plan: TenantPlan,
  addons: string[]
): string[] {
  return Object.keys(BLOCK_PLAN_MAP).filter(
    (blockType) => canUseBlockType(plan, addons, blockType)
  )
}

/**
 * Hent info om hvilken plan som kreves for en blokktype.
 * Returnerer plan-navn og addon-alternativ for UI.
 */
export function getBlockUpgradeInfo(blockType: string): {
  requiredPlan: TenantPlan | null
  addonAlternative: string | null
} {
  const feature = BLOCK_PLAN_MAP[blockType]
  if (!feature) return { requiredPlan: null, addonAlternative: null }

  const plan = getRequiredPlan(feature)
  let addon: string | null = null

  if (feature === 'advanced-blocks') addon = 'content-pro-pack'
  if (feature === 'interactive-blocks') addon = 'interactive-learning-pack'

  return { requiredPlan: plan, addonAlternative: addon }
}

// ── Plan-metadata for UI ────────────────────────────────
export const PLAN_INFO: Record<TenantPlan, {
  label: string
  description: string
  price: string     // Visningspris
  highlight: boolean // Anbefalt plan
}> = {
  FREE: {
    label: 'Free',
    description: 'Prøv EgenAkademi gratis. Perfekt for å komme i gang.',
    price: 'Gratis',
    highlight: false,
  },
  STANDARD: {
    label: 'Standard',
    description: 'Alt du trenger for kursadministrasjon og brukeropplæring.',
    price: 'Kontakt oss',
    highlight: false,
  },
  PLUS: {
    label: 'Plus',
    description: 'Avansert branding, SCORM, custom domene og analytics.',
    price: 'Kontakt oss',
    highlight: true,
  },
  ENTERPRISE: {
    label: 'Enterprise',
    description: 'Full kontroll med SSO, SCIM, gamification og compliance.',
    price: 'Kontakt oss',
    highlight: false,
  },
}
