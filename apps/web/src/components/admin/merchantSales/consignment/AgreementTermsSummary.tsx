import type * as api from "@/services/adminConsignmentService";
import { effectivePeriod, myPetLinkShare, percentLabel } from "./model";
import { Term, TermGroup, TermValue } from "./ui";

/**
 * The commercial terms grouped the way they are negotiated. Missing terms read
 * "Not agreed yet" rather than being filled in for the operator.
 */
export function AgreementTermsSummary({
  agreement: a,
  compact = false,
}: {
  agreement: api.AgreementInput;
  compact?: boolean;
}) {
  const rate = a.partnerCommissionPercentage;
  return (
    <div className={`grid ${compact ? "gap-3" : "gap-5"}`}>
      <TermGroup title="Commission and duration">
        <Term label="Partner commission">
          <TermValue value={rate === null ? null : `${percentLabel(rate)} · MyPetLink ${myPetLinkShare(rate)}%`} />
        </Term>
        <Term label="Effective period">
          <TermValue value={a.effectiveFrom ? effectivePeriod(a) : null} />
        </Term>
        <Term label="Duration and renewal" wide>
          <TermValue value={a.durationTerms} />
        </Term>
      </TermGroup>
      <TermGroup title="Settlement and payment">
        <Term label="Settlement frequency">
          <TermValue value={a.settlementFrequency} />
        </Term>
        <Term label="Payment deadline">
          <TermValue value={a.paymentDeadlineDays === null ? null : `${a.paymentDeadlineDays} ${a.paymentDeadlineDays === 1 ? "day" : "days"}`} />
        </Term>
      </TermGroup>
      <TermGroup title="Discounts and returns">
        <Term label="Discount permissions">
          <TermValue value={a.discountTerms} />
        </Term>
        <Term label="Return terms">
          <TermValue value={a.returnTerms} />
        </Term>
      </TermGroup>
      <TermGroup title="Loss and damage">
        <Term label="Responsibility" wide>
          <TermValue value={a.lossTerms} />
        </Term>
      </TermGroup>
      <TermGroup title="Evidence and tracking">
        <Term label="Signed partner agreement">
          <TermValue value={a.signedAgreementReference} />
        </Term>
        <Term label="External tracker">
          <TermValue value={a.externalTrackerReference} />
        </Term>
      </TermGroup>
    </div>
  );
}
