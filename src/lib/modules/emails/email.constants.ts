/**
 * Whether we received or sent an email. Only inbound emails exist until Phase 5.
 */
export const emailDirections = ['inbound', 'outbound'] as const;

export const EMAIL_PROVIDER_MAX_LENGTH = 100;

export const EMAIL_PROVIDER_ID_MAX_LENGTH = 500;

/**
 * Message-IDs are indexed, and an index entry has a size limit. A real one is far shorter.
 */
export const EMAIL_MESSAGE_ID_MAX_LENGTH = 500;

export const EMAIL_ATTACHMENT_MAX_SIZE_BYTES = 2_147_483_647;
