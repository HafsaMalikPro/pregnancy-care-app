"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { MotherArt } from "@/components/art";
import { Logo } from "@/components/shell";

const TAGLINE = "Calm, clinician-reviewed guidance for every week of your pregnancy.";

/** The side panel on wide screens: a photo on sign-up, the illustration elsewhere. */
export function AuthAside() {
  const signup = usePathname() === "/signup";

  if (signup) {
    return (
      <aside className="relative hidden flex-col overflow-hidden bg-linear-to-br from-blush via-paper-2 to-clay-soft p-10 lg:flex">
        <Logo />
        <div className="grid flex-1 place-items-center py-8">
          {/* 1068 x 1334 file (2x of the 534 x 667 source) so it is sharp on high-DPI screens
              at this width. unoptimized serves that file as is instead of a resized copy. */}
          <Image
            src="/assets/photos/signup-pink-shirt.jpg"
            alt="A pregnant woman in a pink top resting her hands on her bump"
            width={1068}
            height={1334}
            priority
            unoptimized
            className="aspect-[4/5] w-full max-w-[24rem] rounded-[2rem] object-cover shadow-lift"
          />
        </div>
      </aside>
    );
  }

  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-clay-soft p-10 lg:flex">
      <Logo />
      <MotherArt className="mx-auto h-auto w-full max-w-sm" priority />
      <p className="max-w-sm font-sans text-2xl leading-snug text-heading">{TAGLINE}</p>
    </aside>
  );
}
