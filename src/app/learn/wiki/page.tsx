import { redirect } from 'next/navigation';
import Link from 'next/link';
import { BookText, Lock } from 'lucide-react';
import { auth } from '@/auth';
import {
    getPublishedTree,
    getWhatsNew,
    getPinnedPages,
} from '@/app/actions/wikiActions';
import WikiReaderClient from './WikiReaderClient';
import styles from './wiki.module.css';

export default async function LearnWikiPage() {
    const session = await auth();
    if (!session?.user?.tenantId) redirect('/login');

    const [treeRes, whatsNewRes, pinnedRes] = await Promise.all([
        getPublishedTree(),
        getWhatsNew(10),
        getPinnedPages(),
    ]);

    const locked = treeRes.locked || whatsNewRes.locked || pinnedRes.locked;

    if (locked) {
        return (
            <div className={styles.lockedPage}>
                <div className={styles.lockedCard}>
                    <div className={styles.lockedIcon}>
                        <Lock size={28} />
                    </div>
                    <h1 className={styles.lockedTitle}>Kunnskapsbase</h1>
                    <p className={styles.lockedText}>
                        {treeRes.reason ||
                            'Kunnskapsbasen er ikke tilgjengelig for organisasjonen din.'}
                    </p>
                    <p className={styles.lockedHint}>
                        Kunnskapsbasen samler interne rutiner, retningslinjer og veiledninger på ett sted.
                    </p>
                    <Link href="/learn" className={styles.lockedButton}>
                        <BookText size={16} />
                        Tilbake til oversikten
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <WikiReaderClient
            initialTree={treeRes.tree}
            initialWhatsNew={whatsNewRes.items}
            initialPinned={pinnedRes.items}
        />
    );
}
