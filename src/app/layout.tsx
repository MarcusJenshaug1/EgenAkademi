import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import {
  buildBrandingVars,
  brandingVarsToCssText,
} from '@/lib/brandingVars';

export const metadata: Metadata = {
  title: 'Egen Akademi LMS',
  description: 'Whitelabel læringsplattform for din virksomhet',
};

/**
 * Deterministic short string hash (djb2 variant) used as a STABLE favicon
 * cache-busting version. The output depends only on the favicon value, never
 * on time/clock, so it stays identical across renders — keeping the browser
 * cache effective and avoiding hydration mismatches, while changing whenever
 * the favicon itself changes.
 */
function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  // Coerce to unsigned 32-bit and base36-encode for a short token.
  return (hash >>> 0).toString(36);
}

async function getTenantBranding(): Promise<{ style: string; fontFamily?: string; fontSource?: string; customFontUrl?: string; faviconUrl?: string; tenantName?: string } | null> {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return null;

    const tenant = await prisma.tenant.findUnique({
      where: { id: session.user.tenantId },
      select: {
        name: true,
        colorBgPrimary: true,
        colorBgSecondary: true,
        colorTextPrimary: true,
        colorTextSecondary: true,
        colorBorder: true,
        colorAccent: true,
        colorButtonPrimary: true,
        colorButtonText: true,
        colorSidebarBg: true,
        colorSidebarText: true,
        colorSidebarActive: true,
        colorSuccess: true,
        colorWarning: true,
        colorDanger: true,
        fontFamily: true,
        fontSource: true,
        customFontUrl: true,
        faviconUrl: true,
      },
    });

    if (!tenant) return null;

    // Bygg alle CSS-variabler (base + avledede) via den delte builderen,
    // slik at live-forhåndsvisningen matcher produksjon nøyaktig.
    const vars = buildBrandingVars(tenant);

    return {
      style: brandingVarsToCssText(vars),
      fontFamily: tenant.fontFamily || undefined,
      fontSource: tenant.fontSource || undefined,
      customFontUrl: tenant.customFontUrl || undefined,
      faviconUrl: tenant.faviconUrl || undefined,
      tenantName: tenant.name || undefined,
    };
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const branding = await getTenantBranding();

  // Stable, deterministic cache-busting version derived from the favicon value.
  // Same favicon → same ?v= token across every render (cache-friendly, no
  // hydration mismatch); a new favicon yields a new token to bust the cache.
  const faviconHref = branding?.faviconUrl
    ? `${branding.faviconUrl}${branding.faviconUrl.includes('?') ? '&' : '?'}v=${stableHash(branding.faviconUrl)}`
    : null;

  return (
    <html lang="no">
      <head>
        {faviconHref && (
          <link rel="icon" href={faviconHref} />
        )}
        {branding?.fontSource === 'google' && branding?.fontFamily && (
          <link
            rel="stylesheet"
            href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(branding.fontFamily)}:wght@300;400;500;600;700&display=swap`}
          />
        )}
        {branding?.fontSource === 'custom' && branding?.customFontUrl && branding?.fontFamily && (
          <style dangerouslySetInnerHTML={{ __html: `
            @font-face {
              font-family: '${branding.fontFamily}';
              src: url('${branding.customFontUrl}');
              font-weight: 100 900;
              font-display: swap;
            }
          ` }} />
        )}
        {branding?.style && (
          <style dangerouslySetInnerHTML={{ __html: `:root { ${branding.style} }` }} />
        )}
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
