import { getMyProfile } from '@/app/actions/profileActions';
import ProfileClient from './ProfileClient';
import { redirect } from 'next/navigation';

export default async function ProfilePage() {
    const result = await getMyProfile();

    if ('error' in result) {
        redirect('/login');
    }

    return <ProfileClient initialProfile={result.profile} />;
}
