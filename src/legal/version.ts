// Bumping POLICY_VERSION forces every existing user to re-accept on next
// login (LegalAcceptModal compares this to profiles.policy_version_accepted).
// Use the date of the substantive change as the version — easy to audit,
// easy to communicate to users.
export const POLICY_VERSION = '2026-05-27'
export const LAST_UPDATED = 'May 27, 2026'

// Single source of truth for placeholder owner / contact details. Replace
// these before going live — every legal page reads from here.
export const LEGAL_ENTITY = '[REPLACE: LEGAL ENTITY NAME / OPERATOR]'
export const LEGAL_JURISDICTION = '[REPLACE: GOVERNING LAW & VENUE]'
export const CONTACT_EMAIL = '[REPLACE: contact@yourdomain.com]'
export const DMCA_AGENT_NAME = '[REPLACE: DMCA AGENT NAME]'
export const DMCA_AGENT_ADDRESS = '[REPLACE: DMCA AGENT POSTAL ADDRESS]'
