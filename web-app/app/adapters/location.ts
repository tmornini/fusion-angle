export function getQueryString(): string {
    return window.location.search;
}

export function setLocation(url: string): void {
    window.location.href = url;
}
