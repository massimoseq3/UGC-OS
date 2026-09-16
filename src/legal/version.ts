// The version stamped on profiles.policy_version_accepted when a member signs
// up and agrees. Bumping it no longer asks anyone to re-accept: the blocking
// "Updated Terms" modal that compared the two was removed (September 2026,
// Massimo's call) after members reported Accept & continue not going through,
// which left them locked out of the workspace. A policy change now has to be
// announced some other way. Use the date of the substantive change as the
// version — easy to audit, easy to communicate.
export const POLICY_VERSION = '2026-05-27'
export const LAST_UPDATED = 'May 27, 2026'

// Single source of truth for placeholder owner / contact details. Replace
// these before going live — every legal page reads from here.
export const LEGAL_ENTITY = '[REPLACE: LEGAL ENTITY NAME / OPERATOR]'
export const LEGAL_JURISDICTION = '[REPLACE: GOVERNING LAW & VENUE]'
export const CONTACT_EMAIL = '[REPLACE: contact@yourdomain.com]'
export const DMCA_AGENT_NAME = '[REPLACE: DMCA AGENT NAME]'
export const DMCA_AGENT_ADDRESS = '[REPLACE: DMCA AGENT POSTAL ADDRESS]'
