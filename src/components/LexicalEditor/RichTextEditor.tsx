'use client';

import { useCallback } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { HeadingNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { LinkNode } from '@lexical/link';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import theme from './theme';
import ToolbarPlugin from './ToolbarPlugin';
import OnChangePlugin from './OnChangePlugin';
import InitialContentPlugin from './InitialContentPlugin';
import styles from './lexicalEditor.module.css';

interface RichTextEditorProps {
    /** Initial HTML content. Only used on mount. */
    initialHtml?: string;
    /** Called with the HTML string on every content change */
    onChange: (html: string) => void;
    /** Minimum height for the content area */
    minHeight?: number;
    /** Placeholder text */
    placeholder?: string;
    /** Show toolbar? Default: true */
    showToolbar?: boolean;
    /** Disable editing */
    readOnly?: boolean;
}

export default function RichTextEditor({
    initialHtml = '',
    onChange,
    minHeight = 150,
    placeholder = 'Skriv innhold her...',
    showToolbar = true,
    readOnly = false,
}: RichTextEditorProps) {
    const onError = useCallback((_error: Error) => {
        // Lexical editor errors logged silently in production
    }, []);

    const initialConfig = {
        namespace: 'EgenAkademiEditor',
        theme,
        onError,
        nodes: [HeadingNode, ListNode, ListItemNode, LinkNode],
        editable: !readOnly,
    };

    return (
        <LexicalComposer initialConfig={initialConfig}>
            <div className={`${styles.editorContainer} ${readOnly ? styles.editorReadOnly : ''}`}>
                {showToolbar && !readOnly && <ToolbarPlugin />}
                <div className={styles.editorInner} style={{ minHeight }}>
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable className={styles.editorContent} />
                        }
                        placeholder={
                            <div className={styles.editorPlaceholder}>{placeholder}</div>
                        }
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <HistoryPlugin />
                    <ListPlugin />
                    <OnChangePlugin onChange={onChange} />
                    {initialHtml && <InitialContentPlugin html={initialHtml} />}
                </div>
            </div>
        </LexicalComposer>
    );
}
