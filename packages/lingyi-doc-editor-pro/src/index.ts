/**
 * 产品闭源门面：聚合 OSS `@lingyi-doc/editor` 与商业 `@lingyi-doc/ai-ui`。
 *
 * 依赖铁律：
 * - Commercial（本包）→ 可依赖 → OSS（editor / editor-*）
 * - OSS（@lingyi-doc/editor）→ 禁止依赖 → 本包或 ai-ui
 *
 * SaaS / 私有化产品壳（web）应依赖本包；开源发行与 admin 模板预览可继续只依赖 `@lingyi-doc/editor`。
 */
export * from '@lingyi-doc/editor';
export * from '@lingyi-doc/ai-ui';
