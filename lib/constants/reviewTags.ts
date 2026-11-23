// lib/constants/reviewTags.ts
// A fixed vocabulary of quick tags a client can pick alongside a review's star rating and comment
// (migration 0114 adds the `tags text[]` column). Kept as a short list in code - not a database
// table - so the wording can change without a migration; a tag already saved on an old review just
// keeps showing whatever string it was saved as, matched against this list if it's still here.
export const REVIEW_TAGS_POSITIVE = ['Punctual', 'Neat work', 'Polite', 'Explained the issue well'] as const;
export const REVIEW_TAGS_CONSTRUCTIVE = ['Late arrival', 'Left a mess', 'Slow to respond', 'Work needed a follow-up'] as const;

export const REVIEW_TAGS = [...REVIEW_TAGS_POSITIVE, ...REVIEW_TAGS_CONSTRUCTIVE];

export function isPositiveReviewTag(tag: string): boolean {
  return (REVIEW_TAGS_POSITIVE as readonly string[]).includes(tag);
}
