"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowRightIcon, ArrowUpIcon, BookOpenIcon, CopyIcon, LoaderCircleIcon, Maximize2Icon, Minimize2Icon, SquareIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { AssistantRobot } from "@/components/crm/assistant-robot";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { AssistantEvent, AssistantMood, AssistantSource } from "@/lib/assistant-contract";
import { buildAssistantPageContext } from "@/lib/assistant-page";
import { getCrmCurrentSectionTitle } from "@/components/crm/crm-nav";
import { ASSISTANT_OPEN_EVENT, useAssistantContextStore } from "@/stores/assistant-context";

const AssistantAnswer = lazy(() => import("@/components/crm/assistant-answer"));

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: AssistantSource[];
  error?: string;
  mood?: AssistantMood;
}

const STARTERS = [
  "Quelles sont mes priorités aujourd’hui ?",
  "Quels colis ou BL nécessitent mon attention ?",
  "Quelles pointures arrivent en rupture ?",
];

function conversationContext(messages: Message[]) {
  const result: { role: "user" | "assistant"; content: string }[] = [];
  let length = 0;
  // Preserve complete pairs, at most five, within the server's input budget.
  for (let index = messages.length - 2; index >= 0 && result.length < 10; index -= 2) {
    const pair = messages.slice(index, index + 2).map(({ role, content }) => ({ role, content: content.slice(0, 8000) || "Réponse interrompue." }));
    const size = pair.reduce((n, message) => n + message.content.length, 0);
    if (length + size > 16000) break;
    result.unshift(...pair);
    length += size;
  }
  return result;
}

