import Storefront from '../../s/[slug]/storefront';
import { headers } from 'next/headers';
import { countryFromHeaders } from '../../../lib/request-country';

export async function generateMetadata({ params }) {
    const resolvedParams = await params;
    return {
        title: resolvedParams.slug,
        alternates: {
            canonical: `/stores/${resolvedParams.slug}`,
        },
    };
}

export default async function Page({ params }) {
    const resolvedParams = await params;
    const hdr = await headers();
    return <Storefront slug={resolvedParams.slug} initialCountry={countryFromHeaders(hdr)} />;
}
