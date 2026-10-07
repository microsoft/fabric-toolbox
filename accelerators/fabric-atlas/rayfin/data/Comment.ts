import { entity, authenticated, uuid, text, date } from '@microsoft/rayfin-core';

/**
 * A team comment thread entry, attached either to the whole workspace
 * (`itemFabricId` empty) or to a specific item. Stored in the Fabric-backed
 * database so notes persist and are shared across the team.
 */
@entity()
@authenticated('read')
@authenticated('create', {
  policy: (claims, item) =>
    claims.email
      .eq(item.authorEmail)
      .and(claims.sub.eq(item.authorId)),
})
export class Comment {
  @uuid() id!: string;
  @uuid() workspace_id!: string;
  @text({ max: 100, optional: true }) itemFabricId?: string;
  @text({ max: 150 }) authorId!: string;
  @text({ max: 160 }) authorName!: string;
  @text({ max: 160, optional: true }) authorEmail?: string;
  @text({ max: 2000 }) body!: string;
  @date() createdAt!: Date;
}
