/**
 * Shape of the breed registry.
 *
 * Breed is stored as free text on the pet record, so nothing here is ever
 * enforced — these are the suggestions an owner picks from, and the picker
 * always keeps a custom-value escape hatch. That is deliberate: no dataset can
 * cover every pet, and blocking an owner because their pet is missing from our
 * list would be worse than an unrecognised string.
 */
export type BreedEntry = {
  /**
   * Saved verbatim to `Pet.breed`. Treat as canonical: never ship two entries
   * meaning the same thing, and never change an existing value without
   * considering the pets already storing it.
   */
  value: string;
  /**
   * Shown in the picker when the stored value alone needs explaining. Purely
   * presentational — the stored value is always `value`.
   */
  label?: string;
  /**
   * Extra search terms, including formal names we deliberately do not ship as
   * separate entries (for example "Siberian Husky" finding "Husky"). Never
   * stored, so these add findability without fragmenting the data.
   */
  keywords?: readonly string[];
};

export type SpeciesBreedData = {
  /**
   * Alphabetical by `value`, except where a note says otherwise. Keeping one
   * order rule makes review and de-duplication straightforward.
   */
  breeds: readonly BreedEntry[];
};
