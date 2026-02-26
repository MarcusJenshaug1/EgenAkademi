'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './layout.module.css';

export default function LearnNavLink({
    href,
    children,
}: {
    href: string;
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const isActive =
        href === '/learn'
            ? pathname === '/learn'
            : pathname.startsWith(href);

    return (
        <Link
            href={href}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
        >
            {children}
        </Link>
    );
}
