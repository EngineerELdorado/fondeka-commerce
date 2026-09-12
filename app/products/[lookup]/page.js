import Storefront from '../../s/[slug]/storefront';

export async function generateMetadata({ params }) {
    const resolvedParams = await params;
    return {
        title: resolvedParams.lookup,
    };
}

export default async function Page({ params }) {
    const resolvedParams = await params;
    return <Storefront productLookup={resolvedParams.lookup} />;
}
