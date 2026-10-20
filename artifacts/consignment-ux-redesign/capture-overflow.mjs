// Reports real horizontal page scroll at phone width (body overflow-x is hidden, so scrollWidth alone is not proof).
export default async function ({ shot, tab }) {
  const ids = JSON.parse(await (await import("node:fs/promises")).readFile(process.env.SEEDED, "utf8"));
  for (const url of [tab, `${tab}&view=agreements`, `${tab}&view=custody`, `${tab}&dispatch=${ids.d1}`, `${tab}&agreement=${ids.draft}`, `${tab}&view=reconciliation`, `${tab}&view=settings`]) {
    await shot("overflow-probe", 390, 844, url, async p => {
      const r = await p.evaluate(() => {
        window.scrollTo(4000, 0);
        const wide = [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest(".overflow-x-auto,.overflow-auto"))
          .slice(0, 5).map(e => `${e.tagName}.${String(e.className).slice(0, 60)} r=${Math.round(e.getBoundingClientRect().right)}`);
        return { scrollX: window.scrollX, inner: window.innerWidth, doc: document.documentElement.scrollWidth, wide };
      });
      console.log(url.split("?")[1], JSON.stringify(r));
    });
  }
}
