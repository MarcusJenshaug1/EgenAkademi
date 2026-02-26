import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// Max filstørrelse: 2MB for images/fonts, 10MB for audio
const MAX_SIZE = 2 * 1024 * 1024;
const MAX_AUDIO_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'];
const ALLOWED_FONT_TYPES = ['font/woff2', 'font/woff', 'font/ttf', 'font/otf', 'application/font-woff', 'application/font-woff2', 'application/x-font-ttf', 'application/x-font-opentype', 'application/octet-stream'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/mp4', 'audio/webm'];
const FONT_EXTENSIONS = ['.woff2', '.woff', '.ttf', '.otf'];

export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id || !session?.user?.tenantId) {
            return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const type = formData.get('type') as string;

        if (!file) {
            return NextResponse.json({ error: 'Ingen fil valgt' }, { status: 400 });
        }

        // Validate type parameter against allowlist to prevent directory traversal
        const ALLOWED_TYPES = ['logo', 'favicon', 'font', 'avatar', 'image', 'audio'];
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

        const sizeLimit = isAudio ? MAX_AUDIO_SIZE : MAX_SIZE;
        if (file.size > sizeLimit) {
            return NextResponse.json(
                { error: isAudio ? 'Filen er for stor. Maks 10MB for lyd.' : 'Filen er for stor. Maks 2MB.' },
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
        const uploadSubdir = isFont ? 'fonts' : isAudio ? 'audio' : type === 'avatar' ? 'avatars' : type === 'image' ? 'images' : 'logos';
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
