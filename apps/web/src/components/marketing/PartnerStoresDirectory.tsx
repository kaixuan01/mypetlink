"use client";
import { MerchantLogo } from "@/components/ui/MerchantLogo";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isApiClientError, isAbortError } from "@/services/apiClient";
import { listPartnerStores, type PublicPartnerStore } from "@/services/merchantDirectoryService";
import { getCallLink, getWhatsAppLink } from "@/lib/phone";
import { marketingRoutes } from "@/lib/routes";

export function PartnerStoresDirectory() {
  return <Suspense fallback={<section id="partner-stores" className="mt-8"><p role="status" className="text-sm text-pet-muted">Loading partner stores…</p></section>}>
    <PartnerStoresContent />
  </Suspense>;
}

function PartnerStoresContent() {
  const publicCode = useSearchParams().get("store");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<{ key: string; items: PublicPartnerStore[]; total: number; error: string; loadedAt: number; revision: number } | null>(null);
  const key = `${publicCode ?? ""}:${page}:${term}`;

  useEffect(() => {
    const timer = window.setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const refresh = () => setReload(n => n + 1);
    const visibility = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", refresh); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    listPartnerStores(page, term, publicCode, controller.signal)
      .then(value => { if (!controller.signal.aborted) setResult({ ...value, key, error: "", loadedAt: Date.now(), revision: reload }); })
      .catch(caught => {
        if (controller.signal.aborted || isAbortError(caught)) return;
        const unavailable = Boolean(publicCode && isApiClientError(caught) && caught.status === 404);
        setResult(previous => {
          // A short freshness lease avoids indefinite stale exposure during an
          // outage. A confirmed withdrawal is always removed immediately.
          const retain = !unavailable && previous?.key === key && Date.now() - previous.loadedAt < 60000;
          return { key, items: retain ? previous.items : [], total: retain ? previous.total : 0,
            loadedAt: retain ? previous.loadedAt : Date.now(), revision: reload,
            error: unavailable ? "This store is no longer available in the directory."
              : retain && previous.items.length ? "We couldn’t refresh partner stores. Please try again in a moment."
              : "We couldn’t load partner stores. Please try again in a moment." };
        });
      });
    return () => controller.abort();
  }, [key, page, term, publicCode, reload]);
  useEffect(() => {
    if (!result?.items.length || (!result.error && result.revision === reload)) return;
    const timer = window.setTimeout(() => setResult(previous => previous === result
      ? { ...previous, items: [], total: 0, error: "We couldn’t load partner stores. Please try again in a moment." } : previous), Math.max(0, 60000 - (Date.now() - result.loadedAt)));
    return () => window.clearTimeout(timer);
  }, [result, reload]);
  const current = result?.key === key ? result : null;
  const button = "inline-flex min-h-11 items-center justify-center rounded-full border border-pet-border bg-white px-4 text-sm font-bold text-pet-teal hover:bg-pet-cream disabled:opacity-50";
  return <section id="partner-stores" className="mt-8 grid gap-5">
    <div><h2 className="text-2xl font-black text-pet-ink">Find a partner store</h2><p className="mt-2 text-sm text-pet-muted">Explore participating physical stores and their branches. Contact the branch before visiting to check Smart Tag availability and opening hours.</p></div>
    {publicCode ? <a className={`${button} justify-self-start`} href={`${marketingRoutes.whereToBuy}#partner-stores`}>View all partner stores</a> : <label className="grid gap-2 text-sm font-bold text-pet-ink">Search by merchant or location
      <input type="search" maxLength={160} className="min-h-12 rounded-xl border border-pet-border bg-white px-4 outline-none focus:border-pet-teal" placeholder="Merchant, city, state or postcode" value={search} onChange={e => setSearch(e.target.value)} />
    </label>}
    {current && current.revision !== reload && <p role="status" className="text-sm text-pet-muted">Refreshing partner stores…</p>}
    {current?.error && <div role="alert" className="brand-card rounded-2xl p-5"><p>{current.error}</p><div className="mt-3 flex flex-wrap gap-2"><button className={button} type="button" onClick={() => setReload(n => n + 1)}>Try again</button><a className={button} href={`${marketingRoutes.whereToBuy}#partner-stores`}>View all partner stores</a></div></div>}
    {!current ? <p role="status" className="text-sm text-pet-muted">Loading partner stores…</p> : current.items.length === 0 ? current.error ? null : <p role="status" className="brand-card rounded-2xl p-5 text-sm text-pet-muted">{term ? "No partner stores match this search. Try another city or merchant name." : "No partner stores are listed yet. Please check back soon."}</p>
      : <div className="grid gap-5">{current.items.map(store => <article key={store.publicCode} className="brand-card min-w-0 rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <MerchantLogo name={store.name} src={store.logoUrl} />
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-black text-pet-ink [overflow-wrap:anywhere]">{store.name}</h3>
            {store.businessDescription && <p className="mt-2 whitespace-pre-line text-sm text-pet-muted [overflow-wrap:anywhere]">{store.businessDescription}</p>}
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">{store.branches.map((branch, index) => <section key={index} className="grid content-start gap-3 rounded-xl border border-pet-border p-4">
          <h4 className="font-black text-pet-ink">{branch.name}</h4>
          <address className="break-words text-sm not-italic text-pet-muted">{[branch.address.addressLine1, branch.address.addressLine2, branch.address.postcode, branch.address.city, branch.address.state, branch.address.country].filter(Boolean).join(", ")}</address>
          {branch.businessHours && <p className="whitespace-pre-line text-sm text-pet-muted">Hours: {branch.businessHours}</p>}
          <div className="flex flex-wrap gap-2">
            {branch.googleMapsUrl && <a className={button} href={branch.googleMapsUrl} target="_blank" rel="noopener noreferrer">Google Maps</a>}
            {branch.wazeUrl && <a className={button} href={branch.wazeUrl} target="_blank" rel="noopener noreferrer">Waze</a>}
            {branch.contactPhone && <a className={button} href={getCallLink(branch.contactPhone)}>Call branch</a>}
            {branch.whatsApp && <a className={button} href={getWhatsAppLink(branch.whatsApp)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          </div>
        </section>)}</div>
      </article>)}</div>}
    {current && current.total > 20 && <nav aria-label="Partner store pages" className="flex items-center justify-between gap-3"><button className={button} type="button" disabled={page === 1} onClick={() => setPage(n => n - 1)}>Previous</button><span className="text-sm text-pet-muted">Page {page} of {Math.ceil(current.total / 20)}</span><button className={button} type="button" disabled={page * 20 >= current.total} onClick={() => setPage(n => n + 1)}>Next</button></nav>}
  </section>;
}
