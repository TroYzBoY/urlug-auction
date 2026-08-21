import Link from "next/link";
import { Header } from "@/components/site/Header";
import { t } from "@/lib/copy";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="gutter grid min-h-[60dvh] place-content-start pt-20">
        <p className="eyebrow">404</p>
        <h1 className="display mt-4 text-[clamp(2.5rem,10vw,5rem)] text-ink">
          {t.common.notFound}
        </h1>
        <Link
          href="/"
          className="eyebrow mt-8 inline-block border-b border-accent pb-1 text-accent transition-opacity hover:opacity-70"
        >
          ← {t.common.backHome}
        </Link>
      </main>
    </>
  );
}
