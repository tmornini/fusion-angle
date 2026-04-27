export function subscribeResize(
    target: Element,
    onResize: () => void,
): () => void {
    const ro = new ResizeObserver(onResize);
    ro.observe(target);
    return () => ro.disconnect();
}
