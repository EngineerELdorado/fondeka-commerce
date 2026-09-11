import Storefront from './storefront';

export async function generateMetadata({ params }) {
    const resolvedParams = await params;
    return {
        title: `${resolvedParams.slug} | Fondeka Commerce`,
    };
}

export default async function Page({ params }) {
    const resolvedParams = await params;
    return <Storefront slug={resolvedParams.slug} />;
}
