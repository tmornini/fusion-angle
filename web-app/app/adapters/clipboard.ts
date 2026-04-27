export async function postClipboardCopy(
    text: string,
): Promise<void> {
    await navigator.clipboard.writeText(text);
}
