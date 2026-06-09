'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/auth';
import { checkAccess } from '@/lib/features';
import { logAudit } from '@/lib/audit';
import { sanitizeHtml } from '@/lib/sanitize';
import { revalidatePath } from 'next/cache';
import type { WikiStatus } from '@prisma/client';

// ── Helpers ─────────────────────────────────────────────────

/**
 * Authenticate + require tenant-admin. Returns userId + tenantId + email.
 * Throws on missing auth / insufficient role. Callers wrap in try/catch
 * and return a generic { error } so no internal details leak.
 */
async function requireTenantAdmin() {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
        throw new Error('Ikke autentisert');
    }
    if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
        throw new Error('Ikke tilgang');
    }
    return {
        userId: session.user.id,
        tenantId: session.user.tenantId,
        email: session.user.email ?? null,
    };
}

/** Authenticate any logged-in learner (any role). Returns userId + tenantId + isAdmin. */
async function requireLearner() {
    const session = await auth();
    if (!session?.user?.id || !session.user.tenantId) {
        throw new Error('Ikke autentisert');
    }
    const isAdmin =
        session.user.globalRole === 'TENANT_ADMIN' || session.user.globalRole === 'SYSTEM_ADMIN';
    return { userId: session.user.id, tenantId: session.user.tenantId, isAdmin };
}

/** Resolve the tenant's plan context and gate the 'wiki' (ENTERPRISE) feature. */
async function checkWikiAccess(tenantId: string): Promise<{ allowed: boolean; reason?: string }> {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true, addons: true, trialEndsAt: true },
    });
    if (!tenant) return { allowed: false, reason: 'Organisasjonen ble ikke funnet.' };
    return checkAccess(
        { plan: tenant.plan, addons: tenant.addons, trialEndsAt: tenant.trialEndsAt },
        'wiki'
    );
}

/**
 * Build a URL-safe slug from a title. Norwegian characters are transliterated
 * (æ→ae, ø→o, å→a) and everything else is lowercased + hyphenated.
 */
function slugify(input: string): string {
    const base = input
        .toLowerCase()
        .trim()
        .replace(/æ/g, 'ae')
        .replace(/ø/g, 'o')
        .replace(/å/g, 'a')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '') // strip diacritics
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return base || 'side';
}

/**
 * Ensure the produced slug is unique within the tenant. Appends -2, -3, ...
 * until free. `excludePageId` lets an update keep its own slug.
 */
async function uniqueSlug(tenantId: string, title: string, excludePageId?: string): Promise<string> {
    const base = slugify(title);
    let candidate = base;
    let counter = 1;
    // Bounded loop — at most a handful of iterations in practice.
    while (true) {
        const existing = await prisma.wikiPage.findFirst({
            where: {
                tenantId,
                slug: candidate,
                ...(excludePageId ? { id: { not: excludePageId } } : {}),
            },
            select: { id: true },
        });
        if (!existing) return candidate;
        counter += 1;
        candidate = `${base}-${counter}`;
    }
}

const VALID_ACCESS_LEVELS = ['all', 'admins'] as const;
type AccessLevel = (typeof VALID_ACCESS_LEVELS)[number];

function normalizeAccessLevel(value: unknown): AccessLevel {
    return value === 'admins' ? 'admins' : 'all';
}

function normalizeTags(tags: unknown): string[] {
    if (!Array.isArray(tags)) return [];
    const cleaned = tags
        .map((t) => (typeof t === 'string' ? t.trim() : ''))
        .filter((t) => t.length > 0)
        .slice(0, 30);
    // De-duplicate (case-insensitive), preserve first-seen casing.
    const seen = new Set<string>();
    const out: string[] = [];
    for (const tag of cleaned) {
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(tag);
    }
    return out;
}

// ── Types ───────────────────────────────────────────────────

export interface WikiTreeNode {
    id: string;
    slug: string;
    title: string;
    status: WikiStatus;
    pinned: boolean;
    accessLevel: string;
    parentPageId: string | null;
    sortOrder: number;
    children: WikiTreeNode[];
}

