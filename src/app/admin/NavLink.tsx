'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import styles from './layout.module.css';

export default function NavLink({
    href,
    children,
    locked = false,
}: {
    href: string;
    children: React.ReactNode;
    /**
     * When true the item is shown but the tenant's plan does not entitle it.
     * The link stays clickable (the destination page renders its own upgrade
     * notice) and we append a small muted lock indicator after the label.
     */
    locked?: boolean;
}) {
    const pathname = usePathname();
    const isActive =
        href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(href);

    return (
        <Link
            href={href}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''} ${locked ? styles.navItemLocked : ''}`}
            style={{ gap: '10px' }}
        >
            {children}
            {locked && (
                <Lock size={13} className={styles.navLockIcon} aria-label="Krever oppgradering" />
            )}
        </Link>
    );
}
