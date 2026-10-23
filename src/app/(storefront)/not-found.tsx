import { storeConfig } from "@/config";
import { NotFoundContent } from "@/components/shared/not-found-content";

export default function NotFound() {
  return <NotFoundContent locale={storeConfig.locale} href="/" variant="store" />;
}
