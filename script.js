// ===== Utilitaires DOM / sélection =====

function focusEditor() {
    document.getElementById('editor').focus();
}

function getSelectionSafe() {
    const sel = window.getSelection();
    return sel && sel.rangeCount > 0 ? sel : null;
}

function getClosest(node, tags) {
    while (node && node !== document.body) {
        if (node.nodeType === Node.ELEMENT_NODE && tags.includes(node.tagName)) {
            return node;
        }
        node = node.parentNode;
    }
    return null;
}

function getCurrentNode() {
    const sel = getSelectionSafe();
    if (!sel) return null;

    let node = sel.anchorNode;
    if (!node) return null;

    if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentNode;
    }

    return node;
}

function getCurrentLink() {
    const node = getCurrentNode();
    if (!node) return null;
    return getClosest(node, ['A']);
}

function placeCaretInElement(el) {
    const range = document.createRange();
    const sel = window.getSelection();

    range.selectNodeContents(el);
    range.collapse(true);

    sel.removeAllRanges();
    sel.addRange(range);
}

// ===== Etat UI =====

function updateToolbarState() {
    const unlinkBtn = document.getElementById('unlinkBtn');
    if (unlinkBtn) {
        unlinkBtn.disabled = !getCurrentLink();
    }

    updateEditorEmptyState();
}

function updateEditorEmptyState() {
    const editor = document.getElementById('editor');
    if (!editor) return;

    const text = editor.textContent.replace(/\u00A0/g, ' ').trim();
    const hasImage = !!editor.querySelector('img');
    const hasListContent = !!editor.querySelector('li');
    const isEmpty = text === '' && !hasImage && !hasListContent;

    editor.classList.toggle('is-empty', isEmpty);
}

// ===== Commandes de formatage =====

function runCmd(command, value = null) {
    focusEditor();
    document.execCommand(command, false, value);
    updateToolbarState();
}

function applyBlockFormat() {
    const select = document.getElementById('blockFormat');
    const value = select.value;
    if (!value) return;

    runCmd('formatBlock', value);
    select.value = '';
}

function applyColor(command, value) {
    runCmd('styleWithCSS', true);
    runCmd(command, value);
}

function clearFormatting() {
    runCmd('removeFormat');
    removeCurrentLink();
    updateToolbarState();
}

// ===== Liens =====

function createLink() {
    const url = prompt('URL du lien :', 'https://');
    if (!url) return;

    runCmd('createLink', url);
    updateToolbarState();
}

function removeCurrentLink() {
    const link = getCurrentLink();
    if (!link) return;

    const parent = link.parentNode;
    if (!parent) return;

    while (link.firstChild) {
        parent.insertBefore(link.firstChild, link);
    }
    parent.removeChild(link);

    updateToolbarState();
}

// ===== Images =====

function insertImage() {
    const url = prompt('URL de l’image :', 'https://');
    if (!url) return;

    focusEditor();

    const img = document.createElement('img');
    img.setAttribute('src', url);
    img.setAttribute('alt', '');

    const sel = getSelectionSafe();
    if (sel) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(img);
        range.setStartAfter(img);
        range.setEndAfter(img);
        sel.removeAllRanges();
        sel.addRange(range);
    } else {
        document.getElementById('editor').appendChild(img);
    }

    updateToolbarState();
}

// ===== Listes imbriquées =====

function cleanupEmptyLists(root) {
    if (!root) return;

    let removed = true;
    while (removed) {
        removed = false;
        const lists = root.querySelectorAll('ol, ul');

        Array.from(lists).forEach(list => {
            if (!list.querySelector(':scope > li')) {
                list.remove();
                removed = true;
            }
        });
    }
}

function indentList() {
    focusEditor();

    const node = getCurrentNode();
    const li = getClosest(node, ['LI']);
    if (!li) return;

    const previousLi = li.previousElementSibling;
    if (!previousLi || previousLi.tagName !== 'LI') return;

    const parentList = li.parentElement;
    const listTag = parentList.tagName.toLowerCase();

    let nestedList = null;

    for (let i = previousLi.children.length - 1; i >= 0; i--) {
        const child = previousLi.children[i];
        if (child.tagName && child.tagName.toLowerCase() === listTag) {
            nestedList = child;
            break;
        }
    }

    if (!nestedList) {
        nestedList = document.createElement(listTag);
        previousLi.appendChild(nestedList);
    }

    nestedList.appendChild(li);
    placeCaretInElement(li);

    cleanupEmptyLists(document.getElementById('editor'));
    updateToolbarState();
}

