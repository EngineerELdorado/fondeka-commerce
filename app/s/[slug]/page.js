import Storefront from './storefront';
import { headers } from 'next/headers';
import { countryFromHeaders } from '../../../lib/request-country';

export async function generateMetadata({ params }) {
    const resolvedParams = await params;
    return {
        title: resolvedParams.slug,
    };
}

export default async function Page({ params }) {
    const resolvedParams = await params;
    const hdr = await headers();
    return <Storefront slug={resolvedParams.slug} initialCountry={countryFromHeaders(hdr)} />;
}
