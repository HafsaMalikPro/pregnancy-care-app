import { WombArt } from "@/components/art";
import { Container, Shell } from "@/components/shell";
import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <Shell>
      <Container wide={false}>
        <div className="mx-auto max-w-lg text-center">
          <WombArt week={10} size={140} className="mx-auto opacity-80" />
          <h1 className="mt-4 font-sans text-3xl font-bold">We couldn&apos;t find that page</h1>
          <p className="mt-2 text-muted">The link may be old, or the page may have moved.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/">Go home</ButtonLink>
            <ButtonLink href="/weeks" variant="secondary">Browse the weeks</ButtonLink>
          </div>
        </div>
      </Container>
    </Shell>
  );
}
