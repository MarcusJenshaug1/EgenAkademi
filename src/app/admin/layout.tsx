import Link from 'next/link';
import {
    LayoutDashboard, Users, UsersRound, Shield, BookOpen,
    Calendar, Files, Palette, Plug, BarChart3, HelpCircle, LogOut, UserCircle,
    Rocket, AlarmClock, Target, Package, Globe, ShieldAlert, Trophy
} from 'lucide-react';
import type { TenantPlan } from '@prisma/client';
import styles from './layout.module.css';
import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { checkAccess } from '@/lib/features';
import NavLink from './NavLink';

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect('/login');
    }

    // Fetch tenant info for sidebar branding + user avatar
    let tenantName = 'Egen Akademi';
    let tenantLogoUrl: string | null = null;
    let userAvatarUrl: string | null = null;
    let currentUser: { avatarUrl: string | null; firstName: string | null; lastName: string | null; jobTitle: string | null } | null = null;
    // Plan/addons/trial drive nav gating. Default to FREE/no-addons so missing
    // tenants degrade to "only core items unlocked" rather than over-granting.
    let tenantPlan: TenantPlan = 'FREE';
    let tenantAddons: string[] = [];
    let tenantTrialEndsAt: Date | null = null;
    if (session.user.tenantId) {
        const tenant = await prisma.tenant.findUnique({
            where: { id: session.user.tenantId },
            select: {
                name: true,
                logoUrl: true,
                logoSvgModified: true,
                logoSvgContent: true,
                plan: true,
                addons: true,
                trialEndsAt: true,
            },
        });
        if (tenant) {
            tenantName = tenant.name;
            tenantPlan = tenant.plan;
            tenantAddons = tenant.addons;
            tenantTrialEndsAt = tenant.trialEndsAt;
            // Prefer modified SVG → original SVG → uploaded URL
            if (tenant.logoSvgModified) {
                tenantLogoUrl = `data:image/svg+xml;base64,${Buffer.from(tenant.logoSvgModified).toString('base64')}`;
            } else if (tenant.logoSvgContent) {
                tenantLogoUrl = `data:image/svg+xml;base64,${Buffer.from(tenant.logoSvgContent).toString('base64')}`;
            } else if (tenant.logoUrl) {
                tenantLogoUrl = tenant.logoUrl;
            }
        }
    }

    // ── Plan-based nav gating ───────────────────────────────
    // A gated item is rendered regardless (discoverable for upsell); when the
    // tenant is not entitled we pass `locked` so NavLink shows a lock indicator.
    // The destination pages enforce access server-side and show upgrade notices.
    const tenantForAccess = { plan: tenantPlan, addons: tenantAddons, trialEndsAt: tenantTrialEndsAt };
    const has = (feature: string) => checkAccess(tenantForAccess, feature).allowed;
    const gate = {
        sessions: has('session-events'),
        onboarding: has('onboarding-programs'),
        deadlines: has('escalation-logic'),
        scorm: has('scorm'),
        domains: has('custom-domain'),
        skills: has('competency-management'),
        reports: has('basic-analytics'),
        gamification: has('gamification'),
        // Integrasjoner is unlocked if ANY enterprise integration feature is available.
        integrations:
            has('sso-saml') ||
            has('scim') ||
            has('webhooks') ||
            has('lti') ||
            has('audit-logging'),
    };

    const isSystemAdmin = session.user.globalRole === 'SYSTEM_ADMIN';
    // Fetch user avatar
    if (session.user.id) {
        currentUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { avatarUrl: true, firstName: true, lastName: true, jobTitle: true },
        });
        if (currentUser?.avatarUrl) {
            userAvatarUrl = currentUser.avatarUrl;
        }
    }

    const initials = session.user.email
        ? session.user.email.substring(0, 2).toUpperCase()
        : 'EA';

    return (
        <div className={styles.adminContainer}>
            {/* Sidebar */}
            <aside className={styles.sidebar}>
                <div className={styles.sidebarHeader}>
                    {tenantLogoUrl ? (
                        <img
                            src={tenantLogoUrl}
                            alt={`${tenantName} logo`}
                            className={styles.sidebarLogo}
                        />
                    ) : (
                        <>
                            <h2>{tenantName}</h2>
                            <span className={styles.tenantBadge}>{tenantName}</span>
                        </>
                    )}
                </div>

                <nav className={styles.navLinks}>
                    <NavLink href="/admin">
                        <LayoutDashboard size={18} /> Dashboard
                    </NavLink>
                    <div className={styles.navSection}>Brukere & Tilgang</div>
                    <NavLink href="/admin/users">
                        <Users size={18} /> Brukere
                    </NavLink>
                    <NavLink href="/admin/groups">
                        <UsersRound size={18} /> Grupper
                    </NavLink>
                    <NavLink href="/admin/roles">
                        <Shield size={18} /> Roller og tilgang
                    </NavLink>
                    <NavLink href="/admin/skills" locked={!gate.skills}>
                        <Target size={18} /> Kompetanse
                    </NavLink>

                    <div className={styles.navSection}>Læring</div>
                    <NavLink href="/admin/courses">
                        <BookOpen size={18} /> Kurs
                    </NavLink>
                    <NavLink href="/admin/sessions" locked={!gate.sessions}>
                        <Calendar size={18} /> Sesjoner
                    </NavLink>
                    <NavLink href="/admin/content">
                        <Files size={18} /> Innhold
                    </NavLink>
                    <NavLink href="/admin/onboarding" locked={!gate.onboarding}>
                        <Rocket size={18} /> Onboarding
                    </NavLink>
                    <NavLink href="/admin/deadlines" locked={!gate.deadlines}>
                        <AlarmClock size={18} /> Frister
                    </NavLink>
                    <NavLink href="/admin/scorm" locked={!gate.scorm}>
                        <Package size={18} /> SCORM
                    </NavLink>
                    <NavLink href="/admin/gamification" locked={!gate.gamification}>
                        <Trophy size={18} /> Gamification
                    </NavLink>

                    <div className={styles.navSection}>Plattform</div>
                    <NavLink href="/admin/branding">
                        <Palette size={18} /> Branding
                    </NavLink>
                    <NavLink href="/admin/domains" locked={!gate.domains}>
                        <Globe size={18} /> Domener
                    </NavLink>
                    <NavLink href="/admin/integrations" locked={!gate.integrations}>
                        <Plug size={18} /> Integrasjoner
                    </NavLink>
                    <NavLink href="/admin/reports" locked={!gate.reports}>
                        <BarChart3 size={18} /> Rapporter
                    </NavLink>

                    {isSystemAdmin && (
                        <>
                            <div className={styles.navSection}>System</div>
                            <NavLink href="/admin/system">
                                <ShieldAlert size={18} /> System
                            </NavLink>
                        </>
                    )}
                </nav>
            </aside>

            <div className={styles.mainContent}>
                {/* Topbar */}
                <header className={styles.topbar}>
                    <div className={styles.topbarLeft}>
                        <h1 className={styles.pageTitle}>Administrasjon</h1>
                    </div>
                    <div className={styles.topbarRight}>
                        <button className={styles.headerButton} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <HelpCircle size={16} /> Hjelp
                        </button>
                        <Link href="/admin/profile" className={styles.userProfileLink} title={session.user.email || 'Bruker'}>
                            <div className={styles.userProfile}>
                                {userAvatarUrl ? (
                                    <img src={userAvatarUrl} alt="Profil" className={styles.userProfileImg} />
                                ) : (
                                    initials
                                )}
                            </div>
                            <div className={styles.userInfo}>
                                <span className={styles.userName}>
                                    {currentUser?.firstName && currentUser?.lastName
                                        ? `${currentUser.firstName} ${currentUser.lastName}`
                                        : session.user.email || 'Bruker'}
                                </span>
                                {currentUser?.jobTitle && (
                                    <span className={styles.userJobTitle}>{currentUser.jobTitle}</span>
                                )}
                            </div>
                        </Link>
                        <form action={async () => {
                            'use server';
                            await signOut({ redirectTo: '/login' });
                        }}>
                            <button type="submit" className={styles.headerButton} style={{ display: 'flex', alignItems: 'center', gap: '8px', border: 'none', background: 'transparent' }}>
                                <LogOut size={16} color="var(--color-text-secondary)" />
                            </button>
                        </form>
                    </div>
                </header>

                {/* Page Content */}
                <div className={styles.pageScrollArea}>
                    <main className={styles.pageContainer}>
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
