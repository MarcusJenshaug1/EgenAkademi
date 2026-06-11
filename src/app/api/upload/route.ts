import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { kindFromMimeType } from '@/lib/mediaKind';
import { checkRateLimit } from '@/lib/rateLimit';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// Max filstørrelse: 2MB for images/fonts, 10MB for audio
const MAX_SIZE = 2 * 1024 * 1024;
const MAX_AUDIO_SIZE = 10 * 1024 * 1024;
// Mediebibliotek: tillat større filer (video/dokumenter), men med et fast tak.
const MAX_MEDIA_SIZE = 50 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'];
const ALLOWED_FONT_TYPES = ['font/woff2', 'font/woff', 'font/ttf', 'font/otf', 'application/font-woff', 'application/font-woff2', 'application/x-font-ttf', 'application/x-font-opentype', 'application/octet-stream'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mp4', 'audio/webm'];
const FONT_EXTENSIONS = ['.woff2', '.woff', '.ttf', '.otf'];

// Mediebibliotek-allowlist: bilder, PDF, vanlige dokumenter, lyd og video.
const ALLOWED_MEDIA_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];
const ALLOWED_MEDIA_DOC_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
];
const ALLOWED_MEDIA_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mp4', 'audio/webm'];
const ALLOWED_MEDIA_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
const ALLOWED_MEDIA_TYPES = [
    ...ALLOWED_MEDIA_IMAGE_TYPES,
    ...ALLOWED_MEDIA_DOC_TYPES,
    ...ALLOWED_MEDIA_AUDIO_TYPES,
    ...ALLOWED_MEDIA_VIDEO_TYPES,
];

export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id || !session?.user?.tenantId) {
            return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
        }

        const userId = session.user.id;

        // Rate limiting (sikkerhetsregel #8): maks 30 opplastinger per minutt per bruker.
        const rl = await checkRateLimit(`upload:${userId}`, 30, 60_000);
        if (!rl.allowed) {
            return NextResponse.json(
                { error: 'For mange forespørsler. Prøv igjen senere.' },
                { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } }
            );
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const type = formData.get('type') as string;

        if (!file) {
            return NextResponse.json({ error: 'Ingen fil valgt' }, { status: 400 });
        }

        // Validate type parameter against allowlist to prevent directory traversal
        const ALLOWED_TYPES = ['logo', 'favicon', 'font', 'avatar', 'image', 'audio', 'media'];
        if (!type || !ALLOWED_TYPES.includes(type)) {
            return NextResponse.json({ error: 'Ugyldig opplastingstype' }, { status: 400 });
        }

        // Avatar uploads allowed for any authenticated user; other uploads require admin
        if (type !== 'avatar') {
            if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
                return NextResponse.json({ error: 'Ingen tilgang' }, { status: 403 });
            }
        }

        const isFont = type === 'font';
        const isAudio = type === 'audio';
        const isMedia = type === 'media';

        const sizeLimit = isMedia ? MAX_MEDIA_SIZE : isAudio ? MAX_AUDIO_SIZE : MAX_SIZE;
        if (file.size > sizeLimit) {
            return NextResponse.json(
                {
                    error: isMedia
                        ? 'Filen er for stor. Maks 50MB for mediefiler.'
                        : isAudio
                            ? 'Filen er for stor. Maks 10MB for lyd.'
                            : 'Filen er for stor. Maks 2MB.',
                },
                { status: 400 }
            );
        }

        const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');

        if (isFont) {
            if (!ALLOWED_FONT_TYPES.includes(file.type) && !FONT_EXTENSIONS.includes(ext)) {
                return NextResponse.json(
                    { error: `Ugyldig filtype. Tillatte fonttyper: WOFF2, WOFF, TTF, OTF.` },
                    { status: 400 }
                );
            }
        } else if (isAudio) {
            if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
                return NextResponse.json(
                    { error: `Ugyldig filtype: ${file.type}. Tillatte lydtyper: MP3, WAV, OGG, AAC.` },
                    { status: 400 }
                );
            }
        } else if (isMedia) {
            if (!ALLOWED_MEDIA_TYPES.includes(file.type)) {
                return NextResponse.json(
                    { error: `Ugyldig filtype: ${file.type}. Tillatte typer: bilder, PDF, dokumenter, lyd og video.` },
                    { status: 400 }
                );
            }
        } else {
            if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
                return NextResponse.json(
                    { error: `Ugyldig filtype: ${file.type}. Tillatte typer: SVG, PNG, JPEG, WebP, ICO.` },
                    { status: 400 }
                );
            }
        }

        const tenantId = session.user.tenantId;
        // Sanitize file extension — allow only alphanumeric characters
        const rawExt = file.name.split('.').pop()?.toLowerCase() || (isFont ? 'woff2' : isAudio ? 'mp3' : 'png');
        const fileExt = rawExt.replace(/[^a-z0-9]/g, '') || 'bin';
        const filename = `${type}-${tenantId}-${Date.now()}.${fileExt}`;

        // Opprett mappe
        const uploadSubdir = isFont
            ? 'fonts'
            : isAudio
                ? 'audio'
                : isMedia
                    ? 'media'
                    : type === 'avatar'
                        ? 'avatars'
                        : type === 'image'
                            ? 'images'
                            : 'logos';
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', uploadSubdir);
        await mkdir(uploadDir, { recursive: true });

        // Les filinnhold
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Valider SVG-innhold FØR skriving til disk
        let svgContent: string | null = null;
        if (file.type === 'image/svg+xml') {
            svgContent = buffer.toString('utf-8');

            // Validate SVG: must contain <svg tag
            if (!svgContent.match(/<svg[\s>]/i)) {
                return NextResponse.json({ error: 'Ugyldig SVG-fil.' }, { status: 400 });
            }
            // Reject dangerous content in SVG
            const dangerousPatterns = /<script[\s>]|on\w+\s*=|javascript:|data:text\/html/gi;
            if (dangerousPatterns.test(svgContent)) {
                return NextResponse.json({ error: 'SVG-filen inneholder potensielt farlig innhold.' }, { status: 400 });
            }
        }

        // Skriv fil (etter validering)
        const filePath = path.join(uploadDir, filename);
        await writeFile(filePath, buffer);

        const url = `/uploads/${uploadSubdir}/${filename}`;

        // For mediebibliotek: registrer en tenant-scoped MediaAsset-rad.
        if (isMedia) {
            const asset = await prisma.mediaAsset.create({
                data: {
                    tenantId,
                    uploadedByUserId: session.user.id,
                    url,
                    filename: file.name,
                    mimeType: file.type || null,
                    sizeBytes: file.size,
                    kind: kindFromMimeType(file.type),
                },
                select: {
                    id: true,
                    filename: true,
                    url: true,
                    kind: true,
                    mimeType: true,
                    sizeBytes: true,
                    createdAt: true,
                },
            });

            return NextResponse.json({
                success: true,
                url,
                filename,
                isSvg: file.type === 'image/svg+xml',
                svgContent,
                asset,
            });
        }

        return NextResponse.json({
            success: true,
            url,
            filename,
            isSvg: file.type === 'image/svg+xml',
            svgContent,
        });
    } catch {
        return NextResponse.json({ error: 'Opplastingsfeil' }, { status: 500 });
    }
}
