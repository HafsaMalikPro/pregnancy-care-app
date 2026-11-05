import Image from "next/image";

export function AuthHeading({ title, subtitle }: { title: string; subtitle: React.ReactNode }) {
  return (
    <div className="mb-8 text-center">
      <Image
        src="/assets/brand/icon.svg"
        alt=""
        width={56}
        height={56}
        unoptimized
        className="mx-auto"
      />
      <h1 className="mt-5 font-sans text-3xl font-bold sm:text-4xl">{title}</h1>
      <p className="mt-2 text-muted">{subtitle}</p>
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3 text-sm text-muted">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
