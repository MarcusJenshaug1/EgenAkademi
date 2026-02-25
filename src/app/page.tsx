import pageStyles from './page.module.css';
import { Palette, ShieldCheck, Zap, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  return (
    <main className={pageStyles.main}>
      <div className={pageStyles.heroGlow}></div>
      <header className={pageStyles.header}>
        <div className={pageStyles.badge}>Beta v1.0</div>
        <h1>Velkommen til <span className={pageStyles.gradientText}>Egen Akademi</span></h1>
        <p>Den moderne, whitelabel læringsplattformen for virksomhetens internlæring</p>
      </header>

      <div className={pageStyles.actions}>
        <Link href="/login" style={{ textDecoration: 'none' }}>
          <button className={pageStyles.primaryButton}>
            Logg inn / Start oppsett
            <ArrowRight className={pageStyles.buttonIcon} size={18} />
          </button>
        </Link>
        <button className={pageStyles.secondaryButton}>Bestill demo</button>
      </div>

      <section className={pageStyles.features}>
        <div className={pageStyles.featureCard}>
          <div className={pageStyles.iconWrapper}><Palette size={24} color="var(--color-accent-blue)" /></div>
          <h2>Ditt domene, din profil</h2>
          <p>Whitelabel plattform som tilpasser seg virksomhetens identitet automatisk. Helt flytende og dynamisk.</p>
        </div>
        <div className={pageStyles.featureCard}>
          <div className={pageStyles.iconWrapper}><ShieldCheck size={24} color="var(--color-accent-blue)" /></div>
          <h2>Sikkerhet & Etterlevelse</h2>
          <p>Bygget fra bunnen med RBAC, SOC 2 forberedelser, og GDPR-kompatibilitet for trygg intern data.</p>
        </div>
        <div className={pageStyles.featureCard}>
          <div className={pageStyles.iconWrapper}><Zap size={24} color="var(--color-accent-blue)" /></div>
          <h2>Integrasjoner (SCIM)</h2>
          <p>Automatiser brukeropprettelse og nøkkelferdig ID-provisjonering rett fra din foretrukne IdP.</p>
        </div>
      </section>
    </main>
  );
}
