import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Loader2,
  MessageSquare,
  MessagesSquare,
  Send,
} from "lucide-react";
import { useAtlas } from "../store";
import type { AtlasFocusRequest } from "../navigation";
import { Avatar, Card, SectionLabel, cn } from "../ui";
import { relativeTime, type Comment, type Item } from "../model";

export function CommentsView({
  embedded = false,
  focus,
  onTargetChange,
}: {
  embedded?: boolean;
  focus?: AtlasFocusRequest;
  onTargetChange?: (itemId: string) => void;
} = {}) {
  const {
    data,
    addComment,
    currentUser,
    commentsLoading,
    commentsError,
    reloadComments,
  } = useAtlas();
  const { comments, items } = data;

  const [text, setText] = useState("");
  const [target, setTarget] = useState<string>(focus?.itemId ?? "");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");

  const itemById = useMemo(
    () => new Map<string, Item>(items.map((item) => [item.fabricId, item])),
    [items],
  );

  const feed = useMemo(
    () =>
      [...comments].sort(
        (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      ),
    [comments],
  );

  const selectedTarget = target ? itemById.get(target) : undefined;

  useEffect(() => {
    onTargetChange?.(target);
  }, [onTargetChange, target]);

  useEffect(() => {
    if (focus?.commentId) {
      window.requestAnimationFrame(() =>
        document
          .getElementById(`comment-${focus.commentId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
    }
  }, [focus?.commentId]);

  const post = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!text.trim() || posting) return;

    setPosting(true);
    setPostError("");
    try {
      await addComment(text, target || undefined);
      setText("");
    } catch (error) {
      setPostError(error instanceof Error ? error.message : "The note could not be posted.");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col",
        embedded ? "gap-l" : "atlas-content-frame gap-xl p-xl lg:p-xxl",
      )}
    >
      {!embedded && <header className="border-l border-primary pl-l">
        <SectionLabel>Collaboration / workspace notes</SectionLabel>
        <div className="mt-s flex flex-col gap-s lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-heading text-600 leading-600 font-bold">Comments</h1>
            <p className="mt-xs text-300 leading-300 text-muted-foreground">
              Persistent operational notes for the workspace and the items your team
              governs.
            </p>
          </div>
          <div className="flex items-center gap-s text-200 leading-200 text-muted-foreground">
            <MessagesSquare className="icon-size-200" aria-hidden="true" />
            {comments.length} team note{comments.length === 1 ? "" : "s"}
          </div>
        </div>
      </header>}

      <div className="grid items-start gap-l lg:grid-cols-3">
        <aside className="lg:sticky lg:top-l" aria-label="Compose a comment">
          <Card className="overflow-hidden border-t border-t-primary/50">
            <div className="border-b border-border p-l">
              <div className="flex items-center gap-m">
                <Avatar name={currentUser.name} />
                <div className="min-w-0">
                  <SectionLabel>New note</SectionLabel>
                  <p className="mt-xs truncate text-300 leading-300 font-semibold">
                    {currentUser.name}
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={(event) => void post(event)} className="p-l">
              <label htmlFor="comment-body" className="text-300 font-semibold">
                Message
              </label>
              <textarea
                id="comment-body"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Add context, a decision, or a follow-up for the team…"
                rows={5}
                disabled={posting}
                aria-describedby="comment-help comment-status"
                className="mt-s w-full resize-y rounded-xl border border-input bg-background px-m py-m text-300 leading-300 text-foreground placeholder:text-muted-foreground disabled:opacity-60"
              />
              <div
                id="comment-help"
                className="mt-xs flex items-center justify-between gap-s text-200 leading-200 text-muted-foreground"
              >
                <span>Stored in the Fabric-backed database.</span>
                <span className="font-numeric tabular-nums">{text.length}</span>
              </div>

              <label htmlFor="comment-target" className="mt-l block text-300 font-semibold">
                Target
              </label>
              <select
                id="comment-target"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                disabled={posting}
                className="mt-s w-full rounded-lg border border-input bg-background px-m py-s text-300 leading-300 text-foreground disabled:opacity-60"
              >
                <option value="">Whole workspace</option>
                {items.map((item) => (
                  <option key={item.fabricId} value={item.fabricId}>
                    {item.displayName}
                  </option>
                ))}
              </select>

              <div className="mt-s rounded-lg bg-muted px-m py-s text-200 leading-200 text-muted-foreground">
                {selectedTarget
                  ? `This note will appear on ${selectedTarget.displayName}.`
                  : "This note applies to the entire workspace."}
              </div>

              {postError && (
                <div
                  role="alert"
                  className="mt-m flex items-start gap-s rounded-lg border border-status-failing/30 bg-status-failing/10 px-m py-s text-200 leading-200 text-status-failing"
                >
                  <AlertCircle className="icon-size-200 shrink-0" aria-hidden="true" />
                  {postError}
                </div>
              )}

              <button
                type="submit"
                disabled={posting || !text.trim()}
                className="mt-l inline-flex w-full items-center justify-center gap-s rounded-lg bg-primary px-l py-m text-300 font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
              >
                {posting ? (
                  <Loader2 className="icon-size-200 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="icon-size-200" aria-hidden="true" />
                )}
                {posting ? "Posting note…" : "Post note"}
              </button>
              <span id="comment-status" className="sr-only" aria-live="polite">
                {posting ? "Posting note" : postError ? postError : ""}
              </span>
            </form>
          </Card>
        </aside>

        <section aria-labelledby="comment-feed-title" className="min-w-0 lg:col-span-2">
          <div className="mb-m flex items-end justify-between gap-m">
            <div>
              <h2 id="comment-feed-title" className="text-400 leading-400 font-semibold">
                Team feed
              </h2>
              <p className="mt-xs text-200 leading-200 text-muted-foreground">
                Most recent notes appear first
              </p>
            </div>
          </div>

          {commentsError && (
            <div
              role="alert"
              className="mb-m flex items-center justify-between gap-m rounded-lg border border-status-failing/30 bg-status-failing/10 px-m py-s text-200 text-status-failing"
            >
              <span>Team notes could not be loaded. The catalog remains available.</span>
              <button
                type="button"
                onClick={() => void reloadComments()}
                className="shrink-0 rounded-md border border-current px-m py-s font-semibold"
              >
                Retry notes
              </button>
            </div>
          )}

          {commentsLoading ? (
            <Card className="border-dashed p-xl text-200 text-muted-foreground">
              <span
                role="status"
                className="flex items-center justify-center gap-s"
              >
                <Loader2 className="icon-size-200 animate-spin" aria-hidden="true" />
                Loading team notes
              </span>
            </Card>
          ) : feed.length === 0 ? (
            <Card className="flex flex-col items-center border-dashed px-xl py-xxxl text-center">
              <span className="flex items-center justify-center rounded-full bg-muted p-l text-muted-foreground">
                <MessageSquare className="icon-size-500" aria-hidden="true" />
              </span>
              <h3 className="mt-l text-400 leading-400 font-semibold">
                Start the workspace record
              </h3>
              <p className="mt-s text-300 leading-300 text-muted-foreground">
                Add the first note to document a decision, flag an issue or leave
                context for the next person.
              </p>
            </Card>
          ) : (
            <div className="flex flex-col gap-m">
              {feed.map((comment: Comment) => {
                const item = comment.itemFabricId
                  ? itemById.get(comment.itemFabricId)
                  : undefined;
                return (
                  <article key={comment.id} id={`comment-${comment.id}`}>
                    <Card
                      className={cn(
                        "overflow-hidden border-l border-l-primary/40",
                        focus?.commentId === comment.id &&
                          "ring-2 ring-primary/35",
                      )}
                    >
                      <div className="p-l">
                        <div className="flex items-start gap-m">
                          <Avatar name={comment.authorName} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-xs sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <h3 className="truncate text-300 leading-300 font-semibold">
                                  {comment.authorName}
                                </h3>
                                {comment.authorEmail &&
                                  comment.authorEmail.trim().toLocaleLowerCase() !==
                                    comment.authorName
                                      .trim()
                                      .toLocaleLowerCase() && (
                                    <div className="truncate text-200 leading-200 text-muted-foreground">
                                      Authenticated as {comment.authorEmail}
                                    </div>
                                  )}
                                <div className="mt-xs flex flex-wrap items-center gap-s text-200 leading-200 text-muted-foreground">
                                  <span className="inline-flex items-center gap-xs rounded-full bg-muted px-s py-xs font-semibold">
                                    <MessageSquare
                                      className="icon-size-100"
                                      aria-hidden="true"
                                    />
                                    {item ? item.displayName : "Whole workspace"}
                                  </span>
                                  {item && (
                                    <span>{item.itemType.replace(/([a-z])([A-Z])/g, "$1 $2")}</span>
                                  )}
                                </div>
                              </div>
                              <time
                                dateTime={comment.createdAt}
                                title={new Intl.DateTimeFormat(undefined, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                }).format(new Date(comment.createdAt))}
                                className="shrink-0 text-200 leading-200 text-muted-foreground"
                              >
                                {relativeTime(comment.createdAt)}
                              </time>
                            </div>
                            <p className="mt-m whitespace-pre-wrap break-words text-300 leading-400 text-foreground">
                              {comment.body}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
