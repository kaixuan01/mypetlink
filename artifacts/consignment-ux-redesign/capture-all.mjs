// "After" captures for the redesigned Consignment workspace.
export default async function ({ shot, tab, dispatchId }) {
  const ids = JSON.parse(await (await import("node:fs/promises")).readFile(process.env.SEEDED, "utf8"));
  await shot("desktop-overview", 1440, 900, tab);
  await shot("desktop-agreements", 1440, 900, `${tab}&view=agreements`);
  await shot("desktop-agreement-draft", 1440, 900, `${tab}&agreement=${ids.draft}`);
  await shot("desktop-agreement-active", 1440, 900, `${tab}&agreement=${ids.a1}`);
  await shot("desktop-custody", 1440, 900, `${tab}&view=custody`);
  await shot("desktop-dispatch-discrepancy", 1440, 900, `${tab}&dispatch=${ids.d1}`);
  await shot("desktop-dispatch-awaiting-receipt", 1440, 900, `${tab}&dispatch=${ids.d2}`);
  await shot("desktop-dispatch-reserved", 1440, 900, `${tab}&dispatch=${ids.d3}`);
  await shot("desktop-reconciliation", 1440, 900, `${tab}&view=reconciliation`);
  await shot("desktop-settings", 1440, 900, `${tab}&view=settings`);
  await shot("desktop-wizard-partner", 1440, 900, tab, async p => { await p.getByRole("button", { name: "New agreement" }).first().click(); });
  await shot("desktop-wizard-terms", 1440, 900, tab, async p => {
    await p.getByRole("button", { name: "New agreement" }).first().click();
    await p.getByTestId("form-dialog-body").getByLabel("Merchant", { exact: true }).selectOption({ index: 1 });
    await p.getByLabel("Agreement reference").fill("WHISKER-2026-02");
    await p.getByRole("button", { name: "Continue" }).click();
  });
  await shot("desktop-reserve", 1440, 900, `${tab}&view=custody`, async p => { await p.getByRole("button", { name: "Reserve stock" }).first().click(); });
  await shot("mobile-overview", 390, 844, tab);
  await shot("mobile-agreements", 390, 844, `${tab}&view=agreements`);
  await shot("mobile-custody", 390, 844, `${tab}&view=custody`);
  await shot("mobile-dispatch", 390, 844, `${tab}&dispatch=${ids.d2}`);
  await shot("mobile-agreement", 390, 844, `${tab}&agreement=${ids.draft}`);
}
