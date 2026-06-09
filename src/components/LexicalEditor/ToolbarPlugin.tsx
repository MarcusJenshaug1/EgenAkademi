'use client';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
    $getSelection,
    $isRangeSelection,
    FORMAT_TEXT_COMMAND,
    UNDO_COMMAND,
    REDO_COMMAND,
    COMMAND_PRIORITY_CRITICAL,
    $createParagraphNode,
    KEY_MODIFIER_COMMAND,
} from 'lexical';
import {
    $setBlocksType,
} from '@lexical/selection';
import {
    INSERT_ORDERED_LIST_COMMAND,
    INSERT_UNORDERED_LIST_COMMAND,
    REMOVE_LIST_COMMAND,
    $isListNode,
    ListNode,
} from '@lexical/list';
import { $createHeadingNode, $isHeadingNode } from '@lexical/rich-text';
import {
    $getNearestNodeOfType,
} from '@lexical/utils';
import { useCallback, useEffect, useState } from 'react';
import {
    Bold, Italic, Underline, Strikethrough,
    List, ListOrdered, Heading2, Heading3,
    Undo2, Redo2, Pilcrow,
} from 'lucide-react';
import styles from './lexicalEditor.module.css';

type HeadingTag = 'h2' | 'h3';

export default function ToolbarPlugin() {
    const [editor] = useLexicalComposerContext();
    const [isBold, setIsBold] = useState(false);
    const [isItalic, setIsItalic] = useState(false);
    const [isUnderline, setIsUnderline] = useState(false);
    const [isStrikethrough, setIsStrikethrough] = useState(false);
    const [blockType, setBlockType] = useState<string>('paragraph');

    const updateToolbar = useCallback(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
            setIsBold(selection.hasFormat('bold'));
            setIsItalic(selection.hasFormat('italic'));
            setIsUnderline(selection.hasFormat('underline'));
            setIsStrikethrough(selection.hasFormat('strikethrough'));

            const anchorNode = selection.anchor.getNode();
            const element = anchorNode.getKey() === 'root'
                ? anchorNode
                : anchorNode.getTopLevelElementOrThrow();

            if ($isListNode(element)) {
                const parentList = $getNearestNodeOfType(anchorNode, ListNode);
                setBlockType(parentList ? parentList.getListType() : element.getListType());
            } else if ($isHeadingNode(element)) {
                setBlockType(element.getTag());
            } else {
                setBlockType(element.getType());
            }
        }
    }, []);

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => updateToolbar());
        });
    }, [editor, updateToolbar]);

    // Keyboard shortcuts: Ctrl+Z undo, Ctrl+Y redo
    useEffect(() => {
        return editor.registerCommand(
            KEY_MODIFIER_COMMAND,
            (payload) => {
                const event = payload as KeyboardEvent;
                if (event.ctrlKey || event.metaKey) {
                    if (event.key === 'z') {
                        event.preventDefault();
                        editor.dispatchCommand(UNDO_COMMAND, undefined);
                        return true;
                    }
                    if (event.key === 'y') {
                        event.preventDefault();
                        editor.dispatchCommand(REDO_COMMAND, undefined);
                        return true;
                    }
                }
                return false;
            },
            COMMAND_PRIORITY_CRITICAL,
        );
    }, [editor]);

    const formatHeading = (tag: HeadingTag) => {
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                if (blockType === tag) {
                    $setBlocksType(selection, () => $createParagraphNode());
                } else {
                    $setBlocksType(selection, () => $createHeadingNode(tag));
                }
            }
        });
    };

    const formatList = (type: 'bullet' | 'number') => {
        if (blockType === type) {
            editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined);
        } else if (type === 'bullet') {
            editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined);
        } else {
            editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined);
        }
    };

    const formatParagraph = () => {
        editor.update(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
                $setBlocksType(selection, () => $createParagraphNode());
            }
        });
    };

    return (
        <div className={styles.toolbar}>
            <button
                type="button"
                className={`${styles.toolbarBtn} ${blockType === 'paragraph' ? styles.toolbarBtnActive : ''}`}
                onClick={formatParagraph}
                title="Avsnitt"
                aria-label="Avsnitt"
            >
                <Pilcrow size={15} />
            </button>
            <button
                type="button"
                className={`${styles.toolbarBtn} ${blockType === 'h2' ? styles.toolbarBtnActive : ''}`}
                onClick={() => formatHeading('h2')}
                title="Overskrift 2"
                aria-label="Overskrift 2"
            >
                <Heading2 size={15} />
            </button>
            <button
                type="button"
                className={`${styles.toolbarBtn} ${blockType === 'h3' ? styles.toolbarBtnActive : ''}`}
                onClick={() => formatHeading('h3')}
                title="Overskrift 3"
                aria-label="Overskrift 3"
            >
                <Heading3 size={15} />
            </button>

            <span className={styles.toolbarDivider} />

            <button
                type="button"
                className={`${styles.toolbarBtn} ${isBold ? styles.toolbarBtnActive : ''}`}
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
                title="Fet (Ctrl+B)"
                aria-label="Fet"
            >
                <Bold size={15} />
            </button>
            <button
                type="button"
                className={`${styles.toolbarBtn} ${isItalic ? styles.toolbarBtnActive : ''}`}
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
                title="Kursiv (Ctrl+I)"
                aria-label="Kursiv"
            >
                <Italic size={15} />
            </button>
            <button
                type="button"
                className={`${styles.toolbarBtn} ${isUnderline ? styles.toolbarBtnActive : ''}`}
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
                title="Understreking (Ctrl+U)"
                aria-label="Understreking"
            >
                <Underline size={15} />
            </button>
            <button
                type="button"
                className={`${styles.toolbarBtn} ${isStrikethrough ? styles.toolbarBtnActive : ''}`}
                onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough')}
                title="Gjennomstreking"
                aria-label="Gjennomstreking"
            >
                <Strikethrough size={15} />
            </button>

            <span className={styles.toolbarDivider} />

            <button
                type="button"
                className={`${styles.toolbarBtn} ${blockType === 'bullet' ? styles.toolbarBtnActive : ''}`}
                onClick={() => formatList('bullet')}
                title="Punktliste"
                aria-label="Punktliste"
            >
                <List size={15} />
            </button>
            <button
                type="button"
                className={`${styles.toolbarBtn} ${blockType === 'number' ? styles.toolbarBtnActive : ''}`}
                onClick={() => formatList('number')}
                title="Nummerert liste"
                aria-label="Nummerert liste"
            >
                <ListOrdered size={15} />
            </button>

            <span className={styles.toolbarDivider} />

            <button
                type="button"
                className={styles.toolbarBtn}
                onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
                title="Angre (Ctrl+Z)"
                aria-label="Angre"
            >
                <Undo2 size={15} />
            </button>
            <button
                type="button"
                className={styles.toolbarBtn}
                onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
                title="Gjør om (Ctrl+Y)"
                aria-label="Gjør om"
            >
                <Redo2 size={15} />
            </button>
        </div>
    );
}
