import type { MetadataRoute } from "next";
import { storeConfig } from "@/config";

export default function robots(): MetadataRoute.Robots {
  const base = storeConfig.domain.replace(/\/+$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/crm", "/admin", "/login", "/api/", "/merci", "/suivi"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
