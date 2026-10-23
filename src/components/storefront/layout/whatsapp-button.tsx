import { storeConfig, whatsappLink } from "@/config";
import { t } from "@/config/i18n";

export function WhatsAppButton() {
  return (
    <a
      href={whatsappLink()}
      target="_blank"
      rel="noopener"
      aria-label={t(storeConfig.locale, "contactWhatsapp")}
      className="fixed bottom-4 end-4 z-30 inline-flex size-12 sm:size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg"
    >
      <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.9L2 22l5.25-1.5A9.9 9.9 0 1 0 12.04 2Zm0 18.1c-1.5 0-2.9-.4-4.1-1.1l-.3-.2-3.1.9.9-3-.2-.3a8.1 8.1 0 1 1 6.8 3.7Zm4.5-6.1c-.2-.1-1.5-.8-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-1.5-.7-2.4-1.3-3.4-2.9-.1-.3.1-.3.3-.6l.4-.5c.1-.2.1-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.8.8-1 1.600-.9 2.500.4 1.800 1.600 3.300 3.500 4.400 2.100 1.200 3 1.100 3.600 1 .6-.1 1.800-.7 2-1.500.3-.7.3-1.300.2-1.500-.1-.1-.3-.2-.5-.3Z" />
      </svg>
    </a>
  );
}