function outdentList() {
    focusEditor();

    const node = getCurrentNode();
    const li = getClosest(node, ['LI']);
    if (!li) return;

    const parentList = li.parentElement;
    if (!parentList || !['OL', 'UL'].includes(parentList.tagName)) return;

    const parentLi = getClosest(parentList.parentNode, ['LI']);
    if (!parentLi) return;

    const grandList = parentLi.parentElement;
    if (!grandList || !['OL', 'UL'].includes(grandList.tagName)) return;

    if (parentLi.nextSibling) {
        grandList.insertBefore(li, parentLi.nextSibling);
    } else {
        grandList.appendChild(li);
    }

    if (!parentList.querySelector('li')) {
        parentList.remove();
    }

    placeCaretInElement(li);

    cleanupEmptyLists(document.getElementById('editor'));
    updateToolbarState();
}

// ===== Nettoyage HTML =====

function hasMeaningfulText(node) {
    return !!(
        node &&
        node.textContent &&
        node.textContent.replace(/\u00A0/g, ' ').trim() !== ''
    );
}

function extractSupportedStyle(node) {
    const style = node.getAttribute('style') || '';
    const styles = [];

    const colorMatch = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
    const bgMatch = style.match(/(?:^|;)\s*(?:background|background-color)\s*:\s*([^;]+)/i);
    const textDecoMatch = style.match(/(?:^|;)\s*text-decoration\s*:\s*([^;]+)/i);

    if (colorMatch) {
        styles.push('color: ' + colorMatch[1].trim());
    }
    if (bgMatch) {
        styles.push('background-color: ' + bgMatch[1].trim());
    }
    if (textDecoMatch && /underline/i.test(textDecoMatch[1])) {
        styles.push('text-decoration: underline');
    }

    return styles.join('; ');
}

function normalizeSemanticTag(node) {
    const tag = node.tagName ? node.tagName.toLowerCase() : '';

    if (tag === 'span') {
        const style = node.getAttribute('style') || '';

        if (/text-decoration\s*:\s*underline/i.test(style)) {
            const replacement = document.createElement('u');
            const cleanedStyle = style
                .replace(/(?:^|;)\s*text-decoration\s*:\s*underline\s*;?/ig, '')
                .replace(/^\s*;|;\s*$/g, '')
                .trim();

            if (cleanedStyle) {
                replacement.setAttribute('style', cleanedStyle);
            }

            while (node.firstChild) {
                replacement.appendChild(node.firstChild);
            }
            return replacement;
        }

        if (!style) {
            const fragment = document.createDocumentFragment();
            while (node.firstChild) {
                fragment.appendChild(node.firstChild);
            }
            return fragment;
        }
    }

    return node;
}

function cleanNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        return document.createTextNode(node.nodeValue);
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return document.createDocumentFragment();
    }

    const tag = node.tagName.toLowerCase();

    if (tag === 'br') {
        return document.createElement('br');
    }

    if (tag === 'img') {
        const src = node.getAttribute('src');
        if (!src) return document.createDocumentFragment();

        const img = document.createElement('img');
        img.setAttribute('src', src);
        img.setAttribute('alt', node.getAttribute('alt') || '');
        return img;
    }

    if (tag === 'a') {
        const a = document.createElement('a');
        const href = node.getAttribute('href');

        if (href) {
            a.setAttribute('href', href);
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
        }

        const style = extractSupportedStyle(node);
        if (style) {
            a.setAttribute('style', style);
        }

        Array.from(node.childNodes).forEach(child => {
            a.appendChild(cleanNode(child));
        });

        return normalizeSemanticTag(a);
    }

    if (['strong', 'b', 'em', 'i', 'u', 's', 'strike', 'span', 'font'].includes(tag)) {
        const allowed =
            tag === 'b' ? 'strong' :
                tag === 'i' ? 'em' :
                    tag === 'strike' ? 's' :
                        tag;

        const el = document.createElement(allowed);
        const style = extractSupportedStyle(node);

        if (style) {
            el.setAttribute('style', style);
        }

        Array.from(node.childNodes).forEach(child => {
            el.appendChild(cleanNode(child));
        });

        return normalizeSemanticTag(el);
    }

    if (['ul', 'ol'].includes(tag)) {
        const el = document.createElement(tag);

        Array.from(node.childNodes).forEach(child => {
            const cleaned = cleanNode(child);
            if (
                cleaned.nodeType === Node.ELEMENT_NODE &&
                cleaned.tagName &&
                cleaned.tagName.toLowerCase() === 'li'
            ) {
                el.appendChild(cleaned);
            }
        });

        return el;
    }

    if (tag === 'li') {
        const li = document.createElement('li');

        Array.from(node.childNodes).forEach(child => {
            li.appendChild(cleanNode(child));
        });

        return li;
    }

    if (['h1', 'h2', 'h3', 'blockquote'].includes(tag)) {
        const el = document.createElement(tag);
        const style = extractSupportedStyle(node);

        if (style) {
            el.setAttribute('style', style);
        }

        Array.from(node.childNodes).forEach(child => {
            el.appendChild(cleanNode(child));
        });

        return normalizeSemanticTag(el);
    }

    if (tag === 'div' || tag === 'p') {
        const frag = document.createDocumentFragment();

        Array.from(node.childNodes).forEach(child => {
            frag.appendChild(cleanNode(child));
        });

        if (hasMeaningfulText(node) || node.querySelector('img, a, strong, em, u, s')) {
            frag.appendChild(document.createElement('br'));
        }

        return frag;
    }

    const frag = document.createDocumentFragment();
    Array.from(node.childNodes).forEach(child => {
        frag.appendChild(cleanNode(child));
    });
    return frag;
}

function postCleanHtml(html) {
    html = html.replace(/(?:<br>\s*){3,}/g, '<br><br>');
    html = html.replace(/^(<br>\s*)+/, '');
    html = html.replace(/(<br>\s*)+$/, '');
    html = html.replace(/<li><br>/g, '<li>');
    html = html.replace(/<br><\/li>/g, '</li>');
    html = html.replace(/<ol><\/ol>/g, '');
    html = html.replace(/<ul><\/ul>/g, '');
    html = html.replace(/>\s+</g, '><');
    html = html.replace(/\s+(style="")/g, '');
    return html.trim();
}

// ===== Génération / copie =====

function generateHtml() {
    const editor = document.getElementById('editor');
    const container = document.createElement('div');

    Array.from(editor.childNodes).forEach(child => {
        container.appendChild(cleanNode(child));
    });

    const cleaned = postCleanHtml(container.innerHTML);
    document.getElementById('output').value = '[code]\n' + cleaned + '\n[/code]';

    updateToolbarState();
}

async function copyHtml() {
    const output = document.getElementById('output');

    if (!output.value.trim()) {
        generateHtml();
    }

    try {
        await navigator.clipboard.writeText(output.value);
        alert('HTML copié dans le presse-papiers.');
    } catch (e) {
        output.select();
        document.execCommand('copy');
        alert('HTML copié dans le presse-papiers.');
    }
}

function clearEditor() {
    const editor = document.getElementById('editor');
    editor.innerHTML = '';
    document.getElementById('output').value = '';
    focusEditor();
    updateToolbarState();
}

// ===== Initialisation =====

function bindEditorEvents() {
    const editor = document.getElementById('editor');

    document.addEventListener('selectionchange', updateToolbarState);
    editor.addEventListener('keyup', updateToolbarState);
    editor.addEventListener('mouseup', updateToolbarState);
    editor.addEventListener('click', updateToolbarState);
    editor.addEventListener('input', updateToolbarState);
    editor.addEventListener('focus', updateToolbarState);
    editor.addEventListener('blur', updateToolbarState);
}

function initEditor() {
    bindEditorEvents();
    updateToolbarState();
}

document.addEventListener('DOMContentLoaded', initEditor);