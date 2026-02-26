'use client';

import { Award, Calendar, ExternalLink, FileText } from 'lucide-react';
import Link from 'next/link';
import styles from './certificates.module.css';
import type { CertificateData } from '@/app/actions/learnerActions';

interface Props {
    certificates: CertificateData[];
}

function formatDate(d: Date) {
    return new Date(d).toLocaleDateString('nb-NO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

export default function CertificatesClient({ certificates }: Props) {
    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div className={styles.headerIcon}>
                    <Award size={24} />
                </div>
                <div>
                    <h1 className={styles.title}>Mine sertifikater</h1>
                    <p className={styles.subtitle}>
                        {certificates.length === 0
                            ? 'Du har ingen sertifikater ennå.'
                            : `${certificates.length} ${certificates.length === 1 ? 'sertifikat' : 'sertifikater'} opptjent`}
                    </p>
                </div>
            </div>

            {certificates.length === 0 ? (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
                        <Award size={40} />
                    </div>
                    <h2 className={styles.emptyTitle}>Ingen sertifikater ennå</h2>
                    <p className={styles.emptyText}>
                        Fullfør kurs for å opptjene sertifikater. De vil vises her.
                    </p>
                    <Link href="/learn/my-learning" className={styles.emptyLink}>
                        <FileText size={16} />
                        Se mine kurs
                    </Link>
                </div>
            ) : (
                <div className={styles.grid}>
                    {certificates.map((cert) => (
                        <div key={cert.id} className={styles.card}>
                            <div className={styles.cardTop}>
                                <Award size={28} className={styles.certIcon} />
                                <h3 className={styles.certTitle}>{cert.title}</h3>
                                <p className={styles.certCourse}>{cert.courseTitle}</p>
                            </div>
                            <div className={styles.cardMeta}>
                                <span className={styles.metaItem}>
                                    <Calendar size={13} />
                                    Utstedt {formatDate(cert.issuedAt)}
                                </span>
                                {cert.expiresAt && (
                                    <span className={styles.metaItem}>
                                        Utløper {formatDate(cert.expiresAt)}
                                    </span>
                                )}
                                {cert.certificateNumber && (
                                    <span className={styles.metaItem}>
                                        #{cert.certificateNumber}
                                    </span>
                                )}
                            </div>
                            <div className={styles.cardActions}>
                                <Link
                                    href={`/learn/courses/${cert.courseSlug}`}
                                    className={styles.viewCourseBtn}
                                >
                                    <ExternalLink size={14} />
                                    Se kurs
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