export function CrmAssistant() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const entries = useAssistantContextStore((state) => state.entries);
  const query = searchParams.toString();
  const pageContext = useMemo(() => {
    const selection = Object.assign({}, ...Object.values(entries).filter((entry) => entry.pathname === pathname).map((entry) => entry.selection));
    return buildAssistantPageContext(pathname, query, selection);
  }, [entries, pathname, query]);
  const sectionTitle = getCrmCurrentSectionTitle(pathname);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [panelWidth, setPanelWidth] = useState(720);
  const resizeRef = useRef<{ x: number; width: number } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastAnswer = messages.filter((message) => message.role === "assistant").at(-1);
  const robotMood = busy ? "thinking" : lastAnswer?.error ? "grumpy" : lastAnswer?.mood ?? "cheerful";

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    useAssistantContextStore.getState().clear("focused-bl");
    function explain(event: Event) {
      const id = (event as CustomEvent<{ blId?: string }>).detail?.blId;
      if (pathname !== "/crm/expeditions" || typeof id !== "string" || !id || id.length > 100) return;
      useAssistantContextStore.getState().set("focused-bl", pathname, { blId: id });
      setOpen(true);
      setInput("Explique ce BL, son blocage éventuel et les prochaines étapes.");
    }
    window.addEventListener(ASSISTANT_OPEN_EVENT, explain);
    return () => window.removeEventListener(ASSISTANT_OPEN_EVENT, explain);
  }, [pathname]);
  useEffect(() => {
    if (open && followRef.current) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, status, open]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || question.length > 2000 || abortRef.current) return;
    const previous = conversationContext(messages);
    const abort = new AbortController();
    abortRef.current = abort;
    setInput("");
    setBusy(true);
    followRef.current = true;
    setStatus("Analyse de votre demande…");
    setMessages((current) => [...current.slice(-18), { role: "user", content: question }, { role: "assistant", content: "" }]);
    const update = (patch: Partial<Message> | ((message: Message) => Partial<Message>)) => {
      setMessages((current) => current.map((message, index) => index === current.length - 1
        ? { ...message, ...(typeof patch === "function" ? patch(message) : patch) } : message));
    };
    try {
      const response = await fetch("/api/crm/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...previous, { role: "user", content: question }], context: pageContext }),
        signal: abort.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "L’assistant est indisponible. Réessayez dans un instant.");
      }
      if (!response.body) throw new Error("La réponse est indisponible.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      let receivedError = false;
      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event: AssistantEvent = JSON.parse(line);
            if (event.type === "text") { setStatus("Rédaction de la réponse…"); update((message) => ({ content: message.content + event.text })); }
            if (event.type === "status") setStatus(event.text);
            if (event.type === "mood") update({ mood: event.mood });
            if (event.type === "sources") update({ sources: event.sources });
            if (event.type === "error") { receivedError = true; update({ error: event.text }); }
            if (event.type === "done") finished = true;
          }
          if (done) break;
        }
        if (!finished && !receivedError) throw new Error("La connexion a été interrompue. Réessayez votre demande.");
      } finally { reader.releaseLock(); }
    } catch (error) {
      update({ error: abort.signal.aborted ? "Réponse arrêtée." : error instanceof Error ? error.message : "Une erreur est survenue." });
    } finally {
      abortRef.current = null;
      setBusy(false);
      setStatus("");
      inputRef.current?.focus();
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="z800-launcher fixed right-4 bottom-5 h-auto gap-2 rounded-2xl py-1.5 pr-4 pl-1.5 shadow-lg md:right-8 md:bottom-8" aria-label="Ouvrir l’assistant Z-800">
          <AssistantRobot mood={robotMood} className="size-14" />
          <span className="flex flex-col items-start gap-0.5">
            <span className="font-mono text-sm font-bold tracking-wider">Z-800</span>
            <span className="text-xs text-muted-foreground">{busy ? "Cerveau en surchauffe…" : "Assistant · presque sage"}</span>
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent showCloseButton={false} className="crm-assistant-workspace gap-0" data-expanded={expanded} style={{ "--assistant-width": `${panelWidth}px` } as CSSProperties}>
        {!expanded && <div role="separator" aria-orientation="vertical" aria-label="Largeur de l’assistant" aria-valuemin={560} aria-valuemax={960} aria-valuenow={panelWidth} tabIndex={0}
          className="absolute inset-y-0 left-0 hidden w-2 touch-none cursor-col-resize rounded-l border-l-2 border-transparent focus-visible:border-ring focus-visible:outline-none md:block"
          onPointerDown={(event) => { resizeRef.current = { x: event.clientX, width: event.currentTarget.parentElement?.getBoundingClientRect().width ?? panelWidth }; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={(event) => { if (resizeRef.current) setPanelWidth(Math.min(960, Math.max(560, resizeRef.current.width + resizeRef.current.x - event.clientX))); }}
          onPointerUp={() => { resizeRef.current = null; }} onPointerCancel={() => { resizeRef.current = null; }}
          onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setPanelWidth((width) => Math.min(960, Math.max(560, width + (event.key === "ArrowLeft" ? 40 : -40)))); } }}
        />}
        <SheetHeader className="shrink-0 gap-3 border-b border-border p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-3">
              <AssistantRobot mood={robotMood} className="size-16" />
              <div className="flex min-w-0 flex-col gap-1">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Zehri · Unité CRM</p>
                <SheetTitle>Z-800, à ton service.</SheetTitle>
                <p className="text-xs text-muted-foreground">{busy ? "Processeur occupé. Blagues en attente." : robotMood === "grumpy" ? "Humeur : boulons légèrement serrés." : "Du métal. Des vannes. Des priorités."}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" className="hidden md:inline-flex" aria-label={expanded ? "Réduire l’espace de travail" : "Agrandir l’espace de travail"} title={expanded ? "Réduire" : "Plein écran"} onClick={() => setExpanded((current) => !current)}>{expanded ? <Minimize2Icon /> : <Maximize2Icon />}</Button>
              <Button variant="ghost" size="icon-sm" aria-label="Effacer la conversation" title="Effacer la conversation" disabled={busy || messages.length === 0} onClick={() => setMessages([])}><Trash2Icon /></Button>
              <SheetClose asChild><Button variant="ghost" size="icon-sm" aria-label="Fermer l’assistant"><XIcon /></Button></SheetClose>
            </div>
          </div>
          <SheetDescription>Je traque les blocages, pas les humains. On fait le point sur ton CRM ?</SheetDescription>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary"><BookOpenIcon data-icon="inline-start" /> Lecture seule</Badge>
            <p className="min-w-0 truncate text-xs text-muted-foreground" title={JSON.stringify(pageContext)}>Contexte : {sectionTitle}{pageContext.productId ? ` · ${pageContext.productId}` : ""}{pageContext.blId ? ` · BL ${pageContext.blId}` : ""}{pageContext.selectionCount ? ` · ${pageContext.selectionCount} colis sélectionné(s)` : ""}{pageContext.filters ? ` · ${pageContext.filters.status}${pageContext.filters.q ? ` · ${pageContext.filters.q}` : ""}` : ""}</p>
          </div>
        </SheetHeader>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6" onScroll={() => {
          const element = scrollRef.current;
          if (element) followRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100;
        }}>
          {messages.length === 0 ? (
            <div className="flex flex-col gap-6">
              <div className="z800-stage relative flex flex-col items-center gap-2 overflow-hidden rounded-2xl border border-border bg-muted/40 px-4 pt-5 pb-4 text-center">
                <div className="flex w-full items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground" aria-hidden="true"><span>Système en ligne</span><span>Modèle Z-800</span></div>
                <AssistantRobot className="size-40" />
                <p className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium">« Je reviendrai… avec les priorités. »</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">100 % métal · 0 % envie de paperasse</p>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-xl font-semibold tracking-tight">Alors chef, on attaque quoi ?</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">Des commandes à relancer, un colis qui boude, une pointure introuvable ? Je regarde les faits. Je râle un peu. Je t’aide surtout.</p>
              </div>
              <div className="flex flex-col gap-2">
                {STARTERS.map((question) => <Button key={question} variant="outline" className="h-auto justify-between gap-3 whitespace-normal py-3 text-left" onClick={() => void send(question)}>{question}<ArrowRightIcon data-icon="inline-end" /></Button>)}
              </div>
            </div>
          ) : (
            <div role="log" aria-label="Conversation avec l’assistant" aria-live="off" className="flex flex-col gap-6">
              {messages.map((message, index) => (
                <article key={index} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {message.role === "assistant" && <AssistantRobot mood={busy && index === messages.length - 1 ? "thinking" : message.error ? "grumpy" : message.mood ?? "cheerful"} className="size-9" />}
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{message.role === "user" ? "Vous" : "Z-800"}</p>
                    {message.mood === "grumpy" && <Badge variant="outline">Mode râleur</Badge>}
                  </div>
                  {message.content && (message.role === "user" || (busy && index === messages.length - 1)
                    ? <div className={message.role === "user" ? "whitespace-pre-wrap break-words rounded-xl bg-muted p-3 leading-relaxed" : "whitespace-pre-wrap break-words text-sm leading-7"}>{message.content}</div>
                    : <Suspense fallback={<div className="whitespace-pre-wrap break-words text-sm leading-7">{message.content}</div>}><AssistantAnswer content={message.content} /></Suspense>)}
                  {message.role === "assistant" && message.content && !(busy && index === messages.length - 1) && <div><Button variant="ghost" size="sm" onClick={async () => {
                    try { await navigator.clipboard.writeText(message.content); toast.success("Réponse copiée."); } catch { toast.error("Copie indisponible. Sélectionnez le texte pour le copier."); }
                  }}><CopyIcon data-icon="inline-start" />Copier la réponse</Button></div>}
                  {message.error && <p role="alert" className="text-sm text-destructive">{message.error}</p>}
                  {!!message.sources?.length && <nav aria-label="Sources consultées" className="flex flex-wrap gap-2 pt-1">
                    {message.sources.filter((source) => /^\/(?:crm|admin)(?:\/|\?|$)/.test(source.href) && !source.href.includes("\\")).map((source) => <Button key={source.href} variant="outline" size="sm" asChild><Link href={source.href} onClick={() => setOpen(false)}>{source.label}<ArrowRightIcon data-icon="inline-end" /></Link></Button>)}
                  </nav>}
                </article>
              ))}
            </div>
          )}
          <div role="status" className="mt-4 flex min-h-6 items-center gap-2 text-xs text-muted-foreground">
            {busy ? <><LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />{status}</> : messages.length > 0 && <span className="sr-only">Réponse disponible dans la conversation.</span>}
          </div>
          <div ref={bottomRef} />
        </div>

        <form className="flex shrink-0 flex-col gap-3 border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onSubmit={(event) => { event.preventDefault(); void send(input); }}>
          <label htmlFor="crm-assistant-question" className="sr-only">Votre question sur le CRM</label>
          <Textarea ref={inputRef} id="crm-assistant-question" value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000} rows={3} placeholder="Dis-moi, chef… quel est le problème ?" disabled={busy} className="max-h-40 resize-none" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Aucune modification ni envoi de message.</p>
            {busy ? <Button type="button" variant="outline" size="sm" onClick={() => abortRef.current?.abort()}><SquareIcon data-icon="inline-start" />Arrêter</Button>
              : <Button type="submit" size="icon" aria-label="Envoyer la question" disabled={!input.trim()}><ArrowUpIcon /></Button>}
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
