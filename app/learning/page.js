import LearningExperience from "./learning-experience";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "My learning",
  description:
    "Access your purchased trainings and continue learning on Fondeka Commerce.",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  alternates: { canonical: "/learning" },
  openGraph: {
    title: "My learning | Fondeka Commerce",
    description: "Your training purchases, at your own pace.",
    url: "/learning",
  },
  twitter: {
    title: "My learning | Fondeka Commerce",
    description: "Your training purchases, at your own pace.",
  },
};

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const language = ["en", "fr"].includes(params?.lang) ? params.lang : null;
  const storeSlug = typeof params?.store === "string" ? params.store : null;
  return (
    <LearningExperience initialLanguage={language} storeSlug={storeSlug} />
  );
}
