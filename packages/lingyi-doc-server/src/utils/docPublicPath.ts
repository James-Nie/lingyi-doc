export interface DocPublicPathSegments {
  spaceSlug: string;
  bookSlug: string;
  docSlug: string;
}

/** 文档拥有者访问路径：/{space}/{book}/{doc} */
export function buildDocOwnerPath(segments: DocPublicPathSegments): string {
  const { spaceSlug, bookSlug, docSlug } = segments;
  return `/${spaceSlug}/${bookSlug}/${docSlug}`;
}

/** 协作者申请加入路径（语雀风格） */
export function buildCollaboratorJoinPath(
  segments: DocPublicPathSegments,
  token: string,
  docTitle?: string | null,
): string {
  const base = `/g/${segments.spaceSlug}/${segments.bookSlug}/${segments.docSlug}/collaborator/join`;
  const params = new URLSearchParams({
    token,
    source: 'doc_collaborator',
  });
  const hash = docTitle ? `# ${docTitle}` : '';
  return `${base}?${params.toString()}${hash}`;
}

/** 公开链接访问路径（与文档 canonical 路径一致，通过 token 鉴权） */
export function buildPublicLinkJoinPath(
  segments: DocPublicPathSegments,
  token: string,
  docTitle?: string | null,
): string {
  const path = buildDocOwnerPath(segments);
  const params = new URLSearchParams({
    token,
    source: 'doc_link',
  });
  const hash = docTitle ? `# ${docTitle}` : '';
  return `${path}?${params.toString()}${hash}`;
}
