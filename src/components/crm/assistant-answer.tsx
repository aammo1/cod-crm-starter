"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { memo } from "react";

// Loaded only for completed replies. Streaming uses plain text so the Markdown
// parser doesn't run once per token, and the initial CRM bundle stays small.
function AssistantAnswer({ content }: { content: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 break-words text-sm leading-7">
      <Markdown skipHtml remarkPlugins={[remarkGfm]}
        urlTransform={(url) => /^\/(?:crm|admin)(?:\/|\?|$)/.test(url) && !url.includes("\\") ? url : ""}
        components={{
          h1: ({ children }) => <h3 className="mt-2 text-lg font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="mt-2 text-base font-semibold">{children}</h3>,
          h3: ({ children }) => <h4 className="mt-1 font-semibold">{children}</h4>,
          ul: ({ children }) => <ul className="flex list-disc flex-col gap-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="flex list-decimal flex-col gap-1 pl-5">{children}</ol>,
          table: ({ children }) => <div className="max-w-full overflow-x-auto rounded-xl border border-border"><table className="w-full border-collapse text-left text-xs">{children}</table></div>,
          th: ({ children }) => <th scope="col" className="border-b border-border bg-muted px-3 py-2 font-semibold">{children}</th>,
          td: ({ children }) => <td className="border-b border-border px-3 py-2 align-top">{children}</td>,
          pre: ({ children }) => <pre className="max-w-full overflow-x-auto rounded-xl bg-muted p-3 text-xs">{children}</pre>,
          code: ({ children }) => <code className="rounded bg-muted px-1 font-mono text-[0.9em]">{children}</code>,
          a: ({ href, children }) => href ? <a href={href} className="underline underline-offset-4">{children}</a> : <span>{children}</span>,
          img: () => null,
        }}
      >{content}</Markdown>
    </div>
  );
}

export default memo(AssistantAnswer);
