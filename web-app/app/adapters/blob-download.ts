import { createElement } from '../dom.ts';

export function downloadBlob(
    blob: Blob,
    filename: string,
): void {
    const url = URL.createObjectURL(blob);
    const link = createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
