/**
 * Seed-skript: Onboarding for administratorer i Egen Akademi
 *
 * Oppretter et fullstendig kurs med 5 moduler, 10 leksjoner,
 * og bruker ALLE 12 blokktyper minst én gang.
 *
 * Kjør: npx tsx scripts/seed-onboarding-course.ts
 */

import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config(); // Fallback to .env

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ── Slug-generator (samme som i codebase) ─────────────────

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/æ/g, 'ae')
        .replace(/ø/g, 'oe')
        .replace(/å/g, 'aa')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// ── Hovedfunksjon ─────────────────────────────────────────

async function main() {
    console.log('🔍 Finner tenant "Egen Akademi"...');

    const tenant = await prisma.tenant.findFirst({
        where: { name: { contains: 'Egen Akademi', mode: 'insensitive' } },
    });

    if (!tenant) {
        console.error('❌ Fant ingen tenant med navn "Egen Akademi". Sjekk databasen.');
        process.exit(1);
    }

    const tenantId = tenant.id;
    console.log(`✅ Tenant funnet: ${tenant.name} (${tenantId})`);

    // ── Opprett kategori ─────────────────────────────────

    console.log('📁 Oppretter kategori "Onboarding"...');
    const category = await prisma.courseCategory.upsert({
        where: { tenantId_slug: { tenantId, slug: 'onboarding' } },
        update: {},
        create: {
            tenantId,
            slug: 'onboarding',
            name: 'Onboarding',
            description: 'Introduksjonskurs og opplæring for nye brukere og administratorer.',
        },
    });

    // ── Opprett tags ─────────────────────────────────────

    console.log('🏷️  Oppretter tags...');
    const tagDefs = [
        { slug: 'onboarding', label: 'Onboarding', tagType: 'TOPIC' as const },
        { slug: 'administrator', label: 'Administrator', tagType: 'AUDIENCE' as const },
        { slug: 'lms', label: 'LMS', tagType: 'TOPIC' as const },
        { slug: 'kursbygger', label: 'Kursbygger', tagType: 'TOPIC' as const },
        { slug: 'tildeling', label: 'Tildeling', tagType: 'TOPIC' as const },
        { slug: 'progresjon', label: 'Progresjon', tagType: 'TOPIC' as const },
    ];

    const tags: { id: string }[] = [];
    for (const t of tagDefs) {
        const tag = await prisma.tag.upsert({
            where: { tenantId_slug: { tenantId, slug: t.slug } },
            update: {},
            create: { tenantId, ...t },
        });
        tags.push(tag);
    }

    // ── Opprett kurs ─────────────────────────────────────

    const courseSlug = slugify('Onboarding for administratorer i Egen Akademi');
    console.log(`📚 Oppretter kurs: "${courseSlug}"...`);

    // Slett eventuelt eksisterende kurs med samme slug
    const existing = await prisma.course.findUnique({
        where: { tenantId_slug: { tenantId, slug: courseSlug } },
    });
    if (existing) {
        console.log('🗑️  Sletter eksisterende kurs med samme slug...');
        await prisma.course.delete({ where: { id: existing.id } });
    }

    const course = await prisma.course.create({
        data: {
            tenantId,
            slug: courseSlug,
            title: 'Onboarding for administratorer i Egen Akademi',
            description: 'Et introduksjonskurs for systemadministratorer og organisasjonsadministratorer som forklarer hvordan LMS-et i Egen Akademi fungerer.',
            visibility: 'INTERNAL',
            status: 'ACTIVE',
            estimatedMinutes: 40,
            difficulty: 'BEGINNER',
            defaultLocale: 'nb-NO',
            isSystemTemplate: true,
        },
    });

    // Koble kategori
    await prisma.courseCategoryLink.create({
        data: { courseId: course.id, categoryId: category.id },
    });

    // Koble tags
    for (const tag of tags) {
        await prisma.courseTagLink.create({
            data: { courseId: course.id, tagId: tag.id },
        });
    }

    // ── Opprett kursversjon ──────────────────────────────

    console.log('📝 Oppretter kursversjon v1 (PUBLISHED)...');

    const version = await prisma.courseVersion.create({
        data: {
            courseId: course.id,
            versionNumber: 1,
            state: 'PUBLISHED',
            changeLog: 'Førsteutgave av onboardingkurs for administratorer.',
            publishedAt: new Date(),
        },
    });

    // Sett som publisert versjon
    await prisma.course.update({
        where: { id: course.id },
        data: { currentPublishedVersionId: version.id },
    });

    // ── Modul- og leksjonsdata ───────────────────────────

    console.log('🧱 Bygger moduler, leksjoner og blokker...');

    // ═══════════════════════════════════════════════════════
    // MODUL 1: Introduksjon til Egen Akademi
    // ═══════════════════════════════════════════════════════

    const mod1 = await prisma.module.create({
        data: {
            courseVersionId: version.id,
            position: 0,
            title: 'Introduksjon til Egen Akademi',
            summary: 'Bli kjent med plattformen, dens formål og rollene i systemet.',
        },
    });

    // ── Leksjon 1: Hva er Egen Akademi? ──────────────────

    const lesson1 = await prisma.lesson.create({
        data: {
            moduleId: mod1.id,
            position: 0,
            title: 'Hva er Egen Akademi?',
            lessonType: 'STANDARD',
            completionRule: 'MANUAL_MARK',
            estimatedMinutes: 4,
        },
    });

    await prisma.lessonBlock.createMany({
        data: [
            {
                lessonId: lesson1.id,
                position: 0,
                type: 'TEXT',
                data: {
                    content: '<h2>Velkommen til Egen Akademi</h2><p>Egen Akademi er en <strong>whitelabel LMS-plattform</strong> (Learning Management System) utviklet for organisasjoner som ønsker full kontroll over intern opplæring og kompetanseutvikling.</p><p>Plattformen gjør det enkelt å opprette, administrere og distribuere kurs til ansatte, partnere og samarbeidspartnere. Med Egen Akademi kan hver organisasjon tilpasse plattformen med eget visuelt uttrykk, inkludert logo, farger og fonter.</p><h3>Hva brukes Egen Akademi til?</h3><ul><li>Onboarding av nye medarbeidere</li><li>Intern kompetanseheving og opplæring</li><li>Sertifisering og dokumentasjon av gjennomført opplæring</li><li>Løpende opplæring og faglig utvikling</li></ul><p>Hovedideen bak LMS-et er å gi organisasjoner et <strong>enkelt, fleksibelt og skalerbart verktøy</strong> for læring – uten at de trenger teknisk kompetanse for å komme i gang.</p>',
                },
            },
            {
                lessonId: lesson1.id,
                position: 1,
                type: 'IMAGE',
                data: {
                    url: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&q=80',
                    alt: 'Gruppe med personer som samarbeider foran en skjerm – illustrasjon av digital læring og teamarbeid',
                    caption: 'Egen Akademi gjør intern opplæring tilgjengelig for hele organisasjonen.',
                },
            },
            {
                lessonId: lesson1.id,
                position: 2,
                type: 'CALLOUT',
                data: {
                    variant: 'info',
                    title: 'Viktig for nye administratorer',
                    body: '<p>Som administrator har du tilgang til funksjoner som vanlige brukere ikke ser. Dette kurset gir deg en praktisk innføring i de viktigste verktøyene og arbeidsflytene du trenger for å administrere opplæring i din organisasjon.</p>',
                },
            },
            {
                lessonId: lesson1.id,
                position: 3,
                type: 'DIVIDER',
                data: { style: 'line' },
            },
            {
                lessonId: lesson1.id,
                position: 4,
                type: 'TEXT',
                data: {
                    content: '<h3>Hva du vil lære i dette kurset</h3><p>Gjennom dette kurset vil du lære å:</p><ul><li>Forstå rollene og tilgangsnivåene i systemet</li><li>Opprette og strukturere kurs med moduler og leksjoner</li><li>Bruke forskjellige innholdsblokker for å bygge engasjerende kursinnhold</li><li>Publisere kursversjoner og tildele kurs til brukere</li><li>Følge opp progresjon og fullføring</li></ul><p>La oss begynne!</p>',
                },
            },
        ],
    });

    // ── Leksjon 2: Roller og tilgang i systemet ──────────

    const lesson2 = await prisma.lesson.create({
        data: {
            moduleId: mod1.id,
            position: 1,
            title: 'Roller og tilgang i systemet',
            lessonType: 'STANDARD',
            completionRule: 'MANUAL_MARK',
            estimatedMinutes: 5,
        },
    });

    await prisma.lessonBlock.createMany({
        data: [
            {
                lessonId: lesson2.id,
                position: 0,
                type: 'TEXT',
                data: {
                    content: '<h2>Roller og tilgang</h2><p>Egen Akademi opererer med tre hovednivåer av tilgang. Hver rolle gir tilgang til ulike deler av systemet, og det er viktig at administratorer forstår forskjellene.</p><h3>Vanlig bruker (USER)</h3><p>En vanlig bruker har tilgang til <strong>læringsportalen</strong>. Det innebærer:</p><ul><li>Se kurskatalog og påmeldte kurs</li><li>Gjennomføre leksjoner, quizer og oppgaver</li><li>Se egen progresjon og sertifikater</li><li>Oppdatere sin egen profil</li></ul><h3>Organisasjonsadministrator (TENANT_ADMIN)</h3><p>En organisasjonsadministrator har i tillegg tilgang til <strong>administrasjonspanelet</strong>:</p><ul><li>Opprette og redigere kurs, moduler og leksjoner</li><li>Administrere brukere og grupper</li><li>Tildele kurs og følge opp progresjon</li><li>Tilpasse branding og visuelt uttrykk</li></ul><h3>Systemadministrator (SYSTEM_ADMIN)</h3><p>En systemadministrator har <strong>full tilgang til alle funksjoner</strong>, inkludert:</p><ul><li>Alle rettigheter en organisasjonsadministrator har</li><li>Administrere planer og abonnement</li><li>Tilgang til systeminnstillinger og teknisk konfigurasjon</li><li>Mulighet til å opprette og administrere tenants</li></ul>',
                },
            },
            {
                lessonId: lesson2.id,
                position: 1,
                type: 'EMBED',
                data: {
                    code: '<div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 12px; padding: 32px; color: #e2e8f0; font-family: system-ui, sans-serif;"><h3 style="margin: 0 0 20px; color: #60a5fa; font-size: 18px;">Rolleoversikt – Egen Akademi</h3><div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;"><div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px; border-left: 3px solid #22c55e;"><strong style="color: #22c55e;">Bruker</strong><ul style="margin: 8px 0 0; padding-left: 16px; font-size: 14px; line-height: 1.8;"><li>Kurskatalog</li><li>Leksjonsspiller</li><li>Egen profil</li><li>Sertifikater</li></ul></div><div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px; border-left: 3px solid #3b82f6;"><strong style="color: #3b82f6;">Org.admin</strong><ul style="margin: 8px 0 0; padding-left: 16px; font-size: 14px; line-height: 1.8;"><li>Kursbygger</li><li>Brukerhåndtering</li><li>Kurstildeling</li><li>Branding</li></ul></div><div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px; border-left: 3px solid #a855f7;"><strong style="color: #a855f7;">Sys.admin</strong><ul style="margin: 8px 0 0; padding-left: 16px; font-size: 14px; line-height: 1.8;"><li>Alt over</li><li>Planvalg</li><li>Systeminnstillinger</li><li>Tenantstyring</li></ul></div></div></div>',
                    title: 'Interaktiv rolleoversikt',
                },
            },
            {
                lessonId: lesson2.id,
                position: 2,
                type: 'QUIZ',
                data: {
                    questions: [
                        {
                            question: '<p>Hvilken rolle har tilgang til kursbyggeren i administrasjonspanelet?</p>',
                            options: [
                                { text: 'Vanlig bruker (USER)', isCorrect: false },
                                { text: 'Organisasjonsadministrator (TENANT_ADMIN)', isCorrect: true },
                                { text: 'Kun systemadministrator (SYSTEM_ADMIN)', isCorrect: false },
                                { text: 'Alle roller har tilgang', isCorrect: false },
                            ],
                            explanation: '<p>Organisasjonsadministratorer og systemadministratorer har begge tilgang til kursbyggeren, men det er organisasjonsadministratoren som primært oppretter og vedlikeholder kurs.</p>',
                        },
                        {
                            question: '<p>Hva kan en vanlig bruker gjøre i Egen Akademi?</p>',
                            options: [
                                { text: 'Opprette nye kurs og leksjoner', isCorrect: false },
                                { text: 'Administrere brukere og grupper', isCorrect: false },
                                { text: 'Gjennomføre kurs og se egen progresjon', isCorrect: true },
                                { text: 'Endre branding og visuelt uttrykk', isCorrect: false },
                            ],
                            explanation: '<p>Vanlige brukere har tilgang til læringsportalen der de kan gjennomføre kurs, se kurskatalog, følge egen progresjon og laste ned sertifikater.</p>',
                        },
                        {
                            question: '<p>Hvilken rolle har tilgang til å administrere planer og systeminnstillinger?</p>',
                            options: [
                                { text: 'Vanlig bruker', isCorrect: false },
                                { text: 'Organisasjonsadministrator', isCorrect: false },
                                { text: 'Systemadministrator', isCorrect: true },
                                { text: 'Ingen – dette skjer automatisk', isCorrect: false },
                            ],
                            explanation: '<p>Kun systemadministratorer har tilgang til planer, abonnement og teknisk konfigurasjon av systemet.</p>',
                        },
                    ],
                },
            },
            {
                lessonId: lesson2.id,
                position: 3,
                type: 'CALLOUT',
                data: {
                    variant: 'tip',
                    title: 'Verdt å merke seg',
                    body: '<p>Husk at tilgangsnivåene er kumulative: En systemadministrator kan gjøre alt en organisasjonsadministrator kan, og en organisasjonsadministrator kan gjøre alt en vanlig bruker kan.</p>',
                },
            },
        ],
    });


    // ═══════════════════════════════════════════════════════
    // MODUL 2: Kursstruktur og kursbygger
    // ═══════════════════════════════════════════════════════

    const mod2 = await prisma.module.create({
        data: {
            courseVersionId: version.id,
            position: 1,
            title: 'Kursstruktur og kursbygger',
            summary: 'Forstå hvordan kurs er strukturert og lær deg innholdsblokker.',
        },
    });

    // ── Leksjon 3: Hvordan kurs er bygget opp ────────────

    const lesson3 = await prisma.lesson.create({
        data: {
            moduleId: mod2.id,
            position: 0,
            title: 'Hvordan kurs er bygget opp',
            lessonType: 'STANDARD',
            completionRule: 'MANUAL_MARK',
            estimatedMinutes: 5,
        },
    });

    await prisma.lessonBlock.createMany({
        data: [
            {
                lessonId: lesson3.id,
                position: 0,
                type: 'TEXT',
                data: {
                    content: '<h2>Kursstruktur i Egen Akademi</h2><p>Et kurs i Egen Akademi er bygget opp i tre nivåer:</p><ol><li><strong>Kurs</strong> – Det overordnede nivået. Et kurs har tittel, beskrivelse, kategori og metadata.</li><li><strong>Moduler</strong> – Tematiske grupperinger innenfor et kurs. Tenk på moduler som kapitler i en bok.</li><li><strong>Leksjoner</strong> – Enkeltstående læringsenheter innenfor en modul. Hver leksjon inneholder én eller flere innholdsblokker.</li></ol><h3>Innholdsblokker</h3><p>Innholdsblokker er de faktiske innholdselementene i en leksjon. Du kan kombinere ulike blokktyper for å lage variert og engasjerende innhold:</p><ul><li><strong>Tekst</strong> – Rik tekst med formatering</li><li><strong>Bilde</strong> – Med alt-tekst og bildetekst</li><li><strong>Video</strong> – Fra YouTube, Vimeo eller egne URL-er</li><li><strong>Lyd</strong> – Lydfiler med valgfri transkripsjon</li><li><strong>Quiz</strong> – Spørsmål med svaralternativer</li><li><strong>Kode</strong> – Kodesnutt med syntaksutheving</li><li><strong>Merknad</strong> – Informasjon, tips, advarsler eller fare-bokser</li><li><strong>Sjekkliste</strong> – Interaktive sjekklister med progresjon</li><li><strong>Åpent svar</strong> – Refleksjonosoppgaver med fritekst</li><li><strong>Dokument</strong> – Lenker til filer og dokumenter</li><li><strong>Embed</strong> – Innebygd innhold fra andre systemer</li><li><strong>Skillelinje</strong> – Visuelt skille mellom seksjoner</li></ul>',
                },
            },
            {
                lessonId: lesson3.id,
                position: 1,
                type: 'IMAGE',
                data: {
                    url: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=800&q=80',
                    alt: 'Illustrasjon av struktur og organisering – et nettverk av noder',
                    caption: 'En logisk struktur gjør det enklere for deltakerne å navigere i innholdet.',
                },
            },
            {
                lessonId: lesson3.id,
                position: 2,
                type: 'VIDEO',
                data: {
                    url: 'https://www.youtube.com/watch?v=wX78iKhInsc',
                    title: 'Introduksjon til moderne læringsplattformer',
                },
            },
            {
                lessonId: lesson3.id,
                position: 3,
                type: 'CALLOUT',
                data: {
                    variant: 'tip',
                    title: 'Tips: Hold kursene oversiktlige',
                    body: '<p>En god tommelfingerregel er å begrense hvert kurs til 3–7 moduler, og hver modul til 2–4 leksjoner. Det gjør det enklere for brukerne å navigere og holder progresjonen tydelig.</p>',
                },
            },
            {
                lessonId: lesson3.id,
                position: 4,
                type: 'DIVIDER',
                data: { style: 'line' },
            },
            {
                lessonId: lesson3.id,
                position: 5,
                type: 'TEXT',
                data: {
                    content: '<h3>Oppsummering: God kursstruktur</h3><p>Et godt strukturert kurs har:</p><ul><li>En tydelig tittel og beskrivelse som forteller brukeren hva kurset handler om</li><li>Logisk inndeling i moduler som bygger på hverandre</li><li>Leksjoner med variert innhold som holder brukeren engasjert</li><li>Riktig estimering av tidsbruk</li></ul>',
                },
            },
        ],
    });


    // ── Leksjon 4: Innholdsblokker i praksis ─────────────

    const lesson4 = await prisma.lesson.create({
        data: {
            moduleId: mod2.id,
            position: 1,
            title: 'Innholdsblokker i praksis',
            lessonType: 'STANDARD',
            completionRule: 'MANUAL_MARK',
            estimatedMinutes: 5,
        },
    });

    await prisma.lessonBlock.createMany({
        data: [
            {
                lessonId: lesson4.id,
                position: 0,
                type: 'TEXT',
                data: {
                    content: '<h2>Innholdsblokker i praksis</h2><p>Innholdsblokker er byggesteinene i hver leksjon. Ulike blokker egner seg for ulike formål, og en god leksjon kombinerer flere blokktyper for å skape variasjon og engasjement.</p><h3>Når bør du bruke hvilken blokk?</h3><p><strong>Tekst</strong> egner seg for forklaringer, definisjoner og sammenhenger. <strong>Bilde</strong> og <strong>video</strong> passer for visuell demonstrasjon og illustrasjon av konsepter. <strong>Quiz</strong> lar deg teste forståelse underveis, mens <strong>åpent svar</strong> oppmuntrer til refleksjon.</p><p><strong>Merknad</strong> er nyttig for å fremheve viktig informasjon, tips eller advarsler. <strong>Sjekkliste</strong> gir brukerne en praktisk oversikt over oppgaver. <strong>Kode</strong> passer for teknisk innhold, og <strong>lyd</strong> er ideelt for eksterne forelesninger eller supplerende materiell.</p>',
                },
            },
            {
                lessonId: lesson4.id,
                position: 1,
                type: 'AUDIO',
                data: {
                    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
                    title: 'Eksempel: Bruk av lyd i opplæring',
                    transcript: 'Denne lydfilen er et eksempel på hvordan lydblokker kan brukes i en leksjon.\n\nLydblokker er spesielt nyttige for:\n- Forelesningsopptak og muntlige forklaringer\n- Supplerende materiell som podkast-episoder\n- Intervjuer og ekspertsamtaler\n- Tilgjengelighetshensyn der brukeren foretrekker lyd\n\nHusk alltid å legge inn en transkripsjon for å gjøre innholdet tilgjengelig for alle brukere.',
                    allowSpeed: true,
                },
            },
            {
                lessonId: lesson4.id,
                position: 2,
                type: 'DOCUMENT',
                data: {
                    url: '/docs/onboarding/veiledning-innholdsblokker.pdf',
                    title: 'Veiledning – bruk av innholdsblokker',
                    description: 'Last ned den fullstendige veiledningen for innholdsblokker i Egen Akademi.',
                },
            },
            {
                lessonId: lesson4.id,
                position: 3,
                type: 'CODE',
                data: {
                    code: '{\n  "kurs": {\n    "tittel": "Onboarding for administratorer",\n    "moduler": [\n      {\n        "tittel": "Introduksjon",\n        "leksjoner": [\n          {\n            "tittel": "Hva er Egen Akademi?",\n            "blokker": [\n              { "type": "TEXT", "posisjon": 0 },\n              { "type": "IMAGE", "posisjon": 1 },\n              { "type": "CALLOUT", "posisjon": 2 }\n            ]\n          }\n        ]\n      }\n    ]\n  }\n}',
                    language: 'json',
                    caption: 'JSON-representasjon av en kursstruktur i Egen Akademi',
                    lineNumbers: true,
                    copyButton: true,
                },
            },
            {
                lessonId: lesson4.id,
                position: 4,
                type: 'DIVIDER',
                data: { style: 'dots' },
            },
            {
                lessonId: lesson4.id,
                position: 5,
                type: 'CALLOUT',
                data: {
                    variant: 'info',
                    title: 'Oversikt over blokktyper',
                    body: '<table><thead><tr><th>Blokktype</th><th>Best egnet for</th></tr></thead><tbody><tr><td>Tekst</td><td>Forklaringer, definisjoner, introduksjoner</td></tr><tr><td>Bilde</td><td>Skjermbilder, illustrasjoner, diagrammer</td></tr><tr><td>Video</td><td>Demonstrasjoner, veiledninger, intervjuer</td></tr><tr><td>Lyd</td><td>Forelesninger, podkaster, sammendrag</td></tr><tr><td>Quiz</td><td>Kunnskapstesting, repetisjon, vurdering</td></tr><tr><td>Kode</td><td>Tekniske eksempler, konfigurasjon, API-dokumentasjon</td></tr><tr><td>Merknad</td><td>Viktig informasjon, tips, advarsler</td></tr><tr><td>Sjekkliste</td><td>Praktiske oppgaver, prosedyrer, kontrollpunkter</td></tr><tr><td>Åpent svar</td><td>Refleksjon, case-studier, egenrefleksjon</td></tr><tr><td>Dokument</td><td>Nedlastbare filer, referansemateriale</td></tr><tr><td>Embed</td><td>Eksternt innhold, interaktive diagrammer</td></tr><tr><td>Skillelinje</td><td>Visuell avgrensning mellom temaer</td></tr></tbody></table>',
                },
            },
        ],
    });


    // ═══════════════════════════════════════════════════════
    // MODUL 3: Opprette og vedlikeholde kurs
    // ═══════════════════════════════════════════════════════

    const mod3 = await prisma.module.create({
        data: {
            courseVersionId: version.id,
            position: 2,
            title: 'Opprette og vedlikeholde kurs',
            summary: 'Lær hvordan du oppretter kurs, organiserer innhold og vedlikeholder kursmateriell.',
        },
    });

    // ── Leksjon 5: Opprette moduler og leksjoner ─────────

    const lesson5 = await prisma.lesson.create({
        data: {
            moduleId: mod3.id,
            position: 0,
            title: 'Opprette moduler og leksjoner',
            lessonType: 'STANDARD',
            completionRule: 'MANUAL_MARK',
            estimatedMinutes: 4,
        },
    });

    await prisma.lessonBlock.createMany({
        data: [
            {
                lessonId: lesson5.id,
                position: 0,
                type: 'TEXT',
                data: {
                    content: '<h2>Opprette et nytt kurs</h2><p>Å opprette et kurs i Egen Akademi følger en fast arbeidsflyt som sikrer at alt innhold er strukturert og klart før det gjøres tilgjengelig for brukere.</p><h3>Steg for steg</h3><ol><li><strong>Opprett kurset</strong> – Gå til «Kurs» i administrasjonspanelet og klikk «Opprett kurs». Fyll inn tittel, beskrivelse, kategori og annen metadata.</li><li><strong>Legg til moduler</strong> – Klikk «Legg til modul» for å opprette tematiske grupper. Gi hver modul en tydelig tittel og valgfri oppsummering.</li><li><strong>Legg til leksjoner</strong> – Innenfor hver modul legger du til leksjoner. Hver leksjon blir en egen side i kursplayeren.</li><li><strong>Bygg innhold</strong> – Åpne en leksjon for å legge til innholdsblokker: tekst, bilder, video, quiz og mer.</li><li><strong>Publiser</strong> – Når kurset er klart, publiserer du versjonen for å gjøre den tilgjengelig.</li></ol>',
                },
            },
            {
                lessonId: lesson5.id,
                position: 1,
                type: 'IMAGE',
                data: {
                    url: 'https://images.unsplash.com/photo-1531403001884-48aae7b93ff0?w=800&q=80',
                    alt: 'Skjerm som viser et dashboard for kursbygging – illustrasjon',
                    caption: 'Administrasjonspanelet gir deg full oversikt over kurshierarkiet.',
                },
            },
            {
                lessonId: lesson5.id,
                position: 2,
                type: 'TEXT',
                data: {
                    content: '<h3>Organisering av moduler og leksjoner</h3><p>Moduler og leksjoner kan sorteres ved å dra dem i ønsket rekkefølge. Du kan også duplisere eksisterende moduler og leksjoner for å spare tid når du bygger lignende innhold.</p>',
                },
            },
            {
                lessonId: lesson5.id,
                position: 3,
                type: 'IMAGE',
                data: {
                    url: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80',
                    alt: 'Person som arbeider med digitalt innhold på en bærbar datamaskin – illustrasjon av kursbygging',
                    caption: 'Kursbyggeren lar deg organisere innhold effektivt.',
                },
            },
            {
                lessonId: lesson5.id,
                position: 4,
                type: 'CHECKLIST',
                data: {
                    title: 'Sjekkliste: Oppsett av nytt kurs',
                    items: [
                        { id: 'c1', text: 'Definer kursets formål og målgruppe', required: true },
                        { id: 'c2', text: 'Skriv en tydelig kursbeskrivelse', required: true },
                        { id: 'c3', text: 'Planlegg moduler og leksjoner før du begynner', required: false },
                        { id: 'c4', text: 'Legg til relevant metadata: kategori, tags, nivå', required: false },
                        { id: 'c5', text: 'Estimer tidsbruk for hver leksjon', required: true },
                    ],
                    showProgress: true,
                },
            },
            {
                lessonId: lesson5.id,
                position: 5,
                type: 'CALLOUT',
                data: {
                    variant: 'info',
                    title: 'Oppsummering',
                    body: '<p>Et godt kurs starter med god planlegging. Bruk tid på å definere formålet, strukturere innholdet logisk, og estimere tidsbruk realistisk. Det gjør gjennomføringen enklere for både administrator og bruker.</p>',
                },
            },
        ],
    });


    // ── Leksjon 6: God praksis for innhold og vedlikehold ─

    const lesson6 = await prisma.lesson.create({
        data: {
            moduleId: mod3.id,
            position: 1,
            title: 'God praksis for innhold og vedlikehold',
            lessonType: 'STANDARD',
            completionRule: 'MANUAL_MARK',
            estimatedMinutes: 4,
        },
    });

    await prisma.lessonBlock.createMany({
        data: [
            {
                lessonId: lesson6.id,
                position: 0,
                type: 'TEXT',
                data: {
                    content: '<h2>Vedlikehold av kursinnhold</h2><p>Et kurs som ikke vedlikeholdes, mister raskt relevans og troverdighet. Som administrator er det ditt ansvar å sørge for at innholdet er oppdatert, korrekt og brukervennlig.</p><h3>Råd for godt kursinnhold</h3><ul><li><strong>Bruk klart og enkelt språk.</strong> Unngå fagsjargong med mindre målgruppen forventer det. Skriv korte avsnitt og bruk overskrifter for å dele opp teksten.</li><li><strong>Hold innholdet oppdatert.</strong> Sett en fast rutine for gjennomgang, for eksempel hvert kvartal. Fjern utdaterte skjermbilder og oppdater lenker.</li><li><strong>Varier blokktypene.</strong> Bruk en kombinasjon av tekst, bilder, video og interaktive blokker for å holde brukerens oppmerksomhet.</li><li><strong>Be om tilbakemelding.</strong> Spør brukerne om innholdet var nyttig og forståelig. Bruk dette til å forbedre kurset.</li><li><strong>Dokumenter endringer.</strong> Bruk endringsloggen i kursversjoner for å beskrive hva som er oppdatert.</li></ul>',
                },
            },
            {
                lessonId: lesson6.id,
                position: 1,
                type: 'IMAGE',
                data: {
                    url: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&q=80',
                    alt: 'Kaffekopp og notisbok på et skrivebord – illustrasjon av fokus og vedlikehold',
                    caption: 'Jevnlig vedlikehold sikrer at kurset holder høy kvalitet over tid.',
                },
            },
            {
                lessonId: lesson6.id,
                position: 2,
                type: 'CALLOUT',
                data: {
                    variant: 'warning',
                    title: 'Vanlige feil å unngå',
                    body: '<p><strong>Ikke publiser halvferdig innhold.</strong> Ufullstendige leksjoner skaper forvirring og reduserer tilliten til plattformen.</p><p><strong>Ikke la utdaterte kurs stå uendret.</strong> Innhold som refererer til gamle prosedyrer eller systemer som ikke lenger brukes, bør oppdateres eller arkiveres.</p><p><strong>Ikke undervurder viktigheten av god alt-tekst på bilder.</strong> Det er både et tilgjengelighetskrav og god praksis.</p>',
                },
            },
            {
                lessonId: lesson6.id,
                position: 3,
                type: 'CHECKLIST',
                data: {
                    title: 'Rutine for vedlikehold',
                    items: [
                        { id: 'v1', text: 'Sjekk at alle eksterne lenker fungerer', required: true },
                        { id: 'v2', text: 'Oppdater skjermbilder hvis UI har endret seg', required: true },
                        { id: 'v3', text: 'Se gjennom brukerfeedback og gjør justeringer', required: false },
                        { id: 'v4', text: 'Verifiser at faglig innhold fortsatt er korrekt', required: true },
                    ],
                    showProgress: true,
                },
            },
            {
                lessonId: lesson6.id,
                position: 4,
                type: 'OPEN_RESPONSE',
                data: {
                    prompt: '<p>Beskriv med egne ord hva som er viktig for å holde et kurs oppdatert og lett å bruke.</p>',
                    maxChars: 3000,
                    required: false,
                },
            },
            {
                lessonId: lesson6.id,
                position: 5,
                type: 'CALLOUT',
                data: {
                    variant: 'tip',
                    title: 'Veien videre',
                    body: '<p>Godt jobbet! I neste modul ser vi på hvordan du publiserer kurs og tildeler dem til riktige brukere.</p>',
                },
            },
        ],
    });


    // ═══════════════════════════════════════════════════════
    // MODUL 4: Publisering, tildeling og progresjon
    // ═══════════════════════════════════════════════════════

    const mod4 = await prisma.module.create({
        data: {
            courseVersionId: version.id,
            position: 3,
            title: 'Publisering, tildeling og progresjon',
            summary: 'Forstå versjoner, publisering, kurstildeling og progresjonssporing.',
        },
    });

    // ── Leksjon 7: Versjoner og publisering ──────────────

    const lesson7 = await prisma.lesson.create({
        data: {
            moduleId: mod4.id,
            position: 0,
            title: 'Versjoner og publisering',
            lessonType: 'STANDARD',
            completionRule: 'MANUAL_MARK',
            estimatedMinutes: 4,
        },
    });

    await prisma.lessonBlock.createMany({
        data: [
            {
                lessonId: lesson7.id,
                position: 0,
                type: 'TEXT',
                data: {
                    content: '<h2>Kursversjoner og publisering</h2><p>Egen Akademi bruker et <strong>versjonssystem</strong> for kurs. Det betyr at du kan jobbe med et utkast uten at endringene påvirker det publiserte kurset som brukerne ser.</p><h3>Hva er en kursversjon?</h3><p>Hver gang du oppretter et kurs, starter du med <strong>versjon 1 (utkast)</strong>. Et utkast er en arbeidsversjon som kun er synlig for administratorer. Brukere ser aldri utkast.</p><h3>Forskjellen på utkast og publisert versjon</h3><ul><li><strong>Utkast (DRAFT):</strong> Kun synlig for administratorer. Her kan du redigere fritt – legge til, endre og slette innhold.</li><li><strong>Publisert (PUBLISHED):</strong> Den versjonen brukerne ser og gjennomfører. Innholdet i en publisert versjon er låst for redigering.</li></ul><h3>Hvorfor er publisering et eget steg?</h3><p>Publisering som et bevisst steg sikrer kvalitetskontroll. Det forhindrer at uferdige endringer blir synlige for brukere. Du kan jobbe i ro med utkastet, og publisere først når alt er klart.</p><h3>Opprette ny versjon</h3><p>Når du vil gjøre endringer i et publisert kurs, oppretter du en <strong>ny versjon</strong>. Den nye versjonen kopierer alt innhold fra den forrige, slik at du kan redigere uten å miste det eksisterende kurset.</p>',
                },
            },
            {
                lessonId: lesson7.id,
                position: 1,
                type: 'IMAGE',
                data: {
                    url: 'https://images.unsplash.com/photo-1450101496173-eb4159e4710a?w=800&q=80',
                    alt: 'Dokument med stempel – illustrasjon av godkjenning og publisering',
                    caption: 'Publisering er kvalitetsstempelet som gjør kurset tilgjengelig for brukerne.',
                },
            },
            {
                lessonId: lesson7.id,
                position: 2,
                type: 'VIDEO',
                data: {
                    url: 'https://www.youtube.com/watch?v=L_L9_zsz9V8',
                    title: 'Hvordan håndtere versjoner og publisering',
                },
            },
            {
                lessonId: lesson7.id,
                position: 3,
                type: 'QUIZ',
                data: {
                    questions: [
                        {
                            question: '<p>Hva skjer når du publiserer en kursversjon?</p>',
                            options: [
                                { text: 'Utkastet slettes automatisk', isCorrect: false },
                                { text: 'Versjonen blir synlig for brukerne og innholdet låses for redigering', isCorrect: true },
                                { text: 'Alle brukere meldes automatisk på kurset', isCorrect: false },
                                { text: 'Kurset sendes til godkjenning hos systemadministrator', isCorrect: false },
                            ],
                            explanation: '<p>Når en versjon publiseres, blir den tilgjengelig for brukere. Innholdet i den publiserte versjonen låses, og du må opprette en ny versjon for å gjøre endringer.</p>',
                        },
                        {
                            question: '<p>Hva må du gjøre for å endre innholdet i et publisert kurs?</p>',
                            options: [
                                { text: 'Redigere direkte i den publiserte versjonen', isCorrect: false },
                                { text: 'Slette kurset og opprette det på nytt', isCorrect: false },
                                { text: 'Opprette en ny kursversjon basert på den forrige', isCorrect: true },
                                { text: 'Be systemadministrator om å låse opp versjonen', isCorrect: false },
                            ],
                            explanation: '<p>For å endre innhold i et publisert kurs oppretter du en ny versjon. Den nye versjonen kopierer alt innhold, slik at du kan gjøre endringer og publisere på nytt.</p>',
                        },
                        {
                            question: '<p>Hvorfor er publisering et eget steg i Egen Akademi?</p>',
                            options: [
                                { text: 'For å spare lagringsplass', isCorrect: false },
                                { text: 'Fordi systemet krever manuell godkjenning', isCorrect: false },
                                { text: 'For å sikre kvalitetskontroll og forhindre at uferdige endringer vises', isCorrect: true },
                                { text: 'Det er ingen spesiell grunn – det er bare slik systemet fungerer', isCorrect: false },
                            ],
                            explanation: '<p>Publisering som et bevisst steg sikrer at kun ferdig og kvalitetssikret innhold når brukerne.</p>',
                        },
                    ],
                },
            },
            {
                lessonId: lesson7.id,
                position: 4,
                type: 'CALLOUT',
                data: {
                    variant: 'info',
                    title: 'Oppsummering',
                    body: '<p>Versjonssystemet gir deg trygghet i redigeringsprosessen. Du kan gjøre endringer uten risiko, og brukerne ser alltid den sist publiserte versjonen.</p>',
                },
            },
        ],
    });


    // ── Leksjon 8: Tildeling og målgrupper ───────────────

    const lesson8 = await prisma.lesson.create({
        data: {
            moduleId: mod4.id,
            position: 1,
            title: 'Tildeling og målgrupper',
            lessonType: 'STANDARD',
            completionRule: 'MANUAL_MARK',
            estimatedMinutes: 4,
        },
    });

    await prisma.lessonBlock.createMany({
        data: [
            {
                lessonId: lesson8.id,
                position: 0,
                type: 'TEXT',
                data: {
                    content: '<h2>Tildeling av kurs</h2><p>Når et kurs er publisert, kan du tildele det til enkeltbrukere, grupper eller roller. Tildeling sikrer at riktige personer får tilgang til riktig opplæring til rett tid.</p><h3>Tildelingsmetoder</h3><ul><li><strong>Bruker</strong> – Tildel kurset til en spesifikk bruker.</li><li><strong>Gruppe</strong> – Tildel til en hel gruppe, for eksempel «Nyansatte» eller «Salgsavdelingen».</li><li><strong>Rolle</strong> – Tildel basert på rolle, slik at alle med en bestemt rolle automatisk får kurset.</li><li><strong>Alle brukere</strong> – Kurs som gjelder hele organisasjonen.</li></ul>',
                },
            },
            {
                lessonId: lesson8.id,
                position: 1,
                type: 'IMAGE',
                data: {
                    url: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=800&q=80',
                    alt: 'Gruppe med mennesker som samarbeider – illustrasjon av målgrupper og team',
                    caption: 'Målgruppestyrt tildeling sikrer relevans for alle brukere.',
                },
            },
            {
                lessonId: lesson8.id,
                position: 2,
                type: 'CALLOUT',
                data: {
                    variant: 'info',
                    title: 'Frister og obligatorisk gjennomføring',
                    body: '<p>Du kan sette en <strong>frist</strong> for gjennomføring. Kurs kan også merkes som <strong>obligatoriske</strong>, noe som sikrer at de prioriteres av brukerne. Systemet kan sende automatiske påminnelser til brukere som nærmer seg fristen.</p>',
                },
            },
            {
                lessonId: lesson8.id,
                position: 3,
                type: 'QUIZ',
                data: {
                    questions: [
                        {
                            question: '<p>Hvilken tildelingsmetode er mest effektiv hvis alle nyansatte skal ta samme kurs?</p>',
                            options: [
                                { text: 'Tildele manuelt til hver enkelt bruker', isCorrect: false },
                                { text: 'Tildele til en gruppe (f.eks. "Nyansatte")', isCorrect: true },
                                { text: 'Sende en e-post med lenke', isCorrect: false },
                                { text: 'Gjøre kurset offentlig tilgjengelig', isCorrect: false },
                            ],
                            explanation: '<p>Tildeling til grupper er den mest effektive metoden for å nå flere brukere samtidig med samme behov.</p>',
                        },
                    ],
                },
            },
            {
                lessonId: lesson8.id,
                position: 4,
                type: 'DOCUMENT',
                data: {
                    url: '/docs/onboarding/rutine-kurstildeling.pdf',
                    title: 'Rutine for kurstildeling',
                    description: 'En standardisert rutine for hvordan kurs bør tildeles i organisasjonen.',
                },
            },
            {
                lessonId: lesson8.id,
                position: 5,
                type: 'EMBED',
                data: {
                    code: '<div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 12px; padding: 32px; color: #e2e8f0; font-family: system-ui, sans-serif;"><h3 style="margin: 0 0 20px; color: #60a5fa; font-size: 18px;">Tildelingsoversikt</h3><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;"><div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px;"><strong style="color: #22c55e; font-size: 24px;">24</strong><br/><span style="font-size: 14px; color: #94a3b8;">Aktive tildelinger</span></div><div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px;"><strong style="color: #f59e0b; font-size: 24px;">5</strong><br/><span style="font-size: 14px; color: #94a3b8;">Med frist innen 7 dager</span></div><div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px;"><strong style="color: #3b82f6; font-size: 24px;">89%</strong><br/><span style="font-size: 14px; color: #94a3b8;">Gjennomføringsrate</span></div><div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 16px;"><strong style="color: #ef4444; font-size: 24px;">3</strong><br/><span style="font-size: 14px; color: #94a3b8;">Forfalt uten fullføring</span></div></div></div>',
                    title: 'Eksempel: Dashboard for tildelingsoversikt',
                },
            },
            {
                lessonId: lesson8.id,
                position: 6,
                type: 'CALLOUT',
                data: {
                    variant: 'tip',
                    title: 'Viktig om målgrupper',
                    body: '<p>Riktig målgruppestyring sikrer at brukerne får relevant opplæring uten å bli overveldet av kurs som ikke angår dem. Det reduserer «kursstøy» og øker gjennomføringsraten.</p>',
                },
            },
        ],
    });


    // ── Leksjon 9: Progresjon, fullføring og oppfølging ──

    const lesson9 = await prisma.lesson.create({
        data: {
            moduleId: mod4.id,
            position: 2,
            title: 'Progresjon, fullføring og oppfølging',
            lessonType: 'STANDARD',
            completionRule: 'MANUAL_MARK',
            estimatedMinutes: 4,
        },
    });

    await prisma.lessonBlock.createMany({
        data: [
            {
                lessonId: lesson9.id,
                position: 0,
                type: 'TEXT',
                data: {
                    content: '<h2>Progresjonssporing</h2><p>Egen Akademi sporer automatisk brukerens progresjon gjennom et kurs. Progresjonen beregnes basert på hvor mange leksjoner brukeren har fullført i forhold til det totale antallet.</p><h3>Hva betyr fullført-status?</h3><p>En leksjon kan fullføres på ulike måter, avhengig av <strong>fullføringsregelen</strong> som er satt:</p><ul><li><strong>Manuell markering:</strong> Brukeren klikker «Merk som fullført».</li><li><strong>Visning:</strong> Automatisk markert som fullført når leksjonen er vist.</li><li><strong>Alle blokker:</strong> Alle interaktive blokker i leksjonen må fullføres.</li><li><strong>Bestått quiz:</strong> Brukeren må svare riktig på quizen.</li></ul>',
                },
            },
            {
                lessonId: lesson9.id,
                position: 1,
                type: 'IMAGE',
                data: {
                    url: 'https://images.unsplash.com/photo-1551288049-bbda38a10ad5?w=800&q=80',
                    alt: 'Skjerm som viser grafer og statistikk – illustrasjon av progresjonskontroll',
                    caption: 'Som administrator har du full oversikt over fremdriften i organisasjonen.',
                },
            },
            {
                lessonId: lesson9.id,
                position: 2,
                type: 'QUIZ',
                data: {
                    questions: [
                        {
                            question: '<p>Hva skjer hvis en leksjon har "Bestått quiz" som fullføringsregel?</p>',
                            options: [
                                { text: 'Leksjonen blir fullført bare ved å se på den', isCorrect: false },
                                { text: 'Brukeren må svare riktig på quizen for at leksjonen skal markeres som fullført', isCorrect: true },
                                { text: 'Brukeren må klikke på en knapp uansett quiz-resultat', isCorrect: false },
                                { text: 'Leksjonen kan ikke fullføres', isCorrect: false },
                            ],
                            explanation: '<p>Når denne regelen er satt, kreves det faktiske resultater for at progresjonen skal telle.</p>',
                        },
                    ],
                },
            },
            {
                lessonId: lesson9.id,
                position: 3,
                type: 'CHECKLIST',
                data: {
                    title: 'Sjekkliste: Kvalitetskontroll etter publisering',
                    items: [
                        { id: 'q1', text: 'Gå gjennom kurset som bruker for å verifisere innholdet', required: true },
                        { id: 'q2', text: 'Test alle quizer og sjekk at riktig svar er markert', required: true },
                        { id: 'q3', text: 'Kontroller at alle bilder og videoer lastes korrekt', required: true },
                        { id: 'q4', text: 'Verifiser at lenker til dokumenter fungerer', required: false },
                        { id: 'q5', text: 'Sjekk at tildeling er satt opp for riktige brukere eller grupper', required: true },
                        { id: 'q6', text: 'Bekreft at estimert tidsbruk er realistisk', required: false },
                    ],
                    showProgress: true,
                },
            },
            {
                lessonId: lesson9.id,
                position: 4,
                type: 'CALLOUT',
                data: {
                    variant: 'danger',
                    title: 'Viktig: Kvalitetssikring',
                    body: '<p>Publiser aldri et kurs uten å ha testet det selv først. Gå gjennom hele kurset som bruker for å fange feil, mangler og uklarheter. Det er mye enklere å rette feil før brukerne begynner enn å håndtere forvirring i etterkant.</p>',
                },
            },
            {
                lessonId: lesson9.id,
                position: 5,
                type: 'TEXT',
                data: {
                    content: '<h3>Oppsummering</h3><p>Progresjonssporing gir deg som administrator innsikten du trenger for å sikre at opplæringen fungerer. Følg opp jevnlig, og bruk sjekklistene til å kvalitetssikre kurs før og etter publisering.</p>',
                },
            },
        ],
    });


    // ═══════════════════════════════════════════════════════
    // MODUL 5: Oppsummering og sluttkontroll
    // ═══════════════════════════════════════════════════════

    const mod5 = await prisma.module.create({
        data: {
            courseVersionId: version.id,
            position: 4,
            title: 'Oppsummering og sluttkontroll',
            summary: 'Samlet oppsummering av hele kurset med sluttquiz og refleksjon.',
        },
    });

    // ── Leksjon 10: Oppsummering og sluttquiz ────────────

    const lesson10 = await prisma.lesson.create({
        data: {
            moduleId: mod5.id,
            position: 0,
            title: 'Oppsummering og sluttquiz',
            lessonType: 'STANDARD',
            completionRule: 'MANUAL_MARK',
            estimatedMinutes: 6,
        },
    });

    await prisma.lessonBlock.createMany({
        data: [
            {
                lessonId: lesson10.id,
                position: 0,
                type: 'TEXT',
                data: {
                    content: '<h2>Oppsummering av kurset</h2><p>Gratulerer – du er nesten ferdig med onboardingkurset for administratorer! La oss oppsummere det viktigste du har lært.</p><h3>Roller og tilgang</h3><p>Systemet har tre hovedroller: <strong>bruker</strong>, <strong>organisasjonsadministrator</strong> og <strong>systemadministrator</strong>. Hver rolle har ulike tilgangsnivåer, og det er administratorene som oppretter og vedlikeholder innhold.</p><h3>Kursbygger</h3><p>Kurs er bygget opp i tre nivåer: <strong>kurs → moduler → leksjoner</strong>. Leksjoner inneholder innholdsblokker som gir fleksibilitet i hvordan innhold presenteres.</p><h3>Innholdsblokker</h3><p>Det finnes 12 blokktyper – fra enkel tekst til interaktive quizer og sjekklister. Variert innhold holder brukeren engasjert og sikrer bedre læringsutbytte.</p><h3>Publisering</h3><p>Kurs bruker et versjonssystem med <strong>utkast</strong> og <strong>publiserte versjoner</strong>. Du kan redigere fritt i utkastet, og publisere når innholdet er klart.</p><h3>Tildeling</h3><p>Kurs kan tildeles til <strong>brukere, grupper, roller eller hele organisasjonen</strong>. Bruk frister og obligatorisk-markering for å sikre gjennomføring.</p><h3>Progresjon</h3><p>Systemet sporer progresjon automatisk. Som administrator kan du følge opp gjennomføring, identifisere etterslepende brukere, og kvalitetssikre opplæringen.</p>',
                },
            },
            {
                lessonId: lesson10.id,
                position: 1,
                type: 'QUIZ',
                data: {
                    questions: [
                        {
                            question: '<p>Hva er de tre nivåene i kursstrukturen i Egen Akademi?</p>',
                            options: [
                                { text: 'Emne, kapittel, oppgave', isCorrect: false },
                                { text: 'Kurs, moduler, leksjoner', isCorrect: true },
                                { text: 'Kurs, sider, avsnitt', isCorrect: false },
                                { text: 'Modul, blokk, element', isCorrect: false },
                            ],
                            explanation: '<p>Kursstrukturen består av tre nivåer: kurs (overordnet), moduler (tematisk gruppering), og leksjoner (enkeltstående læringsenheter).</p>',
                        },
                        {
                            question: '<p>Hva er forskjellen mellom en organisasjonsadministrator og en vanlig bruker?</p>',
                            options: [
                                { text: 'Organisasjonsadministratorer har tilgang til administrasjonspanelet og kan opprette kurs', isCorrect: true },
                                { text: 'Det er ingen forskjell – alle har samme tilgang', isCorrect: false },
                                { text: 'Vanlige brukere kan redigere kurs, men ikke slette dem', isCorrect: false },
                                { text: 'Organisasjonsadministratorer kan kun se rapporter', isCorrect: false },
                            ],
                            explanation: '<p>Organisasjonsadministratorer har tilgang til administrasjonspanelet, der de kan opprette og administrere kurs, brukere og grupper.</p>',
                        },
                        {
                            question: '<p>Hva skjer med innhold i en publisert kursversjon?</p>',
                            options: [
                                { text: 'Det kan redigeres når som helst', isCorrect: false },
                                { text: 'Det låses for redigering og er synlig for brukere', isCorrect: true },
                                { text: 'Det slettes etter 30 dager', isCorrect: false },
                                { text: 'Det kan kun ses av systemadministratorer', isCorrect: false },
                            ],
                            explanation: '<p>Innhold i en publisert versjon er låst for redigering og blir synlig for brukerne. For å gjøre endringer må du opprette en ny versjon.</p>',
                        },
                        {
                            question: '<p>Hvilke metoder kan brukes for å tildele kurs?</p>',
                            options: [
                                { text: 'Kun til enkeltbrukere', isCorrect: false },
                                { text: 'Til brukere, grupper, roller eller hele organisasjonen', isCorrect: true },
                                { text: 'Kun til grupper', isCorrect: false },
                                { text: 'Kurs kan ikke tildeles – brukere melder seg selv på', isCorrect: false },
                            ],
                            explanation: '<p>Kurs kan tildeles til enkeltbrukere, grupper, roller eller alle brukere i organisasjonen.</p>',
                        },
                        {
                            question: '<p>Hva er formålet med fullføringsregler på en leksjon?</p>',
                            options: [
                                { text: 'Å begrense tilgang til leksjonen', isCorrect: false },
                                { text: 'Å definere hva som kreves for at leksjonen regnes som fullført', isCorrect: true },
                                { text: 'Å sette tidsbegrensning for gjennomføring', isCorrect: false },
                                { text: 'Å automatisk slette leksjonen etter gjennomføring', isCorrect: false },
                            ],
                            explanation: '<p>Fullføringsregler definerer kriteriene for at en leksjon regnes som fullført – for eksempel manuell markering, visning, eller bestått quiz.</p>',
                        },
                        {
                            question: '<p>Hva bør du alltid gjøre før du publiserer et kurs?</p>',
                            options: [
                                { text: 'Slette alle utkast', isCorrect: false },
                                { text: 'Teste kurset selv som bruker for å fange feil og mangler', isCorrect: true },
                                { text: 'Sende kurset til brukerne for gjennomlesning', isCorrect: false },
                                { text: 'La kurset ligge som utkast inntil videre', isCorrect: false },
                            ],
                            explanation: '<p>Kvalitetssikring er essensielt. Gå gjennom hele kurset som bruker for å verifisere at alle blokker fungerer, quizer har riktige svar, og innholdet er forståelig.</p>',
                        },
                        {
                            question: '<p>Hvilken blokktype egner seg best for å teste brukerens forståelse av et tema?</p>',
                            options: [
                                { text: 'Tekst', isCorrect: false },
                                { text: 'Bilde', isCorrect: false },
                                { text: 'Quiz', isCorrect: true },
                                { text: 'Skillelinje', isCorrect: false },
                            ],
                            explanation: '<p>Quiz-blokken lar deg stille spørsmål med svaralternativer, noe som er den mest direkte måten å teste forståelse på.</p>',
                        },
                        {
                            question: '<p>En ny medarbeider trenger å fullføre onboardingkurset innen 14 dager. Hvordan setter du opp dette?</p>',
                            options: [
                                { text: 'Du ber medarbeideren huske det selv', isCorrect: false },
                                { text: 'Du oppretter en tildeling med frist og obligatorisk-markering', isCorrect: true },
                                { text: 'Du sender en e-post med en lenke til kurset', isCorrect: false },
                                { text: 'Du legger kurset som synlig i kurskatalogen', isCorrect: false },
                            ],
                            explanation: '<p>Ved å opprette en tildeling med frist og obligatorisk-markering sikrer du at medarbeideren får påminnelser og at gjennomføringen følges opp i systemet.</p>',
                        },
                    ],
                },
            },
            {
                lessonId: lesson10.id,
                position: 2,
                type: 'OPEN_RESPONSE',
                data: {
                    prompt: '<p>Hva mener du er de tre viktigste tingene en administrator må kunne for å bruke Egen Akademi effektivt?</p>',
                    maxChars: 3000,
                    required: false,
                },
            },
            {
                lessonId: lesson10.id,
                position: 3,
                type: 'CALLOUT',
                data: {
                    variant: 'tip',
                    title: 'Flott innsats!',
                    body: '<p>Du har nå gjennomgått alle de viktigste temaene for å administrere opplæring i Egen Akademi. Bruk det du har lært, og ikke nøl med å gå tilbake til relevante leksjoner hvis du trenger en oppfriskning.</p>',
                },
            },
            {
                lessonId: lesson10.id,
                position: 4,
                type: 'TEXT',
                data: {
                    content: '<h2>Gratulerer – du har fullført kurset!</h2><p>Du har nå en grunnleggende forståelse for hvordan LMS-et i Egen Akademi fungerer. Som administrator er du klar til å:</p><ul><li>Opprette og strukturere kurs med moduler og leksjoner</li><li>Bruke alle tilgjengelige innholdsblokker for å bygge engasjerende kursinnhold</li><li>Publisere kursversjoner på en trygg og kontrollert måte</li><li>Tildele kurs til riktige brukere og grupper</li><li>Følge opp progresjon og sikre at opplæringen gir resultater</li></ul><p>Takk for at du tok deg tid til å gjennomføre dette kurset. Lykke til med administrasjonen av Egen Akademi!</p>',
                },
            },
        ],
    });


    // ── Ferdig! ──────────────────────────────────────────

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ Kurset er opprettet!');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📚 Tittel: Onboarding for administratorer i Egen Akademi`);
    console.log(`🔗 Slug: ${courseSlug}`);
    console.log(`📋 Versjon: v1 (PUBLISHED)`);
    console.log(`📁 Kategori: Onboarding`);
    console.log(`🏷️  Tags: onboarding, administrator, LMS, kursbygger, tildeling, progresjon`);
    console.log(`📐 Struktur: 5 moduler, 10 leksjoner`);
    console.log(`⏱️  Estimert: ~40 min`);
    console.log(`👁️  Synlighet: Intern`);
    console.log('');
    console.log('Blokktyper brukt:');
    console.log('  ✓ TEXT (flere)\t✓ IMAGE (8)\t✓ VIDEO (2)');
    console.log('  ✓ DOCUMENT (2)\t✓ EMBED (2)\t✓ QUIZ (4)');
    console.log('  ✓ AUDIO (1)\t\t✓ CODE (1)\t✓ CALLOUT (9)');
    console.log('  ✓ CHECKLIST (3)\t✓ OPEN_RESPONSE (2)\t✓ DIVIDER (3)');

    console.log('═══════════════════════════════════════════════════════');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ Feil ved seeding:', err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
