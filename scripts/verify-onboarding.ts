import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const envFile = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8');
for (const line of envFile.split('\n')) {
    const m = line.match(/^([^#=]+)=["']?(.+?)["']?$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function verify() {
    const course = await prisma.course.findFirst({
        where: { slug: 'onboarding-for-administratorer-i-egen-akademi' },
        include: {
            currentPublishedVersion: {
                include: {
                    modules: {
                        include: {
                            lessons: {
                                include: { blocks: { select: { type: true } } },
                                orderBy: { position: 'asc' },
                            },
                        },
                        orderBy: { position: 'asc' },
                    },
                },
            },
            categories: { include: { category: true } },
            tags: { include: { tag: true } },
        },
    });

    if (!course) {
        console.log('NOT FOUND');
        return;
    }

    console.log('=== KURS ===');
    console.log(course.title, '|', course.status, '|', course.visibility, '|', course.difficulty);
    console.log('\nKategorier:', course.categories.map((c) => c.category.name).join(', '));
    console.log('Tags:', course.tags.map((t) => t.tag.label).join(', '));

    const v = course.currentPublishedVersion!;
    console.log('\nVersjon:', v.versionNumber, '|', v.state, '| Pub:', v.publishedAt);

    const blockTypes: Record<string, number> = {};
    let totalBlocks = 0;

    for (const mod of v.modules) {
        console.log('\n  Modul', mod.position + 1, ':', mod.title);
        for (const les of mod.lessons) {
            const types = les.blocks.map((b) => b.type).join(', ');
            console.log('    Leksjon:', les.title, '(' + les.blocks.length + ' blokker):', types);
            for (const b of les.blocks) {
                blockTypes[b.type] = (blockTypes[b.type] || 0) + 1;
                totalBlocks++;
            }
        }
    }

    console.log('\n=== BLOKKSTATISTIKK ===');
    console.log('Totalt:', totalBlocks, 'blokker');
    for (const [t, c] of Object.entries(blockTypes).sort()) {
        console.log(' ', t, ':', c);
    }

    // Check all 12 types are present
    const allTypes = ['TEXT', 'IMAGE', 'VIDEO', 'QUIZ', 'DOCUMENT', 'EMBED', 'AUDIO', 'CODE', 'CALLOUT', 'CHECKLIST', 'OPEN_RESPONSE', 'DIVIDER'];
    const missing = allTypes.filter((t) => !blockTypes[t]);
    if (missing.length > 0) {
        console.log('\n!! MANGLER blokktyper:', missing.join(', '));
    } else {
        console.log('\nAlle 12 blokktyper er representert!');
    }
}

verify()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
