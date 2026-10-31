export interface ReferencePage { slug: string; title: string; heading: string; markdown: string; summary: string; }
export interface Reference { slug: string; title: string; intro: string; pages: ReferencePage[]; anchors: Record<string, string>; file: string; }
export const splitDocs: string[];
export const repoRoot: string;
export const docsDir: string;
export function slugify(text: string): string;
export function readReference(slug: string): Reference;
export function referenceTarget(slug: string, hash?: string): string | null;
export function readDoc(slug: string): string;
export function sourceUrl(source: string): URL;
