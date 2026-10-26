import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** 用户 ↔ 第三方账号绑定（一个用户可同时绑定钉钉 + 飞书） */
@Entity('user_oauth_bindings')
@Index('idx_uob_user', ['userId'])
@Index('idx_uob_union', ['provider', 'providerAppId', 'providerUnionId'])
export class UserOauthBindingEntity {
  @PrimaryColumn({ type: 'char', length: 36 })
  id!: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  /** dingtalk | feishu */
  @Column({ type: 'varchar', length: 20 })
  provider!: string;

  /** 钉钉 AppKey / 飞书 AppId */
  @Column({ name: 'provider_app_id', type: 'varchar', length: 64 })
  providerAppId!: string;

  /** 钉钉 openId / 飞书 open_id（应用级唯一） */
  @Column({ name: 'provider_user_id', type: 'varchar', length: 128 })
  providerUserId!: string;

  /** 钉钉 unionId / 飞书 union_id（企业级，辅助去重） */
  @Column({ name: 'provider_union_id', type: 'varchar', length: 128, nullable: true })
  providerUnionId!: string | null;

  /** 首次授权时拉取的用户画像快照 */
  @Column({ name: 'raw_profile', type: 'json', nullable: true })
  rawProfile!: Record<string, unknown> | null;

  @Column({ name: 'bound_at', type: 'timestamp' })
  boundAt!: Date;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}
