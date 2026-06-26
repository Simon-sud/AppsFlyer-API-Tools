import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelLeftClose, Trash2 } from 'lucide-react';
import { BsHexagonHalf } from 'react-icons/bs';
import type { Conversation } from '../services/api';
import { GochatScrollArea } from './GochatScrollArea';
import { GochatHistoryCount } from './GochatHistoryCount';
import { Spinner } from './ui/spinner';
import { cn } from '../lib/utils';
import {
  formatConversationDisplayTitle,
  formatConversationPreview,
  formatGochatDateTime,
} from '../utils/gochatPersistence';

const HISTORY_ITEM_EXIT_MS = 300;
const HISTORY_ITEM_ENTER_MS = 380;

export interface GochatHistoryPanelProps {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  loading: boolean;
  messagesLoading: boolean;
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void | Promise<boolean>;
  expanded?: boolean;
  className?: string;
}

type HistoryListItemProps = {
  conversation: Conversation;
  isActive: boolean;
  isEntering: boolean;
  isExiting: boolean;
  isSelecting: boolean;
  messagesLoading: boolean;
  showDeleteConfirm: boolean;
  deletePopoverRef: React.RefObject<HTMLDivElement | null>;
  itemRef: React.RefObject<HTMLLIElement | null> | undefined;
  onSelect: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
};

