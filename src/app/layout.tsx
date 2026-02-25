import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/Providers';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';

export const metadata: Metadata = {
  title: 'Egen Akademi LMS',
  description: 'Whitelabel læringsplattform for din virksomhet',
};

// Mapping fra DB-feltnavn til CSS-variabelnavn
const CSS_VAR_MAP: Record<string, string> = {
  colorBgPrimary: '--color-bg-primary',
  colorBgSecondary: '--color-bg-secondary',
  colorTextPrimary: '--color-text-primary',
  colorTextSecondary: '--color-text-secondary',
  colorBorder: '--color-border',
  colorAccent: '--color-accent-blue',
  colorButtonPrimary: '--color-button-primary',
  colorButtonText: '--color-button-text',
  colorSidebarBg: '--color-sidebar-bg',
  colorSidebarText: '--color-sidebar-text',
  colorSidebarActive: '--color-sidebar-active',
  colorSuccess: '--color-success',
  colorWarning: '--color-warning',
  colorDanger: '--color-danger',
};

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

    // Bygg CSS-variabel-streng fra alle non-null verdier
    const vars: string[] = [];
    for (const [dbField, cssVar] of Object.entries(CSS_VAR_MAP)) {
      const value = (tenant as any)[dbField];
      if (value) {
        vars.push(`${cssVar}: ${value}`);
      }
    }

    // Accent glow avledet fra accent
    if (tenant.colorAccent) {
      vars.push(`--color-accent-glow: ${tenant.colorAccent}26`);
      vars.push(`--gradient-primary: linear-gradient(135deg, ${tenant.colorAccent} 0%, ${tenant.colorAccent}cc 100%)`);
    }

    // Topbar derived from bg-primary (semi-transparent with backdrop-filter)
    if (tenant.colorBgPrimary) {
      vars.push(`--color-topbar-bg: ${tenant.colorBgPrimary}cc`);
    }
    // Topbar text follows text-primary
    if (tenant.colorTextPrimary) {
      vars.push(`--color-topbar-text: ${tenant.colorTextPrimary}`);
    }

    // Sidebar hover derived from sidebar bg — use text-primary for hover text
    if (tenant.colorSidebarBg) {
      // Detect if sidebar is light or dark to pick appropriate hover overlay
      const sbHex = tenant.colorSidebarBg.replace('#', '');
      const r = parseInt(sbHex.substring(0, 2), 16) || 0;
      const g = parseInt(sbHex.substring(2, 4), 16) || 0;
      const b = parseInt(sbHex.substring(4, 6), 16) || 0;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum > 0.5) {
        // Light sidebar → darken on hover
        vars.push(`--color-sidebar-hover-bg: rgba(0, 0, 0, 0.08)`);
      } else {
        // Dark sidebar → lighten on hover
        vars.push(`--color-sidebar-hover-bg: rgba(255, 255, 255, 0.08)`);
      }
    }
    if (tenant.colorTextPrimary) {
      vars.push(`--color-sidebar-hover-text: ${tenant.colorTextPrimary}`);
    }

    // Bg surface derived from bg-primary (subtle overlay)
    if (tenant.colorBgPrimary) {
      const bgHex = tenant.colorBgPrimary.replace('#', '');
      const r = parseInt(bgHex.substring(0, 2), 16) || 0;
      const g = parseInt(bgHex.substring(2, 4), 16) || 0;
      const b = parseInt(bgHex.substring(4, 6), 16) || 0;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum > 0.5) {
        vars.push(`--color-bg-surface: rgba(0, 0, 0, 0.04)`);
      } else {
        vars.push(`--color-bg-surface: rgba(255, 255, 255, 0.03)`);
      }
    }

    if (tenant.fontFamily) {
      vars.push(`--font-sans: ${tenant.fontFamily}`);
    }

    return {
      style: vars.join('; '),
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

  return (
    <html lang="no">
      <head>
        {branding?.faviconUrl && (
          <link rel="icon" href={branding.faviconUrl} />
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
