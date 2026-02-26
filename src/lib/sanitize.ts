import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML to prevent XSS attacks.
 * Uses DOMPurify under the hood — safe for both server and client.
 *
 * Allows standard HTML tags used by Lexical editor output.
 * Strips all <script>, <iframe>, event handlers (onclick, onerror, etc.),
 * and dangerous attributes.
 */
export function sanitizeHtml(dirty: string): string {
    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: [
            // Text formatting
            'p', 'br', 'b', 'i', 'u', 'em', 'strong', 's', 'sub', 'sup', 'mark',
            // Headings
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            // Lists
            'ul', 'ol', 'li',
            // Links & images
            'a', 'img',
            // Block elements
            'div', 'span', 'blockquote', 'pre', 'code', 'hr',
            // Tables
            'table', 'thead', 'tbody', 'tr', 'th', 'td',
        ],
        ALLOWED_ATTR: [
            'href', 'target', 'rel', 'src', 'alt', 'width', 'height',
            'class', 'id', 'style', 'title', 'colspan', 'rowspan',
        ],
        ALLOW_DATA_ATTR: false,
    });
}

/**
 * Sanitize embed HTML — more permissive, allows iframes for video embeds.
 * Use only for EMBED blocks where admin has explicitly added embed code.
 * Uses explicit ALLOWED_TAGS (not ADD_TAGS) to avoid inheriting the full default allowlist.
 */
export function sanitizeEmbed(dirty: string): string {
    return DOMPurify.sanitize(dirty, {
        ALLOWED_TAGS: [
            // Embed containers
            'iframe', 'div', 'span', 'p', 'br',
            // Text formatting (for embed captions/descriptions)
            'a', 'b', 'i', 'em', 'strong',
        ],
        ALLOWED_ATTR: [
            'allow', 'allowfullscreen', 'frameborder', 'scrolling',
            'src', 'width', 'height', 'title', 'class', 'style',
            'href', 'target', 'rel',
        ],
        ALLOW_DATA_ATTR: false,
    });
}
