"use client";

import { useState } from "react";
import { formatShelfLifeExpiry, SHELF_LIFE_CHART_VALID_TO, SHELF_LIFE_PRODUCT_CATALOG, SHELF_LIFE_REFERENCE_RULES, SHELF_LIFE_SECTIONS, shelfLifeProductId } from "@/lib/shelfLife";

const periodText = (amount: number, unit: "days" | "hours") => `${amount} ${amount === 1 ? unit.slice(0, -1) : unit}`;

export default function ShelfLifeGuide({ now, hiddenProductIds = [], onHiddenProductIdsChange }: { now: Date; hiddenProductIds?: string[]; onHiddenProductIdsChange: (ids: string[]) => void }) {
  const [choosingProducts, setChoosingProducts] = useState(false);
  const hidden = new Set(hiddenProductIds);
  const visibleSections = SHELF_LIFE_SECTIONS.map((section) => ({ ...section, items: section.items.map((item) => ({ ...item, products: item.products.filter((product) => !hidden.has(shelfLifeProductId(product))) })).filter((item) => item.products.length > 0) })).filter((section) => section.items.length > 0);
  const visibleReferenceRules = SHELF_LIFE_REFERENCE_RULES.map((item) => ({ ...item, products: item.products.filter((product) => !hidden.has(shelfLifeProductId(product))) })).filter((item) => item.products.length > 0);
  const visibleCount = SHELF_LIFE_PRODUCT_CATALOG.length - hiddenProductIds.filter((id) => SHELF_LIFE_PRODUCT_CATALOG.some((item) => item.id === id)).length;
  const toggleProduct = (id: string) => onHiddenProductIdsChange(hidden.has(id) ? hiddenProductIds.filter((value) => value !== id) : [...hiddenProductIds, id]);
  const todayLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const validTo = new Date(2026, 8, 6, 12).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return <details className="panel dashboard-insight-panel shelf-life-guide">
    <summary>
      <span><p className="eyebrow">STORE REFERENCE</p><strong>Shelf-life date guide</strong><small>Today is day 1 · {visibleCount} products shown</small></span>
      <i aria-hidden="true">⌄</i>
    </summary>
    <div className="dashboard-insight-body shelf-life-body">
      <header><span><small>CAMPAIGN 4 · ALL STORES</small><strong>Dates for {todayLabel}</strong></span><div><em>Chart valid to {validTo}</em><button type="button" className="shelf-life-choose-button" aria-expanded={choosingProducts} onClick={() => setChoosingProducts((value) => !value)}>{choosingProducts ? "DONE" : "CHOOSE PRODUCTS"}</button></div></header>
      <p className="shelf-life-rule">Day-based lives include today: 7 days from today ends on day 7. Hour-based rules run for the exact number of hours from now.</p>
      {choosingProducts && <section className="shelf-life-chooser" aria-label="Choose products used by this store"><header><span><small>STORE PRODUCT LIST</small><strong>Choose what your store uses</strong><em>Unticked products stay saved but disappear from the normal guide.</em></span><div><button type="button" onClick={() => onHiddenProductIdsChange([])}>TICK ALL</button><button type="button" onClick={() => onHiddenProductIdsChange(SHELF_LIFE_PRODUCT_CATALOG.map((item) => item.id))}>UNTICK ALL</button></div></header><div>{SHELF_LIFE_PRODUCT_CATALOG.map((item) => <label key={item.id}><input type="checkbox" checked={!hidden.has(item.id)} onChange={() => toggleProduct(item.id)} /><span><strong>{item.product}</strong><small>{item.category} · {item.section}</small></span></label>)}</div></section>}
      {!choosingProducts && <>
      {visibleSections.length > 0 && <nav className="shelf-life-jump" aria-label="Shelf-life sections">{visibleSections.map((section) => <a key={section.id} href={`#shelf-${section.id}`}>{section.title}</a>)}</nav>}
      <div className="shelf-life-sections">{visibleSections.map((section) => <details id={`shelf-${section.id}`} key={section.id} className={`shelf-life-section ${section.id}`}>
        <summary className="shelf-life-section-title"><span><small>{section.title}</small><em>{section.subtitle}</em></span><b>{section.items.reduce((count, item) => count + item.products.length, 0)} items <i aria-hidden="true">⌄</i></b></summary>
        <div className="shelf-life-list">{section.items.map((item) => <article key={`${section.id}-${item.products.join("-")}`}>
          <div><small>{item.category}</small><strong>{item.products.join(" · ")}</strong>{item.note && <em>{item.note}</em>}</div>
          <div>{item.periods.map((period) => <span key={`${period.label}-${period.amount}-${period.unit}`}><small>{period.label} · {periodText(period.amount, period.unit)}</small><strong>{formatShelfLifeExpiry(now, period)}</strong></span>)}</div>
        </article>)}</div>
      </details>)}</div>
      {visibleReferenceRules.length > 0 && <section className="shelf-life-reference"><div className="shelf-life-section-title"><span><small>Use the pack date</small><em>Rules that cannot be calculated from today alone</em></span></div>{visibleReferenceRules.map((item) => <article key={item.products.join("-")}><span><small>{item.category}</small><strong>{item.products.join(" · ")}</strong></span><p>{item.rule}</p></article>)}</section>}
      {visibleCount === 0 && <div className="shelf-life-empty"><strong>No products selected</strong><p>Open Choose products and tick the items your store uses.</p><button type="button" onClick={() => setChoosingProducts(true)}>CHOOSE PRODUCTS</button></div>}
      <footer><strong>Important</strong><p>Never extend beyond the unopened use-by or best-before date on the original packaging. Follow current DPG storage guidance if it differs from this Campaign 4 chart.</p><small>Source: Campaign 4 Shelf Life Chart, version 1 · issued 5 June to {SHELF_LIFE_CHART_VALID_TO.split("-").reverse().join("/")}</small></footer>
      </>}
    </div>
  </details>;
}
