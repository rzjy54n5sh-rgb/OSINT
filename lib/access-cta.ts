/**
 * The ONE call to action for locked content (UX audit 2026-10-13, change #7). /pricing sells no plan
 * during the launch period ("There is nothing to pay today"); it offers founding access by email. So
 * every lock points there with the same words instead of naming "Informed" / "Professional" plans
 * that cannot be bought. The anchor is the founding-access card's heading id on /pricing.
 */
export const FOUNDING_ACCESS_HREF = '/pricing#founding-access-heading';
/** Same wording as the /pricing card heading. */
export const FOUNDING_ACCESS_LABEL = 'Founding access — free while we launch';
/** Short CTA for inline locks. */
export const FOUNDING_ACCESS_SHORT = 'Join founding access — free';
/** What a locked field shows in place of its value. */
export const LOCKED_TEXT = 'Locked during launch';
