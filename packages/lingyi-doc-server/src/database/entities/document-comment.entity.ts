import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('doc_comment_threads')
export class DocCommentThreadEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ name: 'doc_id', type: 'varchar', length: 64 })
  docId!: string;

  @Column({ name: 'block_id', type: 'varchar', length: 64 })
  blockId!: string;

  @Column({ name: 'anchor_start', type: 'int' })
  anchorStart!: number;

  @Column({ name: 'anchor_end', type: 'int' })
  anchorEnd!: number;

  @Column({ type: 'varchar', length: 500, default: '' })
  quote!: string;

  @Column({ name: 'anchor_meta', type: 'text', nullable: true })
  anchorMeta!: string | null;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  resolved!: number;

  @Column({ name: 'created_by', type: 'char', length: 36 })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;

  @OneToMany(() => DocCommentReplyEntity, reply => reply.thread)
  replies!: DocCommentReplyEntity[];
}

@Entity('doc_comment_replies')
export class DocCommentReplyEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ name: 'thread_id', type: 'varchar', length: 64 })
  threadId!: string;

  @Column({ name: 'author_id', type: 'char', length: 36 })
  authorId!: string;

  @Column({ name: 'author_name', type: 'varchar', length: 100 })
  authorName!: string;

  @Column({ name: 'author_avatar', type: 'varchar', length: 500, nullable: true })
  authorAvatar!: string | null;

  @Column({ type: 'text' })
  text!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', nullable: true })
  updatedAt!: Date | null;

  @ManyToOne(() => DocCommentThreadEntity, thread => thread.replies, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'thread_id' })
  thread!: DocCommentThreadEntity;
}

@Entity('doc_comment_reply_likes')
export class DocCommentReplyLikeEntity {
  @PrimaryColumn({ name: 'reply_id', type: 'varchar', length: 64 })
  replyId!: string;

  @PrimaryColumn({ name: 'user_id', type: 'char', length: 36 })
  userId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @ManyToOne(() => DocCommentReplyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reply_id' })
  reply!: DocCommentReplyEntity;
}
