import styles from './branding.module.css';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import BrandingForm from './BrandingForm';
import { Palette } from 'lucide-react';

export default async function BrandingPage() {
    const session = await auth();

    if (!session?.user?.tenantId) {
        redirect('/login');
    }

    if (session.user.globalRole !== 'TENANT_ADMIN' && session.user.globalRole !== 'SYSTEM_ADMIN') {
        return (
            <div className={styles.container}>
                <div className={styles.errorCard}>Du har ikke rettigheter til denne siden.</div>
            </div>
        );
    }

    const currentTenant = await prisma.tenant.findUnique({
        where: { id: session.user.tenantId }
    });

    if (!currentTenant) {
        return <div className={styles.errorCard}>Organisasjon ikke funnet.</div>;
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.titleWrapper}>
                    <div className={styles.iconWrapper}>
                        <Palette size={20} color="var(--color-accent-blue)" />
                    </div>
                    <div>
                        <h1 className={styles.title}>Tema & Branding</h1>
                        <p className={styles.subtitle}>
                            Fullstendig kontroll over farger, tekst, knapper og navigasjon.
                            Kontrastsjekk (WCAG AA) vises automatisk.
                        </p>
                    </div>
                </div>
            </div>

            <BrandingForm
                initial={{
                    tenantName: currentTenant.name || '',
                    colorBgPrimary: currentTenant.colorBgPrimary || '',
                    colorBgSecondary: currentTenant.colorBgSecondary || '',
                    colorTextPrimary: currentTenant.colorTextPrimary || '',
                    colorTextSecondary: currentTenant.colorTextSecondary || '',
                    colorBorder: currentTenant.colorBorder || '',
                    colorAccent: currentTenant.colorAccent || '',
                    colorButtonPrimary: currentTenant.colorButtonPrimary || '',
                    colorButtonText: currentTenant.colorButtonText || '',
                    colorSidebarBg: currentTenant.colorSidebarBg || '',
                    colorSidebarText: currentTenant.colorSidebarText || '',
                    colorSidebarActive: currentTenant.colorSidebarActive || '',
                    colorSuccess: currentTenant.colorSuccess || '',
                    colorWarning: currentTenant.colorWarning || '',
                    colorDanger: currentTenant.colorDanger || '',
                    logoUrl: currentTenant.logoUrl || '',
                    logoSvgContent: currentTenant.logoSvgContent || '',
                    logoSvgModified: currentTenant.logoSvgModified || '',
                    faviconUrl: currentTenant.faviconUrl || '',
                    faviconSvgContent: currentTenant.faviconSvgContent || '',
                    faviconSvgModified: currentTenant.faviconSvgModified || '',
                    fontFamily: currentTenant.fontFamily || '',
                    fontHeading: currentTenant.fontHeading || '',
                    fontSource: currentTenant.fontSource || '',
                    customFontUrl: currentTenant.customFontUrl || '',
                }}
            />
        </div>
    );
}
