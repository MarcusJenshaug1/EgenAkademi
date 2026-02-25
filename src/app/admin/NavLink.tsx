'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './layout.module.css';

export default function NavLink({
    href,
    children,
}: {
    href: string;
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const isActive =
        href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(href);

    return (
        <Link
            href={href}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
            style={{ gap: '10px' }}
        >
            {children}
        </Link>
    );
}
