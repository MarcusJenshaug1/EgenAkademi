import type { EditorThemeClasses } from 'lexical';

const theme: EditorThemeClasses = {
    paragraph: 'lexical-paragraph',
    heading: {
        h1: 'lexical-h1',
        h2: 'lexical-h2',
        h3: 'lexical-h3',
    },
    text: {
        bold: 'lexical-bold',
        italic: 'lexical-italic',
        underline: 'lexical-underline',
        strikethrough: 'lexical-strikethrough',
        code: 'lexical-code-inline',
    },
    list: {
        ul: 'lexical-ul',
        ol: 'lexical-ol',
        listitem: 'lexical-li',
        nested: {
            listitem: 'lexical-li-nested',
        },
    },
    link: 'lexical-link',
    code: 'lexical-code-block',
};

export default theme;
