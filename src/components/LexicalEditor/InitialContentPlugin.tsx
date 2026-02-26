'use client';

import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $generateNodesFromDOM } from '@lexical/html';
import { $getRoot, $insertNodes } from 'lexical';

interface InitialContentPluginProps {
    html: string;
}

export default function InitialContentPlugin({ html }: InitialContentPluginProps) {
    const [editor] = useLexicalComposerContext();

    useEffect(() => {
        if (!html) return;
        editor.update(() => {
            const root = $getRoot();
            // Only set initial content if editor is empty
            if (root.getTextContent().trim().length > 0) return;

            const parser = new DOMParser();
            const dom = parser.parseFromString(html, 'text/html');
            const nodes = $generateNodesFromDOM(editor, dom);
            root.clear();
            $insertNodes(nodes);
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor]);

    return null;
}
