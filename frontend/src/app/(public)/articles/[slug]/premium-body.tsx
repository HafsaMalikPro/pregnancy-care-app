"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { Markdown } from "@/components/markdown";
import { useSession } from "@/components/session-provider";
import { Card, IconBadge, Loading } from "@/components/ui";
import type { Article, Entitlement } from "@/lib/types";
import { useApi } from "@/lib/use-api";

/**
 * A premium article's body. The API decides access from the reader's verified
 * subscription; this only asks again with the reader's session.
 */
export function PremiumBody({ slug }: { slug: string }) {
  const { me, loading } = useSession();
  const isUser = me?.kind === "user";
  const article = useApi<Article>(isUser ? `/v1/articles/${encodeURIComponent(slug)}` : null);
  const entitlement = useApi<Entitlement>(isUser ? "/v1/me/entitlement" : null);

  if (loading || article.loading) return <Loading />;
  if (article.data && !article.data.locked && article.data.body) {
    return <Markdown>{article.data.body}</Markdown>;
  }

  return (
    <Card className="bg-warn-soft/50 text-center">
      <IconBadge tone="warn" className="mx-auto">
        <Lock className="size-5" />
      </IconBadge>
      <h2 className="mt-3 font-sans text-2xl font-bold">This is a premium article</h2>
      <p className="mx-auto mt-2 max-w-md text-muted">
        {!isUser ? (
          <>
            Premium articles are for members with an active subscription.{" "}
            <Link href={`/login?next=/articles/${slug}`} className="font-semibold text-clay-strong underline">
              Sign in
            </Link>{" "}
            if you have one.
          </>
        ) : entitlement.data?.status === "expired" ? (
          "Your premium membership has ended, so this article is locked."
        ) : (
          "Your account doesn't include premium. Subscriptions can't be bought on the website yet."
        )}
      </p>
    </Card>
  );
}
