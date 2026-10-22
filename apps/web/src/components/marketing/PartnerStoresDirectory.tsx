"use client";
import { Icon } from "@/components/ui/Icon";
import { MerchantLogo } from "@/components/ui/MerchantLogo";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isApiClientError, isAbortError } from "@/services/apiClient";
import { listPartnerStores, type PublicPartnerStore } from "@/services/merchantDirectoryService";
import { getCallLink, getWhatsAppLink } from "@/lib/phone";
import { marketingRoutes } from "@/lib/routes";

const navigationButton = "inline-flex min-h-11 items-center justify-center rounded-full border border-pet-border bg-white px-4 text-sm font-bold text-pet-teal hover:bg-pet-cream disabled:opacity-50";
const storeActionButton = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2";
const comparableName = (name: string) => name.normalize("NFKC").toLocaleLowerCase("en-MY").replace(/[^\p{L}\p{N}]/gu, "");

function StoreLocationDetails({ location, showName = true, multiple = false }: {
  location: PublicPartnerStore["branches"][number]; showName?: boolean; multiple?: boolean;
}) {
  const Heading = multiple ? "h5" : "h4";
  return <div className="grid min-w-0 content-start gap-3">
    <div className="flex min-w-0 items-start gap-2">
      <Icon name="pin" className="mt-0.5 h-5 w-5 shrink-0 text-pet-teal" />
      <div className="grid min-w-0 gap-2">
        {showName && <Heading className="font-black text-pet-ink [overflow-wrap:anywhere]">{location.name}</Heading>}
        <address className="text-sm not-italic text-pet-muted [overflow-wrap:anywhere]">{[location.address.addressLine1, location.address.addressLine2, location.address.postcode, location.address.city, location.address.state, location.address.country].filter(Boolean).join(", ")}</address>
      </div>
    </div>
    {location.businessHours && <p className="whitespace-pre-line text-sm text-pet-muted [overflow-wrap:anywhere]">Hours: {location.businessHours}</p>}
    <div className="flex flex-wrap gap-2">
      {location.googleMapsUrl && <a className={`${storeActionButton} border-[#1769E9] bg-[#1769E9] text-white hover:bg-[#1257C4] focus-visible:outline-[#1769E9]`} href={location.googleMapsUrl} target="_blank" rel="noopener noreferrer"><Icon name="pin" className="h-4 w-4 shrink-0" />Google Maps</a>}
      {location.wazeUrl && <a className={`${storeActionButton} border-slate-300 bg-white text-pet-ink hover:bg-pet-cream focus-visible:outline-pet-ink`} href={location.wazeUrl} target="_blank" rel="noopener noreferrer"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0"><path d="m21 3-6.5 18-4-7.5L3 9.5 21 3Z" /></svg>Waze</a>}
      {location.contactPhone && <a className={navigationButton} href={getCallLink(location.contactPhone)}>Call store</a>}
      {location.whatsApp && <a className={`${storeActionButton} border-[#27AA65] bg-white text-pet-sage hover:bg-green-50 focus-visible:outline-pet-sage`} href={getWhatsAppLink(location.whatsApp)} target="_blank" rel="noopener noreferrer"><Icon name="comment" className="h-4 w-4 shrink-0" />WhatsApp</a>}
    </div>
  </div>;
}

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
  // The public response contains only eligible locations; never use internal counts.
  const stores = current?.items.filter(store => store.branches.length > 0) ?? [];
  const button = navigationButton;
  return <section id="partner-stores" className="mt-8 grid gap-5">
    <div><h2 className="text-2xl font-black text-pet-ink">Find a partner store</h2><p className="mt-2 text-sm text-pet-muted">Explore participating physical stores and their locations. Contact the store before visiting to check Smart Tag availability and opening hours.</p></div>
    {publicCode ? <a className={`${button} justify-self-start`} href={`${marketingRoutes.whereToBuy}#partner-stores`}>View all partner stores</a> : <label className="grid gap-2 text-sm font-bold text-pet-ink">Search by merchant or location
      <input type="search" maxLength={160} className="min-h-12 rounded-xl border border-pet-border bg-white px-4 outline-none focus:border-pet-teal" placeholder="Merchant, city, state or postcode" value={search} onChange={e => setSearch(e.target.value)} />
    </label>}
    {current && current.revision !== reload && <p role="status" className="text-sm text-pet-muted">Refreshing partner stores…</p>}
    {current?.error && <div role="alert" className="brand-card rounded-2xl p-5"><p>{current.error}</p><div className="mt-3 flex flex-wrap gap-2"><button className={button} type="button" onClick={() => setReload(n => n + 1)}>Try again</button><a className={button} href={`${marketingRoutes.whereToBuy}#partner-stores`}>View all partner stores</a></div></div>}
    {!current ? <p role="status" className="text-sm text-pet-muted">Loading partner stores…</p> : stores.length === 0 ? current.error ? null : <p role="status" className="brand-card rounded-2xl p-5 text-sm text-pet-muted">{term ? "No partner stores match this search. Try another city or merchant name." : "No partner stores are listed yet. Please check back soon."}</p>
      : <div className="grid gap-5">{stores.map(store => <article key={store.publicCode} className="brand-card min-w-0 rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <MerchantLogo name={store.name} src={store.logoUrl} />
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-black text-pet-ink [overflow-wrap:anywhere]">{store.name}</h3>
            {store.businessDescription && <p className="mt-2 whitespace-pre-line text-sm text-pet-muted [overflow-wrap:anywhere]">{store.businessDescription}</p>}
          </div>
        </div>
        <div className="mt-4 border-t border-pet-border pt-4">
          {store.branches.length === 1 ? <StoreLocationDetails location={store.branches[0]} showName={comparableName(store.name) !== comparableName(store.branches[0].name)} />
            : <>
              <h4 className="mb-3 font-black text-pet-ink">Our Locations ({store.branches.length})</h4>
              <div className="grid gap-3 md:grid-cols-2">{store.branches.map((location, index) => <section key={index} className="min-w-0 rounded-xl border border-pet-border p-4">
                <StoreLocationDetails location={location} multiple />
              </section>)}</div>
            </>}
        </div>
      </article>)}</div>}
    {current && current.total > 20 && <nav aria-label="Partner store pages" className="flex items-center justify-between gap-3"><button className={button} type="button" disabled={page === 1} onClick={() => setPage(n => n - 1)}>Previous</button><span className="text-sm text-pet-muted">Page {page} of {Math.ceil(current.total / 20)}</span><button className={button} type="button" disabled={page * 20 >= current.total} onClick={() => setPage(n => n + 1)}>Next</button></nav>}
  </section>;
}
