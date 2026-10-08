/**
 * Who stands behind MENA Intel Desk — the identity shown on /about, /conflicts-of-interest and in
 * the brief JSON-LD.
 *
 * EVERY FIELD IS SUPPLIED BY THE OPERATOR. Nothing here may be guessed, abbreviated or filled with a
 * placeholder: a field that is null is simply not rendered. Pages must call `identityFields()` and
 * never print a fallback name.
 */
export interface DeskIdentity {
  /** Full name of the responsible editor, exactly as they want it published. */
  editorName: string | null;
  /** Their title, e.g. "Editor and publisher". */
  editorTitle: string | null;
  /** Registered legal entity that publishes the desk, with jurisdiction. */
  legalEntity: string | null;
  /** Public contact address for complaints and corrections. */
  contactEmail: string | null;
}

export const DESK_IDENTITY: DeskIdentity = {
  editorName: null,
  editorTitle: null,
  legalEntity: null,
  contactEmail: null,
};

export const DESK_NAME = 'MENA Intel Desk';

/**
 * Whether every brief gets a line-by-line human edit BEFORE it is published. Operator-confirmed only.
 * While false, /ai-disclosure and /about say plainly that briefs are published by the automated daily
 * build and corrected afterwards — they must not claim pre-publication human review.
 */
export const PRE_PUBLICATION_HUMAN_REVIEW = false;

/** The date the corrections log and no-silent-edit rule start (migration 20261009090000_trust_ledgers). */
export const CORRECTIONS_LOG_START = '9 October 2026';

/** Identity fields that are set, in display order. Empty when the operator has supplied none. */
export function identityFields(id: DeskIdentity = DESK_IDENTITY): { label: string; value: string; href?: string }[] {
  const out: { label: string; value: string; href?: string }[] = [];
  const clean = (v: string | null) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const name = clean(id.editorName);
  const title = clean(id.editorTitle);
  const entity = clean(id.legalEntity);
  const email = clean(id.contactEmail);
  if (name) out.push({ label: title ?? 'Editor', value: name });
  if (entity) out.push({ label: 'Published by', value: entity });
  if (email) out.push({ label: 'Contact', value: email, href: `mailto:${email}` });
  return out;
}

/**
 * Conflicts-of-interest register. Each entry is a disclosure the operator has made in writing; entries
 * are never inferred. Empty until the operator supplies them.
 */
export interface CoiEntry {
  /** Who the interest belongs to (the editor, the legal entity, a contributor). */
  holder: string;
  /** The interest: a company, client, shareholding, employer, funding source, family tie. */
  interest: string;
  /** Countries or topics on this site the interest touches, e.g. ['EG', 'AE'] or ['business briefs']. */
  touches: string[];
  /** What the desk does about it, e.g. "recused from Egypt business briefs". */
  handling: string;
  /** ISO date the disclosure was made. */
  disclosedOn: string;
}

export const COI_REGISTER: CoiEntry[] = [];