export interface WikiPageDetail {
    id: string;
    slug: string;
    title: string;
    contentHtml: string;
    parentPageId: string | null;
    sortOrder: number;
    status: WikiStatus;
    pinned: boolean;
    tags: string[];
    accessLevel: string;
    authorUserId: string | null;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface WikiVersionItem {
    id: string;
    title: string;
    contentHtml: string;
    editorUserId: string | null;
    editorName: string | null;
    createdAt: Date;
}

export interface WikiReaderPage {
    id: string;
    slug: string;
    title: string;
    contentHtml: string; // already sanitized
    tags: string[];
    publishedAt: Date | null;
    updatedAt: Date;
}

export interface WikiReaderTreeNode {
    id: string;
    slug: string;
    title: string;
    pinned: boolean;
    children: WikiReaderTreeNode[];
}

export interface WikiSearchHit {
    id: string;
    slug: string;
    title: string;
    snippet: string;
    tags: string[];
}

export interface WikiWhatsNewItem {
    id: string;
    slug: string;
    title: string;
    publishedAt: Date | null;
}

export interface WikiPinnedItem {
    id: string;
    slug: string;
    title: string;
}

// Shape shared by the editor tree builder.
interface FlatPage {
    id: string;
    slug: string;
    title: string;
    status: WikiStatus;
    pinned: boolean;
    accessLevel: string;
    parentPageId: string | null;
    sortOrder: number;
}

/**
 * Build a hierarchical tree from a flat, already-sorted list of pages.
 * Pages whose parent is missing (e.g. filtered out) are treated as roots so
 * nothing is silently dropped from the tree.
 */
function buildTree(pages: FlatPage[]): WikiTreeNode[] {
    const byId = new Map<string, WikiTreeNode>();
    for (const p of pages) {
        byId.set(p.id, {
            id: p.id,
            slug: p.slug,
            title: p.title,
            status: p.status,
            pinned: p.pinned,
            accessLevel: p.accessLevel,
            parentPageId: p.parentPageId,
            sortOrder: p.sortOrder,
            children: [],
        });
    }
    const roots: WikiTreeNode[] = [];
    for (const p of pages) {
        const node = byId.get(p.id)!;
        const parent = p.parentPageId ? byId.get(p.parentPageId) : undefined;
        if (parent) {
            parent.children.push(node);
        } else {
            roots.push(node);
        }
    }
    return roots;
}

// ════════════════════════════════════════════════════════════
// EDITOR (TENANT_ADMIN) — mutations gated by checkAccess('wiki')
// ════════════════════════════════════════════════════════════

/** List the full page hierarchy for the admin editor (all statuses). */
export async function listPagesTree(): Promise<
    { tree: WikiTreeNode[] } | { error: string }
> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const access = await checkWikiAccess(tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        const pages = await prisma.wikiPage.findMany({
            where: { tenantId },
            select: {
                id: true,
                slug: true,
                title: true,
                status: true,
                pinned: true,
                accessLevel: true,
                parentPageId: true,
                sortOrder: true,
            },
            orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        });

        return { tree: buildTree(pages) };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/** Get a single page (editor view — any status, tenant-scoped). */
export async function getPage(
    id: string
): Promise<{ page: WikiPageDetail } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const access = await checkWikiAccess(tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        const page = await prisma.wikiPage.findFirst({
            where: { id, tenantId },
        });
        if (!page) return { error: 'Siden ble ikke funnet' };

        return {
            page: {
                id: page.id,
                slug: page.slug,
                title: page.title,
                contentHtml: page.contentHtml,
                parentPageId: page.parentPageId,
                sortOrder: page.sortOrder,
                status: page.status,
                pinned: page.pinned,
                tags: page.tags,
                accessLevel: page.accessLevel,
                authorUserId: page.authorUserId,
                publishedAt: page.publishedAt,
                createdAt: page.createdAt,
                updatedAt: page.updatedAt,
            },
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/** Create a new DRAFT page. Slug is derived from the title and made unique. */
export async function createPage(data: {
    title: string;
    parentPageId?: string | null;
    accessLevel?: string;
}): Promise<{ success: true; pageId: string } | { error: string }> {
    try {
        const { tenantId, userId } = await requireTenantAdmin();

        const access = await checkWikiAccess(tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        const title = (data.title ?? '').trim();
        if (title.length < 2) return { error: 'Tittel må være minst 2 tegn' };

        // Validate parent belongs to the tenant when supplied.
        let parentPageId: string | null = null;
        if (data.parentPageId) {
            const parent = await prisma.wikiPage.findFirst({
                where: { id: data.parentPageId, tenantId },
                select: { id: true },
            });
            if (!parent) return { error: 'Overordnet side ble ikke funnet' };
            parentPageId = parent.id;
        }

        const slug = await uniqueSlug(tenantId, title);

        const page = await prisma.wikiPage.create({
            data: {
                tenantId,
                title,
                slug,
                contentHtml: '',
                parentPageId,
                accessLevel: normalizeAccessLevel(data.accessLevel),
                status: 'DRAFT',
                authorUserId: userId,
            },
            select: { id: true },
        });

        revalidatePath('/admin/wiki');
        return { success: true, pageId: page.id };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/**
 * Update a page. On a content/title change the PRIOR version is snapshotted
 * into WikiPageVersion before the new values are written. All HTML is
 * sanitized before storage.
 */
export async function updatePage(
    id: string,
    data: {
        title?: string;
        contentHtml?: string;
        parentPageId?: string | null;
        sortOrder?: number;
        tags?: string[];
        accessLevel?: string;
        pinned?: boolean;
    }
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId } = await requireTenantAdmin();

        const access = await checkWikiAccess(tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        const existing = await prisma.wikiPage.findFirst({
            where: { id, tenantId },
        });
        if (!existing) return { error: 'Siden ble ikke funnet' };

        const update: {
            title?: string;
            slug?: string;
            contentHtml?: string;
            parentPageId?: string | null;
            sortOrder?: number;
            tags?: string[];
            accessLevel?: string;
            pinned?: boolean;
        } = {};

        // Title change → re-slug (kept unique) and flag for snapshot.
        let titleChanged = false;
        if (data.title !== undefined) {
            const title = data.title.trim();
            if (title.length < 2) return { error: 'Tittel må være minst 2 tegn' };
            if (title !== existing.title) {
                titleChanged = true;
                update.title = title;
                update.slug = await uniqueSlug(tenantId, title, id);
            }
        }

        // Content change → sanitize before store and flag for snapshot.
        let contentChanged = false;
        let sanitized: string | undefined;
        if (data.contentHtml !== undefined) {
            sanitized = sanitizeHtml(data.contentHtml);
            if (sanitized !== existing.contentHtml) {
                contentChanged = true;
                update.contentHtml = sanitized;
            }
        }

        if (data.parentPageId !== undefined) {
            if (data.parentPageId === null) {
                update.parentPageId = null;
            } else {
                if (data.parentPageId === id) {
                    return { error: 'En side kan ikke være sin egen overordnede side' };
                }
                const parent = await prisma.wikiPage.findFirst({
                    where: { id: data.parentPageId, tenantId },
                    select: { id: true, parentPageId: true },
                });
                if (!parent) return { error: 'Overordnet side ble ikke funnet' };

                // Walk the proposed parent's ancestor chain. If we ever reach
                // this page, the move would create a cycle (at any depth), which
                // would orphan the whole loop from the rendered tree. Tenant-
                // scoped lookups + a bounded walk guard against runaway loops.
                let cursorId: string | null = parent.parentPageId;
                let hops = 0;
                while (cursorId) {
                    if (cursorId === id) {
                        return { error: 'Ugyldig hierarki' };
                    }
                    if (hops >= 1000) {
                        // Pre-existing cycle in stored data — refuse rather than loop.
                        return { error: 'Ugyldig hierarki' };
                    }
                    const ancestor: { parentPageId: string | null } | null =
                        await prisma.wikiPage.findFirst({
                            where: { id: cursorId, tenantId },
                            select: { parentPageId: true },
                        });
                    cursorId = ancestor?.parentPageId ?? null;
                    hops += 1;
                }
                update.parentPageId = parent.id;
            }
        }

        if (data.sortOrder !== undefined && Number.isFinite(data.sortOrder)) {
            update.sortOrder = Math.round(data.sortOrder);
        }
        if (data.tags !== undefined) {
            update.tags = normalizeTags(data.tags);
        }
        if (data.accessLevel !== undefined) {
            update.accessLevel = normalizeAccessLevel(data.accessLevel);
        }
        if (data.pinned !== undefined) {
            update.pinned = Boolean(data.pinned);
        }

        // Snapshot the PRIOR version when content or title is changing.
        if (titleChanged || contentChanged) {
            await prisma.wikiPageVersion.create({
                data: {
                    tenantId,
                    pageId: id,
                    title: existing.title,
                    contentHtml: existing.contentHtml,
                    editorUserId: userId,
                },
            });
        }

        await prisma.wikiPage.update({
            where: { id },
            data: update,
        });

        revalidatePath('/admin/wiki');
        revalidatePath('/learn/wiki');
        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/** Move a DRAFT page into PENDING_REVIEW. */
export async function submitForReview(
    id: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const access = await checkWikiAccess(tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        const page = await prisma.wikiPage.findFirst({
            where: { id, tenantId },
            select: { id: true, status: true },
        });
        if (!page) return { error: 'Siden ble ikke funnet' };
        if (page.status !== 'DRAFT') {
            return { error: 'Kun utkast kan sendes til gjennomgang' };
        }

        await prisma.wikiPage.update({
            where: { id },
            data: { status: 'PENDING_REVIEW' },
        });

        revalidatePath('/admin/wiki');
        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/** Approve + publish a page (sets publishedAt). */
export async function publishPage(
    id: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();

        const access = await checkWikiAccess(tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        const page = await prisma.wikiPage.findFirst({
            where: { id, tenantId },
            select: { id: true, publishedAt: true },
        });
        if (!page) return { error: 'Siden ble ikke funnet' };

        await prisma.wikiPage.update({
            where: { id },
            data: {
                status: 'PUBLISHED',
                // Set first-publish time once; keep the original thereafter.
                publishedAt: page.publishedAt ?? new Date(),
            },
        });

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'wiki.page.published',
            targetType: 'wiki_page',
            targetId: id,
        });

        revalidatePath('/admin/wiki');
        revalidatePath('/learn/wiki');
        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/** Unpublish a page back to DRAFT (it disappears from the reader). */
export async function unpublishPage(
    id: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const access = await checkWikiAccess(tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        const page = await prisma.wikiPage.findFirst({
            where: { id, tenantId },
            select: { id: true },
        });
        if (!page) return { error: 'Siden ble ikke funnet' };

        await prisma.wikiPage.update({
            where: { id },
            data: { status: 'DRAFT' },
        });

        revalidatePath('/admin/wiki');
        revalidatePath('/learn/wiki');
        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/**
 * Delete a page. Children are reparented to the deleted page's parent so the
 * tree stays connected. Versions cascade-delete via the schema relation.
 */
export async function deletePage(
    id: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId, email } = await requireTenantAdmin();

        const access = await checkWikiAccess(tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        const page = await prisma.wikiPage.findFirst({
            where: { id, tenantId },
            select: { id: true, parentPageId: true, title: true },
        });
        if (!page) return { error: 'Siden ble ikke funnet' };

        // Reparent children, then delete, atomically.
        await prisma.$transaction([
            prisma.wikiPage.updateMany({
                where: { tenantId, parentPageId: id },
                data: { parentPageId: page.parentPageId },
            }),
            prisma.wikiPage.delete({ where: { id } }),
        ]);

        await logAudit({
            tenantId,
            actorUserId: userId,
            actorEmail: email,
            action: 'wiki.page.deleted',
            targetType: 'wiki_page',
            targetId: id,
            metadata: { title: page.title },
        });

        revalidatePath('/admin/wiki');
        revalidatePath('/learn/wiki');
        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/** List a page's version history (newest first). */
export async function listVersions(
    pageId: string
): Promise<{ versions: WikiVersionItem[] } | { error: string }> {
    try {
        const { tenantId } = await requireTenantAdmin();

        const access = await checkWikiAccess(tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        // Verify the page belongs to the tenant before reading its versions.
        const page = await prisma.wikiPage.findFirst({
            where: { id: pageId, tenantId },
            select: { id: true },
        });
        if (!page) return { error: 'Siden ble ikke funnet' };

        const versions = await prisma.wikiPageVersion.findMany({
            where: { tenantId, pageId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        // Resolve editor display names in one query.
        const editorIds = Array.from(
            new Set(versions.map((v) => v.editorUserId).filter((x): x is string => Boolean(x)))
        );
        const editors = editorIds.length
            ? await prisma.user.findMany({
                  where: { id: { in: editorIds }, tenantId },
                  select: { id: true, name: true, firstName: true, lastName: true, email: true },
              })
            : [];
        const nameById = new Map(
            editors.map((u) => {
                const name =
                    [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email || null;
                return [u.id, name];
            })
        );

        return {
            versions: versions.map((v) => ({
                id: v.id,
                title: v.title,
                contentHtml: v.contentHtml,
                editorUserId: v.editorUserId,
                editorName: v.editorUserId ? nameById.get(v.editorUserId) ?? null : null,
                createdAt: v.createdAt,
            })),
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/**
 * Restore a previous version: snapshot the CURRENT content first, then
 * overwrite the live page with the chosen version's title + content.
 */
export async function restoreVersion(
    pageId: string,
    versionId: string
): Promise<{ success: true } | { error: string }> {
    try {
        const { tenantId, userId } = await requireTenantAdmin();

        const access = await checkWikiAccess(tenantId);
        if (!access.allowed) return { error: access.reason ?? 'Ingen tilgang til denne funksjonen.' };

        const [page, version] = await Promise.all([
            prisma.wikiPage.findFirst({
                where: { id: pageId, tenantId },
            }),
            prisma.wikiPageVersion.findFirst({
                where: { id: versionId, pageId, tenantId },
            }),
        ]);
        if (!page) return { error: 'Siden ble ikke funnet' };
        if (!version) return { error: 'Versjonen ble ikke funnet' };

        // Re-sanitize the stored version content as defence-in-depth.
        const restoredHtml = sanitizeHtml(version.contentHtml);
        const restoredSlug =
            version.title !== page.title
                ? await uniqueSlug(tenantId, version.title, pageId)
                : page.slug;

        await prisma.$transaction([
            // Snapshot the current live content before replacing it.
            prisma.wikiPageVersion.create({
                data: {
                    tenantId,
                    pageId,
                    title: page.title,
                    contentHtml: page.contentHtml,
                    editorUserId: userId,
                },
            }),
            prisma.wikiPage.update({
                where: { id: pageId },
                data: {
                    title: version.title,
                    slug: restoredSlug,
                    contentHtml: restoredHtml,
                },
            }),
        ]);

        revalidatePath('/admin/wiki');
        revalidatePath('/learn/wiki');
        return { success: true };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

// ════════════════════════════════════════════════════════════
// READER (auth-only, tenant-scoped) — all gated by 'wiki'
// ════════════════════════════════════════════════════════════

/**
 * Reader WHERE clause: PUBLISHED pages in the tenant the caller may see.
 * Non-admins are restricted to accessLevel:'all'.
 */
function readerWhere(tenantId: string, isAdmin: boolean) {
    return {
        tenantId,
        status: 'PUBLISHED' as WikiStatus,
        ...(isAdmin ? {} : { accessLevel: 'all' }),
    };
}

function readerTree(
    pages: { id: string; slug: string; title: string; pinned: boolean; parentPageId: string | null }[]
): WikiReaderTreeNode[] {
    const byId = new Map<string, WikiReaderTreeNode>();
    for (const p of pages) {
        byId.set(p.id, {
            id: p.id,
            slug: p.slug,
            title: p.title,
            pinned: p.pinned,
            children: [],
        });
    }
    const roots: WikiReaderTreeNode[] = [];
    for (const p of pages) {
        const node = byId.get(p.id)!;
        const parent = p.parentPageId ? byId.get(p.parentPageId) : undefined;
        if (parent) parent.children.push(node);
        else roots.push(node);
    }
    return roots;
}

/** Published page hierarchy the caller may see. Locked → empty + flag. */
export async function getPublishedTree(): Promise<
    { tree: WikiReaderTreeNode[]; locked: boolean; reason?: string }
> {
    try {
        const { tenantId, isAdmin } = await requireLearner();

        const access = await checkWikiAccess(tenantId);
        if (!access.allowed) return { tree: [], locked: true, reason: access.reason };

        const pages = await prisma.wikiPage.findMany({
            where: readerWhere(tenantId, isAdmin),
            select: {
                id: true,
                slug: true,
                title: true,
                pinned: true,
                parentPageId: true,
            },
            orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        });

        return { tree: readerTree(pages), locked: false };
    } catch {
        return { tree: [], locked: false };
    }
}

/** Fetch a single PUBLISHED page by slug, with sanitized HTML. */
export async function getPublishedPage(
    slug: string
): Promise<{ page: WikiReaderPage } | { locked: true; reason?: string } | { error: string }> {
    try {
        const { tenantId, isAdmin } = await requireLearner();

        const access = await checkWikiAccess(tenantId);
        if (!access.allowed) return { locked: true, reason: access.reason };

        const page = await prisma.wikiPage.findFirst({
            where: {
                ...readerWhere(tenantId, isAdmin),
                slug,
            },
            select: {
                id: true,
                slug: true,
                title: true,
                contentHtml: true,
                tags: true,
                publishedAt: true,
                updatedAt: true,
            },
        });
        if (!page) return { error: 'Siden ble ikke funnet' };

        return {
            page: {
                id: page.id,
                slug: page.slug,
                title: page.title,
                // Defence-in-depth: re-sanitize on the way out.
                contentHtml: sanitizeHtml(page.contentHtml),
                tags: page.tags,
                publishedAt: page.publishedAt,
                updatedAt: page.updatedAt,
            },
        };
    } catch {
        return { error: 'Ukjent feil' };
    }
}

/** Search PUBLISHED visible pages by title / tag / content. */
export async function searchWiki(
    term: string
): Promise<{ hits: WikiSearchHit[]; locked: boolean }> {
    try {
        const { tenantId, isAdmin } = await requireLearner();

        const access = await checkWikiAccess(tenantId);
        if (!access.allowed) return { hits: [], locked: true };

        const q = (term ?? '').trim();
        if (q.length < 2) return { hits: [], locked: false };

        const pages = await prisma.wikiPage.findMany({
            where: {
                ...readerWhere(tenantId, isAdmin),
                OR: [
                    { title: { contains: q, mode: 'insensitive' } },
                    { contentHtml: { contains: q, mode: 'insensitive' } },
                    { tags: { has: q } },
                ],
            },
            select: {
                id: true,
                slug: true,
                title: true,
                contentHtml: true,
                tags: true,
            },
            orderBy: [{ pinned: 'desc' }, { title: 'asc' }],
            take: 25,
        });

        const lowerQ = q.toLowerCase();

        return {
            hits: pages.map((p) => {
                // Build a short text snippet around the match (HTML stripped).
                const text = p.contentHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                const idx = text.toLowerCase().indexOf(lowerQ);
                let snippet: string;
                if (idx >= 0) {
                    const start = Math.max(0, idx - 40);
                    snippet = (start > 0 ? '…' : '') + text.slice(start, start + 160);
                    if (text.length > start + 160) snippet += '…';
                } else {
                    snippet = text.slice(0, 160) + (text.length > 160 ? '…' : '');
                }
                return {
                    id: p.id,
                    slug: p.slug,
                    title: p.title,
                    snippet,
                    tags: p.tags,
                };
            }),
            locked: false,
        };
    } catch {
        return { hits: [], locked: false };
    }
}

/** Recently published pages the caller may see. */
export async function getWhatsNew(
    limit = 10
): Promise<{ items: WikiWhatsNewItem[]; locked: boolean }> {
    try {
        const { tenantId, isAdmin } = await requireLearner();

        const access = await checkWikiAccess(tenantId);
        if (!access.allowed) return { items: [], locked: true };

        const safeLimit = Math.min(Math.max(1, Math.round(limit)), 50);

        const pages = await prisma.wikiPage.findMany({
            where: {
                ...readerWhere(tenantId, isAdmin),
                publishedAt: { not: null },
            },
            select: { id: true, slug: true, title: true, publishedAt: true },
            orderBy: { publishedAt: 'desc' },
            take: safeLimit,
        });

        return {
            items: pages.map((p) => ({
                id: p.id,
                slug: p.slug,
                title: p.title,
                publishedAt: p.publishedAt,
            })),
            locked: false,
        };
    } catch {
        return { items: [], locked: false };
    }
}

/** Pinned PUBLISHED pages the caller may see. */
export async function getPinnedPages(): Promise<{ items: WikiPinnedItem[]; locked: boolean }> {
    try {
        const { tenantId, isAdmin } = await requireLearner();

        const access = await checkWikiAccess(tenantId);
        if (!access.allowed) return { items: [], locked: true };

        const pages = await prisma.wikiPage.findMany({
            where: {
                ...readerWhere(tenantId, isAdmin),
                pinned: true,
            },
            select: { id: true, slug: true, title: true },
            orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
            take: 25,
        });

        return {
            items: pages.map((p) => ({ id: p.id, slug: p.slug, title: p.title })),
            locked: false,
        };
    } catch {
        return { items: [], locked: false };
    }
}
