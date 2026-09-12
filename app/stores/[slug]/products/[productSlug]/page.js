import Storefront from '../../../../s/[slug]/storefront';
import { apiFetch } from '../../../../../lib/api';

function readError(error) {
    if (error?.payload) return error.payload;
    return {
        message: error?.message || 'Unable to load storefront.',
        errorCode: error?.errorCode || null,
        statusCode: error?.statusCode || null,
    };
}

export async function generateMetadata({ params }) {
    const resolvedParams = await params;
    return {
        title: resolvedParams.productSlug,
        alternates: {
            canonical: `/stores/${resolvedParams.slug}/products/${resolvedParams.productSlug}`,
        },
    };
}

export default async function Page({ params }) {
    const resolvedParams = await params;
    try {
        const product = await apiFetch(
            `/public/commerce/stores/${encodeURIComponent(resolvedParams.slug)}/products/${encodeURIComponent(resolvedParams.productSlug)}`
        );
        const store = product?.storeSlug
            ? await apiFetch(`/public/commerce/stores/${encodeURIComponent(product.storeSlug)}`)
            : {
                name: 'Fondeka merchant',
                slug: resolvedParams.slug,
                defaultCurrency: product?.priceCurrency || '',
            };

        return (
            <Storefront
                slug={resolvedParams.slug}
                productSlug={resolvedParams.productSlug}
                initialStore={store}
                initialProducts={product ? [product] : []}
                initialCart={product?.id ? { [product.id]: 1 } : {}}
            />
        );
    } catch (error) {
        return (
            <Storefront
                slug={resolvedParams.slug}
                productSlug={resolvedParams.productSlug}
                initialLoadError={readError(error)}
            />
        );
    }
}
