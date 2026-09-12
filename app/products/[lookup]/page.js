import Storefront from '../../s/[slug]/storefront';
import { headers } from 'next/headers';
import { countryFromHeaders } from '../../../lib/request-country';

export async function generateMetadata({ params }) {
    const resolvedParams = await params;
    return {
        title: resolvedParams.lookup,
    };
}

export default async function Page({ params }) {
    const resolvedParams = await params;
    const hdr = await headers();
    return <Storefront productLookup={resolvedParams.lookup} initialCountry={countryFromHeaders(hdr)} />;
}
