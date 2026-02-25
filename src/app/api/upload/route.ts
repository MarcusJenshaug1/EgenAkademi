import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

// Max filstørrelse: 2MB
const MAX_SIZE = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/x-icon', 'image/vnd.microsoft.icon'];
const ALLOWED_FONT_TYPES = ['font/woff2', 'font/woff', 'font/ttf', 'font/otf', 'application/font-woff', 'application/font-woff2', 'application/x-font-ttf', 'application/x-font-opentype', 'application/octet-stream'];
const FONT_EXTENSIONS = ['.woff2', '.woff', '.ttf', '.otf'];

export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id || !session?.user?.tenantId) {
            return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
        }

        if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
            return NextResponse.json({ error: 'Ingen tilgang' }, { status: 403 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const type = formData.get('type') as string; // 'logo', 'favicon', eller 'font'

        if (!file) {
            return NextResponse.json({ error: 'Ingen fil valgt' }, { status: 400 });
        }

        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: 'Filen er for stor. Maks 2MB.' }, { status: 400 });
        }

        const isFont = type === 'font';
        const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');

        if (isFont) {
            if (!ALLOWED_FONT_TYPES.includes(file.type) && !FONT_EXTENSIONS.includes(ext)) {
                return NextResponse.json(
                    { error: `Ugyldig filtype. Tillatte fonttyper: WOFF2, WOFF, TTF, OTF.` },
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
        const fileExt = file.name.split('.').pop()?.toLowerCase() || (isFont ? 'woff2' : 'png');
        const filename = `${type}-${tenantId}-${Date.now()}.${fileExt}`;

        // Opprett mappe
        const uploadSubdir = isFont ? 'fonts' : 'logos';
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', uploadSubdir);
        await mkdir(uploadDir, { recursive: true });

        // Les filinnhold
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Skriv fil
        const filePath = path.join(uploadDir, filename);
        await writeFile(filePath, buffer);

        const url = `/uploads/${uploadSubdir}/${filename}`;

        // Hvis SVG, returner også innholdet for fargeredigering
        let svgContent: string | null = null;
        if (file.type === 'image/svg+xml') {
            svgContent = buffer.toString('utf-8');

            // Enkel validering: sjekk at det faktisk er en SVG
            if (!svgContent.includes('<svg')) {
                return NextResponse.json({ error: 'Ugyldig SVG-fil.' }, { status: 400 });
            }
        }

        return NextResponse.json({
            success: true,
            url,
            filename,
            isSvg: file.type === 'image/svg+xml',
            svgContent,
        });
    } catch (e: any) {
        console.error('Upload feil:', e);
        return NextResponse.json({ error: e.message || 'Opplastingsfeil' }, { status: 500 });
    }
}
