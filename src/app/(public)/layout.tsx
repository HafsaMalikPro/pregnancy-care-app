import { Shell } from "@/components/shell";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return <Shell>{children}</Shell>;
}