const HistoryListItem: React.FC<HistoryListItemProps> = ({
  conversation,
  isActive,
  isEntering,
  isExiting,
  isSelecting,
  messagesLoading,
  showDeleteConfirm,
  deletePopoverRef,
  itemRef,
  onSelect,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}) => {
  const preview = formatConversationPreview(conversation);

  return (
    <li
      ref={itemRef}
      className={cn(
        'gochat-history-list-item',
        isEntering && 'is-entering',
        isExiting && 'is-exiting',
        isSelecting && 'is-selecting'
      )}
      style={
        isExiting
          ? ({ '--gochat-history-exit-ms': `${HISTORY_ITEM_EXIT_MS}ms` } as React.CSSProperties)
          : undefined
      }
    >
      <div
        className={cn(
          'gochat-history-item',
          isActive && 'is-active',
          messagesLoading && isActive && 'is-loading',
          showDeleteConfirm && 'is-delete-open'
        )}
      >
        <button
          type="button"
          disabled={messagesLoading && isActive}
          onClick={() => onSelect(conversation.id)}
          className="gochat-history-item-button"
        >
          <div className="gochat-history-item-top">
            <span className="gochat-history-item-title">
              {formatConversationDisplayTitle(conversation)}
            </span>
            <span className="gochat-history-item-time">
              {formatGochatDateTime(conversation.updated_at || conversation.created_at)}
            </span>
          </div>
          {preview ? <span className="gochat-history-item-preview">{preview}</span> : null}
        </button>
        <div
          className="gochat-history-item-actions"
          ref={showDeleteConfirm ? deletePopoverRef : undefined}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRequestDelete(conversation.id);
            }}
            className="sheet-header-button gochat-history-delete"
            title="Delete conversation"
            aria-label="Delete conversation"
          >
            <Trash2 />
          </button>
          {showDeleteConfirm ? (
            <div
              className="gochat-history-delete-popover is-visible"
              role="dialog"
              aria-label="Confirm delete"
            >
              <p className="gochat-history-delete-popover-text">Delete this conversation?</p>
              <div className="gochat-history-delete-popover-actions">
                <button
                  type="button"
                  className="gochat-history-delete-popover-btn gochat-history-delete-popover-btn--cancel"
                  onClick={onCancelDelete}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="gochat-history-delete-popover-btn gochat-history-delete-popover-btn--confirm"
                  disabled={isExiting}
                  onClick={() => onConfirmDelete(conversation.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
};

export const GochatHistoryPanel: React.FC<GochatHistoryPanelProps> = ({
  open,
  onClose,
  conversations,
  loading,
  messagesLoading,
  activeConversationId,
  onSelect,
  onDelete,
  expanded = false,
  className,
}) => {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set());
  const [exitingConversations, setExitingConversations] = useState<Conversation[]>([]);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const deletePopoverRef = useRef<HTMLDivElement | null>(null);
  const activeItemRef = useRef<HTMLLIElement | null>(null);
  const prevConversationIdsRef = useRef<Set<string>>(new Set());
  const prevActiveIdRef = useRef<string | null>(null);
  const listFirstPaintRef = useRef(true);
  const selectingTimerRef = useRef<number | null>(null);
  const deletingIdsRef = useRef<Set<string>>(new Set());
  const exitCleanupTimersRef = useRef<Map<string, number>>(new Map());

  /** Keep items during exit animation; optimistic deletes live in exitingConversations */
  const displayConversations = useMemo(() => {
    const exitingById = new Map(exitingConversations.map((item) => [item.id, item]));
    if (exitingById.size === 0) return conversations;

    const merged: Conversation[] = [];
    const placed = new Set<string>();

    for (const conv of conversations) {
      const exiting = exitingById.get(conv.id);
      merged.push(exiting ?? conv);
      placed.add(conv.id);
    }

    for (const conv of exitingConversations) {
      if (!placed.has(conv.id)) {
        merged.push(conv);
      }
    }

    return merged;
  }, [conversations, exitingConversations]);

  const clearExitState = useCallback((conversationId: string) => {
    deletingIdsRef.current.delete(conversationId);
    const timer = exitCleanupTimersRef.current.get(conversationId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      exitCleanupTimersRef.current.delete(conversationId);
    }
    setExitingConversations((prev) => prev.filter((item) => item.id !== conversationId));
  }, []);

  useEffect(() => {
    const currentIds = new Set(conversations.map((item) => item.id));
    const prevIds = prevConversationIdsRef.current;
    const exitingIds = new Set(exitingConversations.map((item) => item.id));

    if (!listFirstPaintRef.current) {
      const added = conversations.filter(
        (item) => !prevIds.has(item.id) && !exitingIds.has(item.id)
      );
      if (added.length > 0) {
        setEnteringIds((prev) => {
          const next = new Set(prev);
          added.forEach((item) => next.add(item.id));
          return next;
        });
        const timer = window.setTimeout(() => {
          setEnteringIds((prev) => {
            const next = new Set(prev);
            added.forEach((item) => next.delete(item.id));
            return next;
          });
        }, HISTORY_ITEM_ENTER_MS);
        prevConversationIdsRef.current = currentIds;
        return () => window.clearTimeout(timer);
      }
    } else if (conversations.length > 0) {
      listFirstPaintRef.current = false;
    }

    prevConversationIdsRef.current = currentIds;
  }, [conversations, exitingConversations]);

  useEffect(() => {
    if (!deleteConfirmId) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!deletePopoverRef.current) return;
      if (!deletePopoverRef.current.contains(event.target as Node)) {
        setDeleteConfirmId(null);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [deleteConfirmId]);

  useEffect(() => {
    if (!activeConversationId || activeConversationId === prevActiveIdRef.current) return;
    prevActiveIdRef.current = activeConversationId;
    const frame = window.requestAnimationFrame(() => {
      activeItemRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeConversationId]);

  useEffect(() => {
    const exitTimers = exitCleanupTimersRef.current;
    return () => {
      const selectingTimer = selectingTimerRef.current;
      if (selectingTimer !== null) {
        window.clearTimeout(selectingTimer);
      }
      exitTimers.forEach((timer) => window.clearTimeout(timer));
      exitTimers.clear();
    };
  }, []);

  const handleSelect = useCallback(
    (conversationId: string) => {
      if (conversationId === activeConversationId || messagesLoading) return;
      setSelectingId(conversationId);
      if (selectingTimerRef.current !== null) {
        window.clearTimeout(selectingTimerRef.current);
      }
      selectingTimerRef.current = window.setTimeout(() => {
        setSelectingId(null);
        selectingTimerRef.current = null;
      }, 260);
      onSelect(conversationId);
    },
    [activeConversationId, messagesLoading, onSelect]
  );

  const handleConfirmDelete = useCallback(
    (conversationId: string) => {
      if (deletingIdsRef.current.has(conversationId)) return;

      const target =
        conversations.find((item) => item.id === conversationId) ??
        exitingConversations.find((item) => item.id === conversationId);
      if (!target) return;

      deletingIdsRef.current.add(conversationId);
      setDeleteConfirmId(null);
      setExitingConversations((prev) =>
        prev.some((item) => item.id === conversationId) ? prev : [...prev, target]
      );

      const cleanupTimer = window.setTimeout(() => {
        clearExitState(conversationId);
      }, HISTORY_ITEM_EXIT_MS);
      exitCleanupTimersRef.current.set(conversationId, cleanupTimer);

      void Promise.resolve(onDelete(conversationId)).then((success) => {
        if (success === false) {
          clearExitState(conversationId);
        }
      });
    },
    [conversations, exitingConversations, onDelete, clearExitState]
  );

  const showEmpty = !loading && displayConversations.length === 0;

  return (
    <aside
      className={cn(
        'gochat-history-panel',
        expanded && 'gochat-history-panel--expanded',
        !open && 'is-collapsed',
        className
      )}
      aria-label="Conversation history"
      aria-hidden={!open}
    >
      <div className="gochat-history-header">
        <div className="gochat-history-header-text">
          <span className="gochat-history-title">Conversations History</span>
          {conversations.length > 0 ? (
            <span
              key={conversations.length}
              className="gochat-history-count-wrap"
              aria-label={`${conversations.length} conversations`}
            >
              <GochatHistoryCount count={conversations.length} />
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="sheet-header-button gochat-history-collapse"
          title="Collapse history"
          aria-label="Collapse history"
        >
          <PanelLeftClose />
        </button>
      </div>

      <GochatScrollArea
        className="gochat-history-scroll"
        contentClassName="gochat-history-scroll-inner"
        maxHeight="100%"
        direction="y"
      >
        {loading && conversations.length === 0 ? (
          <div className="gochat-history-loading" role="status">
            <Spinner className="h-4 w-4" />
            <span>Loading conversations…</span>
          </div>
        ) : showEmpty ? (
          <div className="gochat-history-empty is-visible">
            <div className="gochat-history-empty-icon-wrap">
              <BsHexagonHalf className="gochat-history-empty-icon" aria-hidden />
            </div>
            <p className="gochat-history-empty-title">No conversations yet</p>
            <p className="gochat-history-empty-hint">
              Start chatting and your history will be saved here.
            </p>
          </div>
        ) : (
          <ul className="gochat-history-list">
            {displayConversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId;
              const isExiting = exitingConversations.some((item) => item.id === conversation.id);

              return (
                <HistoryListItem
                  key={conversation.id}
                  conversation={conversation}
                  isActive={isActive}
                  isEntering={enteringIds.has(conversation.id)}
                  isExiting={isExiting}
                  isSelecting={selectingId === conversation.id}
                  messagesLoading={messagesLoading}
                  showDeleteConfirm={deleteConfirmId === conversation.id}
                  deletePopoverRef={deletePopoverRef}
                  itemRef={isActive ? activeItemRef : undefined}
                  onSelect={handleSelect}
                  onRequestDelete={setDeleteConfirmId}
                  onCancelDelete={() => setDeleteConfirmId(null)}
                  onConfirmDelete={handleConfirmDelete}
                />
              );
            })}
          </ul>
        )}
      </GochatScrollArea>
    </aside>
  );
};
