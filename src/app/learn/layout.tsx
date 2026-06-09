import Link from 'next/link';
import {
    Home, BookOpen, Award, Bell, LogOut, GraduationCap, Shield, Compass, Calendar, Target, Trophy,
} from 'lucide-react';
import styles from './layout.module.css';
import { auth, signOut } from '@/auth';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import { checkAccess } from '@/lib/features';
import LearnNavLink from './LearnNavLink';

export default async function LearnLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    if (!session?.user) {
        redirect('/login');
    }

    if (!session.user.tenantId) {
        redirect('/onboarding');
    }

    // Fetch tenant info + user profile
    let tenantName = 'Egen Akademi';
    let tenantLogoUrl: string | null = null;
    let userAvatarUrl: string | null = null;
    let displayName = session.user.email || 'Bruker';
    let jobTitle: string | null = null;

    const [tenant, currentUser] = await Promise.all([
        prisma.tenant.findUnique({
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
        }),
        prisma.user.findUnique({
            where: { id: session.user.id },
            select: { avatarUrl: true, firstName: true, lastName: true, jobTitle: true },
        }),
    ]);

    if (tenant) {
        tenantName = tenant.name;
        if (tenant.logoSvgModified) {
            tenantLogoUrl = `data:image/svg+xml;base64,${Buffer.from(tenant.logoSvgModified).toString('base64')}`;
        } else if (tenant.logoSvgContent) {
            tenantLogoUrl = `data:image/svg+xml;base64,${Buffer.from(tenant.logoSvgContent).toString('base64')}`;
        } else if (tenant.logoUrl) {
            tenantLogoUrl = tenant.logoUrl;
        }
    }

    if (currentUser) {
        userAvatarUrl = currentUser.avatarUrl;
        if (currentUser.firstName && currentUser.lastName) {
            displayName = `${currentUser.firstName} ${currentUser.lastName}`;
        }
        jobTitle = currentUser.jobTitle;
    }

    const initials = session.user.email
        ? session.user.email.substring(0, 2).toUpperCase()
        : 'EA';

    const isAdmin = session.user.globalRole === 'TENANT_ADMIN' || session.user.globalRole === 'SYSTEM_ADMIN';

    const sessionsEnabled = tenant
        ? checkAccess(
              { plan: tenant.plan, addons: tenant.addons, trialEndsAt: tenant.trialEndsAt },
              'session-events'
          ).allowed
        : false;

    const gamificationEnabled = tenant
        ? checkAccess(
              { plan: tenant.plan, addons: tenant.addons, trialEndsAt: tenant.trialEndsAt },
              'gamification'
          ).allowed
        : false;

    return (
        <div className={styles.learnContainer}>
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
                        <div className={styles.brandMark}>
                            <GraduationCap size={22} />
                            <span>{tenantName}</span>
                        </div>
                    )}
                </div>

                <nav className={styles.navLinks}>
                    <LearnNavLink href="/learn">
                        <Home size={18} /> Dashboard
                    </LearnNavLink>
                    <LearnNavLink href="/learn/my-learning">
                        <BookOpen size={18} /> Min læring
                    </LearnNavLink>
                    <LearnNavLink href="/learn/courses">
                        <Compass size={18} /> Kurskatalog
                    </LearnNavLink>
                    <LearnNavLink href="/learn/skills">
                        <Target size={18} /> Kompetanse
                    </LearnNavLink>
                    {sessionsEnabled && (
                        <LearnNavLink href="/learn/sessions">
                            <Calendar size={18} /> Sesjoner
                        </LearnNavLink>
                    )}
                    {gamificationEnabled && (
                        <LearnNavLink href="/learn/leaderboard">
                            <Trophy size={18} /> Toppliste
                        </LearnNavLink>
                    )}
                    <LearnNavLink href="/learn/certificates">
                        <Award size={18} /> Sertifikater
                    </LearnNavLink>
                    <LearnNavLink href="/learn/notifications">
                        <Bell size={18} /> Varsler
                    </LearnNavLink>

                    {isAdmin && (
                        <>
                            <div className={styles.navDivider} />
                            <Link href="/admin" className={styles.adminLink}>
                                <Shield size={16} /> Administrasjon
                            </Link>
                        </>
                    )}
                </nav>

                {/* User profile at bottom */}
                <div className={styles.sidebarFooter}>
                    <Link href="/learn/profile" className={styles.userProfileLink}>
                        <div className={styles.userAvatar}>
                            {userAvatarUrl ? (
                                <img src={userAvatarUrl} alt="Profil" className={styles.userAvatarImg} />
                            ) : (
                                initials
                            )}
                        </div>
                        <div className={styles.userInfo}>
                            <span className={styles.userName}>{displayName}</span>
                            {jobTitle && <span className={styles.userRole}>{jobTitle}</span>}
                        </div>
                    </Link>
                    <form action={async () => {
                        'use server';
                        await signOut({ redirectTo: '/login' });
                    }}>
                        <button type="submit" className={styles.logoutBtn} aria-label="Logg ut">
                            <LogOut size={16} />
                        </button>
                    </form>
                </div>
            </aside>

            {/* Main Content */}
            <div className={styles.mainContent}>
                <div className={styles.pageScrollArea}>
                    <main className={styles.pageContainer}>
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}


