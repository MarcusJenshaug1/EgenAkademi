import Link from 'next/link';
import {
    LayoutDashboard, Users, UsersRound, Shield, BookOpen,
    Calendar, Files, Palette, Plug, BarChart3, HelpCircle, LogOut, UserCircle,
    Rocket, AlarmClock, Target
} from 'lucide-react';
import styles from './layout.module.css';
import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
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
    if (session.user.tenantId) {
        const tenant = await prisma.tenant.findUnique({
            where: { id: session.user.tenantId },
            select: { name: true, logoUrl: true, logoSvgModified: true, logoSvgContent: true },
        });
        if (tenant) {
            tenantName = tenant.name;
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
                    <NavLink href="/admin/skills">
                        <Target size={18} /> Kompetanse
                    </NavLink>

                    <div className={styles.navSection}>Læring</div>
                    <NavLink href="/admin/courses">
                        <BookOpen size={18} /> Kurs
                    </NavLink>
                    <NavLink href="/admin/sessions">
                        <Calendar size={18} /> Sesjoner
                    </NavLink>
                    <NavLink href="/admin/content">
                        <Files size={18} /> Innhold
                    </NavLink>
                    <NavLink href="/admin/onboarding">
                        <Rocket size={18} /> Onboarding
                    </NavLink>
                    <NavLink href="/admin/deadlines">
                        <AlarmClock size={18} /> Frister
                    </NavLink>

                    <div className={styles.navSection}>Plattform</div>
                    <NavLink href="/admin/branding">
                        <Palette size={18} /> Branding
                    </NavLink>
                    <NavLink href="/admin/integrations">
                        <Plug size={18} /> Integrasjoner
                    </NavLink>
                    <NavLink href="/admin/reports">
                        <BarChart3 size={18} /> Rapporter
                    </NavLink>
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
