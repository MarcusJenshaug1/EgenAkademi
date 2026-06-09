import type { MediaKind } from '@prisma/client';

/**
 * Avled MediaKind fra en MIME-type.
 * Delt mellom opplastings-API-et og innholdsbiblioteket slik at
 * klassifiseringen forblir konsistent.
 */
export function kindFromMimeType(mimeType: string | null | undefined): MediaKind {
    if (!mimeType) return 'OTHER';
    if (mimeType.startsWith('image/')) return 'IMAGE';
    if (mimeType.startsWith('video/')) return 'VIDEO';
    if (mimeType.startsWith('audio/')) return 'AUDIO';
    if (
        mimeType === 'application/pdf' ||
        mimeType.startsWith('application/vnd') ||
        mimeType === 'application/msword' ||
        mimeType === 'text/plain' ||
        mimeType === 'text/csv'
    ) {
        return 'DOCUMENT';
    }
    return 'OTHER';
}
