export function getQueryString(): string {
    return window.location.search;
}

export function putLocation(url: string): void {
    window.location.href = url;
}
