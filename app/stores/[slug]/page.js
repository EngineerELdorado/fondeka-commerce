import Storefront from '../../s/[slug]/storefront';

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
    return <Storefront slug={resolvedParams.slug} />;
}
