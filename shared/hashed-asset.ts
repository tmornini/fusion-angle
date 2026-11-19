// name.hash.ext — eight or more hex digits. Fixed names
// such as app.js must not match.
const HASHED_ASSET_NAME =
    /\.[0-9a-f]{8,}\.[a-z0-9]+$/i;

export function isHashedAssetName(name: string): boolean {
    return HASHED_ASSET_NAME.test(name);
}
