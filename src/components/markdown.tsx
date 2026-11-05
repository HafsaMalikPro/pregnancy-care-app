import ReactMarkdown, { type Components } from "react-markdown";

// react-markdown passes its AST node to each component; keep it off the DOM.
const strip = <T extends { node?: unknown }>(props: T): Omit<T, "node"> => {
  const { node, ...rest } = props;
  void node;
  return rest;
};

const components: Components = {
  h1: (p) => <h2 className="mt-6 font-sans text-3xl font-bold" {...strip(p)} />,
  h2: (p) => <h2 className="mt-6 font-sans text-2xl font-bold" {...strip(p)} />,
  h3: (p) => <h3 className="mt-3 font-sans text-xl font-bold" {...strip(p)} />,
  ul: (p) => <ul className="grid list-disc gap-1.5 pl-6 marker:text-rose" {...strip(p)} />,
  ol: (p) => <ol className="grid list-decimal gap-1.5 pl-6 marker:text-rose" {...strip(p)} />,
  a: (p) => (
    <a className="font-semibold text-clay-strong underline" target="_blank" rel="noreferrer" {...strip(p)} />
  ),
  blockquote: (p) => (
    <blockquote className="rounded-r-2xl border-l-4 border-rose bg-clay-soft/50 px-5 py-3 text-ink" {...strip(p)} />
  ),
  strong: (p) => <strong className="font-bold text-heading" {...strip(p)} />,
  img: () => null,
};

/**
 * Article bodies are Markdown written by editors. Raw HTML is never rendered,
 * react-markdown drops unsafe link protocols, and embedded images are skipped.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="grid gap-4 text-[1.0625rem] leading-[1.75]">
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}

/** Rough reading time at 200 words per minute. */
export function readingMinutes(markdown: string): number {
  return Math.max(1, Math.round(markdown.split(/\s+/).filter(Boolean).length / 200));
}
