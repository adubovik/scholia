import { pgTable, text, timestamp, uuid, boolean, integer, unique, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: text("id").primaryKey(),            // Clerk user id
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  // App access: 'pending' until an invite is redeemed, then 'active'. Admin
  // (Clerk publicMetadata.role) bypasses this — see lib/auth/access.ts.
  status: text("status").notNull().default("pending"), // 'pending' | 'active'
  // Delegation seam: admin can grant a member the right to create invites.
  // Not surfaced in UI yet; canCreateInvites() already honors it.
  canInvite: boolean("can_invite").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),  // URL-safe random, single-use
  createdBy: text("created_by").notNull().references(() => users.id),
  email: text("email"),                      // optional recipient label
  status: text("status").notNull().default("pending"), // 'pending' | 'accepted' | 'revoked'
  redeemedBy: text("redeemed_by").references(() => users.id),
  redeemedAt: timestamp("redeemed_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  author: text("author"), // the work's author (required at create time, nullable for legacy rows)
  clonedFrom: uuid("cloned_from"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  language: text("language"),
  label: text("label"),
  url: text("url"), // origin URL when imported from the web; null for paste/file
  isPrimary: boolean("is_primary").notNull().default(false),
  position: integer("position").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const paragraphs = pgTable("paragraphs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  charStart: integer("char_start").notNull(),
  charEnd: integer("char_end").notNull(),
});

export const nodes = pgTable(
  "nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"), // self-ref, app-enforced (matches documents.clonedFrom pattern)
    position: integer("position").notNull(),
    label: text("label"), // the node's OWN id segment ("XI", "Definitions", "3"); null ⇒ positional at render
    alias: text("alias"), // short token ancestors lend to a descendant's path ("Def"); null ⇒ same as label
    title: text("title"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({ byParent: index("nodes_doc_parent_pos").on(t.documentId, t.parentId, t.position) }),
);

export const nodeSourceRanges = pgTable(
  "node_source_ranges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nodeId: uuid("node_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
    startParagraphId: uuid("start_paragraph_id").notNull().references(() => paragraphs.id, { onDelete: "cascade" }),
    startOffset: integer("start_offset").notNull(),
    endParagraphId: uuid("end_paragraph_id").notNull().references(() => paragraphs.id, { onDelete: "cascade" }),
    endOffset: integer("end_offset").notNull(),
  },
  (t) => ({ nodeSourceUnique: unique("node_source_ranges_node_source").on(t.nodeId, t.sourceId) }),
);

export const inlineAnnotations = pgTable(
  "inline_annotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id").notNull().references(() => sources.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => users.id),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
    color: text("color").notNull(), // app-checked enum: yellow|pink|green|blue
    note: text("note"),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    bySource: index("inline_annotations_source").on(t.sourceId),
    byAuthor: index("inline_annotations_doc_author").on(t.documentId, t.authorId),
    tagsGin: index("inline_annotations_tags_gin").using("gin", t.tags),
  }),
);

/**
 * A named alternative rendition of the document's nodes — a summary pass, a
 * translation, another edition. Rows in `node_annotations` carrying this layer's id
 * are that layer's text for a node; `layer_id NULL` is the ordinary node note.
 */
export const layers = pgTable(
  "layers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(), // app-checked enum: see LAYER_COLORS
    position: integer("position").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({ byDoc: index("layers_document_pos").on(t.documentId, t.position) }),
);

export const nodeAnnotations = pgTable(
  "node_annotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    nodeId: uuid("node_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull().references(() => users.id),
    // null = the ordinary node note; set = this row is that layer's text for the node.
    layerId: uuid("layer_id").references(() => layers.id, { onDelete: "cascade" }),
    note: text("note").notNull(),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    // NULLS NOT DISTINCT: layer_id is null for the ordinary note, and Postgres would
    // otherwise treat every such row as unique — letting one node collect many notes
    // and breaking upsertNodeAnnotation's ON CONFLICT.
    nodeAuthorUnique: unique("node_annotations_node_author_layer")
      .on(t.nodeId, t.authorId, t.layerId)
      .nullsNotDistinct(),
    byAuthor: index("node_annotations_doc_author").on(t.documentId, t.authorId),
    tagsGin: index("node_annotations_tags_gin").using("gin", t.tags),
  }),
);
