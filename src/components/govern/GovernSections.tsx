import type { Business } from '@/services/db';
import GovernanceDocsTab from './GovernanceDocsTab';

// Thin, well-labelled wrappers over the shared governance document component.
// The wording matters as much as the schema here — the point of this section is
// that someone who has never run this business can read it and understand how
// the place works.

export function HandbookTab({ business }: { business: Business }) {
  return (
    <GovernanceDocsTab
      business={business}
      kinds={['profile', 'sop']}
      heading="Handbook"
      description="What this business is, and how its recurring work actually gets done. Written so a new manager could pick it up cold."
      bodyLabel="Steps / details"
      bodyPlaceholder={'e.g.\n1. Open the courier portal\n2. Download yesterday\'s remittance file\n3. Record it under Sales → COD'}
      emptyHint="Start with the two or three procedures only you currently know how to do — those are the ones that trap you."
      withReview
    />
  );
}

export function PoliciesTab({ business }: { business: Business }) {
  return (
    <GovernanceDocsTab
      business={business}
      kinds={['policy']}
      heading="Policies & limits"
      description="The rules that decide what people can do without asking — approval thresholds, discount limits, credit terms, refund rules."
      bodyLabel="The rule"
      bodyPlaceholder="e.g. Any single purchase above 20,000 EGP needs owner approval before the PO is sent."
      emptyHint="Write down the limits you already enforce in your head. That's what lets someone else act without you."
      withReview
    />
  );
}

export function RegistersTab({ business }: { business: Business }) {
  return (
    <GovernanceDocsTab
      business={business}
      kinds={['vendor', 'system']}
      heading="Vendors & systems"
      description="Who you depend on and what the business runs on — couriers, suppliers, accountants, and the tools you pay for."
      bodyLabel="Details"
      bodyPlaceholder={'e.g. Courier — Bosta. Account manager: Ahmed (0100…). Terms: 30 EGP/parcel, weekly remittance.\n\nFor systems, record WHO holds access and WHERE it lives — never the password itself.'}
      emptyHint="Record who holds each account and where it lives. Never store passwords here — those belong in a password manager."
    />
  );
}

export function DecisionsTab({ business }: { business: Business }) {
  return (
    <GovernanceDocsTab
      business={business}
      kinds={['decision']}
      heading="Decision log"
      description="Why things are the way they are. Future-you (or a new manager) will otherwise undo good decisions without knowing the reasoning."
      bodyLabel="What was decided, and why"
      bodyPlaceholder="e.g. Moved to COD-only with Bosta in June — prepaid conversion was under 8% and card fees ate the margin. Revisit if prepaid share passes 20%."
      emptyHint="Log the decisions that would look arbitrary to someone new."
    />
  );
}

export function KpiDictionaryTab({ business }: { business: Business }) {
  return (
    <GovernanceDocsTab
      business={business}
      kinds={['kpi']}
      heading="KPI dictionary"
      description="Exactly how each number is defined, so two people reading the same figure mean the same thing."
      bodyLabel="Definition"
      bodyPlaceholder="e.g. Net revenue = gross sales − refunds − discounts. Excludes shipping charged to the customer."
      emptyHint="Define the handful of numbers you actually make decisions on."
    />
  );
}

export function ComplianceTab({ business }: { business: Business }) {
  return (
    <GovernanceDocsTab
      business={business}
      kinds={['compliance']}
      heading="Compliance calendar"
      description="Recurring obligations — tax filings, licence renewals, insurance. These surface as alerts on the Command screen before they bite."
      bodyLabel="What's required"
      bodyPlaceholder="e.g. Quarterly VAT return — filed through the ETA portal by the 30th of the month following quarter end."
      emptyHint="Add the deadlines that carry a penalty if missed."
      withDueDate
    />
  );
}
