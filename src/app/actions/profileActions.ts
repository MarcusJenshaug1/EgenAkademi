'use server';

import prisma from '@/lib/prisma';
import { auth } from '@/auth';

// ── Get my profile ──────────────────────────────────────────

export async function getMyProfile(): Promise<{
    profile: {
        id: string;
        email: string | null;
        name: string | null;
        firstName: string | null;
        lastName: string | null;
        avatarUrl: string | null;
        jobTitle: string | null;
        department: string | null;
        bio: string | null;
        phone: string | null;
        location: string | null;
        workSchedule: string | null;
        startDate: Date | null;
        globalRole: string;
        createdAt: Date;
        tenant: { name: string } | null;
        groupCount: number;
    }
} | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return { error: 'Ikke autentisert' };
        }

        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: {
                id: true,
                email: true,
                name: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
                jobTitle: true,
                department: true,
                bio: true,
                phone: true,
                location: true,
                workSchedule: true,
                startDate: true,
                globalRole: true,
                createdAt: true,
                tenant: { select: { name: true } },
                _count: { select: { groupMemberships: true } },
            },
        });

        if (!user) return { error: 'Bruker ikke funnet' };

        return {
            profile: {
                id: user.id,
                email: user.email,
                name: user.name,
                firstName: user.firstName,
                lastName: user.lastName,
                avatarUrl: user.avatarUrl,
                jobTitle: user.jobTitle,
                department: user.department,
                bio: user.bio,
                phone: user.phone,
                location: user.location,
                workSchedule: user.workSchedule,
                startDate: user.startDate,
                globalRole: user.globalRole,
                createdAt: user.createdAt,
                tenant: user.tenant,
                groupCount: user._count.groupMemberships,
            },
        };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
    }
}

// ── Update my profile ───────────────────────────────────────

export async function updateMyProfile(data: {
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    department?: string;
    bio?: string;
    phone?: string;
    location?: string;
    workSchedule?: string;
    avatarUrl?: string | null;
}): Promise<{ success: true } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return { error: 'Ikke autentisert' };
        }

        const updateData: Record<string, unknown> = {};

        if (data.firstName !== undefined) {
            updateData.firstName = data.firstName.trim() || null;
        }
        if (data.lastName !== undefined) {
            updateData.lastName = data.lastName.trim() || null;
        }
        if (data.jobTitle !== undefined) {
            updateData.jobTitle = data.jobTitle.trim() || null;
        }
        if (data.department !== undefined) {
            updateData.department = data.department.trim() || null;
        }
        if (data.bio !== undefined) {
            updateData.bio = data.bio.trim() || null;
        }
        if (data.phone !== undefined) {
            updateData.phone = data.phone.trim() || null;
        }
        if (data.location !== undefined) {
            updateData.location = data.location.trim() || null;
        }
        if (data.workSchedule !== undefined) {
            updateData.workSchedule = data.workSchedule.trim() || null;
        }
        if (data.avatarUrl !== undefined) {
            updateData.avatarUrl = data.avatarUrl;
        }

        // Also update the name field for display
        if (data.firstName !== undefined || data.lastName !== undefined) {
            const user = await prisma.user.findUnique({
                where: { id: session.user.id },
                select: { firstName: true, lastName: true },
            });
            const fn = data.firstName !== undefined ? data.firstName.trim() : user?.firstName || '';
            const ln = data.lastName !== undefined ? data.lastName.trim() : user?.lastName || '';
            if (fn || ln) {
                updateData.name = [fn, ln].filter(Boolean).join(' ');
            }
        }

        await prisma.user.update({
            where: { id: session.user.id },
            data: updateData,
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
    }
}

// ── Upload avatar (base64 → data URL for simplicity) ────────
// In production, you'd upload to S3/Supabase Storage.
// For now, store as data URL (limited size) or URL string.

export async function uploadAvatar(
    base64Data: string,
    mimeType: string
): Promise<{ success: true; avatarUrl: string } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return { error: 'Ikke autentisert' };
        }

        // Validate mime type
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowed.includes(mimeType)) {
            return { error: 'Ugyldig filformat. Kun JPEG, PNG, WebP og GIF er tillatt.' };
        }

        // Check data size (max ~500KB base64 ≈ ~375KB file)
        if (base64Data.length > 700_000) {
            return { error: 'Bildet er for stort. Maks 500 KB.' };
        }

        const avatarUrl = `data:${mimeType};base64,${base64Data}`;

        await prisma.user.update({
            where: { id: session.user.id },
            data: { avatarUrl },
        });

        return { success: true, avatarUrl };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
    }
}

// ── Remove avatar ───────────────────────────────────────────

export async function removeAvatar(): Promise<{ success: true } | { error: string }> {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return { error: 'Ikke autentisert' };
        }

        await prisma.user.update({
            where: { id: session.user.id },
            data: { avatarUrl: null },
        });

        return { success: true };
    } catch (e: unknown) {
        return { error: e instanceof Error ? e.message : 'Ukjent feil' };
    }
}
