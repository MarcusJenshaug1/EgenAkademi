'use client';

import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $generateHtmlFromNodes } from '@lexical/html';

interface OnChangePluginProps {
    onChange: (html: string) => void;
}

export default function OnChangePlugin({ onChange }: OnChangePluginProps) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
            // Only fire on actual content changes, not on initial load
            if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;

            editorState.read(() => {
                const html = $generateHtmlFromNodes(editor);
                onChange(html);
            });
        });
    }, [editor, onChange]);

    return null;
}
