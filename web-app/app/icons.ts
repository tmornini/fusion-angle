import { SafeHtml } from './safe-html.ts';

// Icon pixel sizes, named by the same tier scale as the
// --text-* typography tokens
// (DESIGN-SYSTEM.md § Iconography). The
// IconFn size argument is typed to these eleven values, so
// off-vocabulary numeral fails the type-check at the call.
export const ICON_SIZE = {
    '2xs': 10,
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    '4xl': 32,
    '5xl': 40,
    '6xl': 48,
} as const;

export type IconSize =
    (typeof ICON_SIZE)[keyof typeof ICON_SIZE];

function icon(
    paths: string,
    size: IconSize,
    cssClass: string,
): SafeHtml {
    return new SafeHtml(
        '<svg xmlns="http://www.w3.org/2000/svg"'
        + ` width="${size}" height="${size}"`
        + ' viewBox="0 0 24 24" fill="none"'
        + ' stroke="currentColor" stroke-width="2"'
        + ' stroke-linecap="round"'
        + ' stroke-linejoin="round"'
        + ` class="${cssClass}" aria-hidden="true">`
        + paths + '</svg>',
    );
}

export function iconSparkles(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M9.937 15.5A2 2 0 0 0 8.5'
        + ' 14.063l-6.135-1.582a.5.5 0 0 1'
        + ' 0-.962L8.5 9.936A2 2 0 0 0 9.937'
        + ' 8.5l1.582-6.135a.5.5 0 0 1 .963'
        + ' 0L14.063 8.5A2 2 0 0 0 15.5'
        + ' 9.937l6.135 1.581a.5.5 0 0 1 0'
        + ' .964L15.5 14.063a2 2 0 0 0-1.437'
        + ' 1.437l-1.582 6.135a.5.5 0 0 1'
        + ' -.963 0z"/>'
        + '<path d="M20 3v4"/>'
        + '<path d="M22 5h-4"/>',
        size,
        cssClass,
    );
}

export function iconLogo(size: IconSize, cssClass: string) {
    const extra = cssClass === ''
        ? ''
        : ' ' + cssClass;
    return new SafeHtml(
        '<img src="../assets/mark.png"'
        + ` width="${size}" height="${size}"`
        + ` class="brand-mark${extra}"`
        + ' alt="" />',
    );
}

export function iconHome(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1'
        + ' 1 0 0 0-1 1v8"/>'
        + '<path d="M3 10a2 2 0 0 1 .709-1.528'
        + 'l7-5.999a2 2 0 0 1 2.582 0l7'
        + ' 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1'
        + '-2 2H5a2 2 0 0 1-2-2z"/>',
        size,
        cssClass,
    );
}

export function iconLightbulb(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M15 14c.2-1 .7-1.7 1.5-2.5'
        + ' 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6'
        + ' 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5'
        + ' 1.5 2.5"/>'
        + '<path d="M9 18h6"/>'
        + '<path d="M10 22h4"/>',
        size,
        cssClass,
    );
}

export function iconFolderKanban(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="M4 20h16a2 2 0 0 0 2-2V8a2'
        + ' 2 0 0 0-2-2h-7.93a2 2 0 0'
        + ' 1-1.66-.9l-.82-1.2A2 2 0 0 0'
        + ' 7.93 3H4a2 2 0 0 0-2 2v13c0'
        + ' 1.1.9 2 2 2Z"/>'
        + '<path d="M8 10v4"/>'
        + '<path d="M12 10v2"/>'
        + '<path d="M16 10v6"/>',
        size,
        cssClass,
    );
}

export function iconPeople(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4'
        + ' 4 0 0 0-4 4v2"/>'
        + '<circle cx="9" cy="7" r="4"/>'
        + '<path d="M22 21v-2a4 4 0 0 0-3'
        + '-3.87"/>'
        + '<path d="M16 3.13a4 4 0 0 1 0'
        + ' 7.75"/>',
        size,
        cssClass,
    );
}

export function iconPerson(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4'
        + ' 4 0 0 0-4 4v2"/>'
        + '<circle cx="12" cy="7" r="4"/>',
        size,
        cssClass,
    );
}

export function iconTarget(size: IconSize, cssClass: string) {
    return icon(
        '<circle cx="12" cy="12" r="10"/>'
        + '<circle cx="12" cy="12" r="6"/>'
        + '<circle cx="12" cy="12" r="2"/>',
        size,
        cssClass,
    );
}

export function iconDatabase(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<ellipse cx="12" cy="5" rx="9"'
        + ' ry="3"/>'
        + '<path d="M3 5V19A9 3 0 0 0 21'
        + ' 19V5"/>'
        + '<path d="M3 12A9 3 0 0 0 21 12"/>',
        size,
        cssClass,
    );
}

export function iconGitBranch(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<line x1="6" x2="6" y1="3" y2="15"/>'
        + '<circle cx="18" cy="6" r="3"/>'
        + '<circle cx="6" cy="18" r="3"/>'
        + '<path d="M18 9a9 9 0 0 1-9 9"/>',
        size,
        cssClass,
    );
}

export function iconBook(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M4 19.5v-15A2.5 2.5 0 0 1'
        + ' 6.5 2H20v20H6.5a2.5 2.5 0 0 1'
        + ' 0-5H20"/>',
        size,
        cssClass,
    );
}

export function iconPalette(size: IconSize, cssClass: string) {
    return icon(
        '<circle cx="13.5" cy="6.5" r=".5"'
        + ' fill="currentColor"/>'
        + '<circle cx="17.5" cy="10.5" r=".5"'
        + ' fill="currentColor"/>'
        + '<circle cx="8.5" cy="7.5" r=".5"'
        + ' fill="currentColor"/>'
        + '<circle cx="6.5" cy="12.5" r=".5"'
        + ' fill="currentColor"/>'
        + '<path d="M12 2C6.5 2 2 6.5 2 12s4.5'
        + ' 10 10 10c.926 0 1.648-.746'
        + ' 1.648-1.688 0-.437-.18-.835'
        + '-.437-1.125-.29-.289-.438-.652'
        + '-.438-1.125a1.64 1.64 0 0 1'
        + ' 1.668-1.668h1.996c3.051 0'
        + ' 5.555-2.503 5.555-5.554C21.965'
        + ' 6.012 17.461 2 12 2z"/>',
        size,
        cssClass,
    );
}

export function iconMenu(size: IconSize, cssClass: string) {
    return icon(
        '<line x1="4" x2="20" y1="12"'
        + ' y2="12"/>'
        + '<line x1="4" x2="20" y1="6"'
        + ' y2="6"/>'
        + '<line x1="4" x2="20" y1="18"'
        + ' y2="18"/>',
        size,
        cssClass,
    );
}

export function iconSearch(size: IconSize, cssClass: string) {
    return icon(
        '<circle cx="11" cy="11" r="8"/>'
        + '<path d="m21 21-4.3-4.3"/>',
        size,
        cssClass,
    );
}

export function iconSun(size: IconSize, cssClass: string) {
    return icon(
        '<circle cx="12" cy="12" r="4"/>'
        + '<path d="M12 2v2"/>'
        + '<path d="M12 20v2"/>'
        + '<path d="m4.93 4.93 1.41 1.41"/>'
        + '<path d="m17.66 17.66 1.41'
        + ' 1.41"/>'
        + '<path d="M2 12h2"/>'
        + '<path d="M20 12h2"/>'
        + '<path d="m6.34 17.66-1.41'
        + ' 1.41"/>'
        + '<path d="m19.07 4.93-1.41'
        + ' 1.41"/>',
        size,
        cssClass,
    );
}

export function iconMoon(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M12 3a6 6 0 0 0 9 9 9 9 0'
        + ' 1 1-9-9Z"/>',
        size,
        cssClass,
    );
}

export function iconMonitor(size: IconSize, cssClass: string) {
    return icon(
        '<rect width="20" height="14" x="2"'
        + ' y="3" rx="2"/>'
        + '<line x1="8" x2="16" y1="21"'
        + ' y2="21"/>'
        + '<line x1="12" x2="12" y1="17"'
        + ' y2="21"/>',
        size,
        cssClass,
    );
}

export function iconX(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M18 6 6 18"/>'
        + '<path d="m6 6 12 12"/>',
        size,
        cssClass,
    );
}

export function iconChevronRight(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="m9 18 6-6-6-6"/>',
        size,
        cssClass,
    );
}

export function iconPlus(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M5 12h14"/>'
        + '<path d="M12 5v14"/>',
        size,
        cssClass,
    );
}

export function iconArrowLeft(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="m12 19-7-7 7-7"/>'
        + '<path d="M19 12H5"/>',
        size,
        cssClass,
    );
}

export function iconArrowRight(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="M5 12h14"/>'
        + '<path d="m12 5 7 7-7 7"/>',
        size,
        cssClass,
    );
}

export function iconCheck(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M20 6 9 17l-5-5"/>',
        size,
        cssClass,
    );
}

export function iconLoader(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M12 2v4"/>'
        + '<path d="m16.2 7.8 2.9-2.9"/>'
        + '<path d="M18 12h4"/>'
        + '<path d="m16.2 16.2 2.9 2.9"/>'
        + '<path d="M12 18v4"/>'
        + '<path d="m4.9 19.1 2.9-2.9"/>'
        + '<path d="M2 12h4"/>'
        + '<path d="m4.9 4.9 2.9 2.9"/>',
        size,
        cssClass,
    );
}

export function iconExternalLink(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="M15 3h6v6"/>'
        + '<path d="M10 14 21 3"/>'
        + '<path d="M18 13v6a2 2 0 0 1-2'
        + ' 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1'
        + ' 2-2h6"/>',
        size,
        cssClass,
    );
}

export function iconStar(size: IconSize, cssClass: string) {
    return icon(
        '<polygon points="12 2 15.09 8.26 22'
        + ' 9.27 17 14.14 18.18 21.02 12'
        + ' 17.77 5.82 21.02 7 14.14 2 9.27'
        + ' 8.91 8.26 12 2"/>',
        size,
        cssClass,
    );
}

export function iconHeart(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M19 14c1.49-1.46 3-3.21'
        + ' 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76'
        + ' 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5'
        + '-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5'
        + ' 4.05 3 5.5l7 7Z"/>',
        size,
        cssClass,
    );
}

export function iconTrendingUp(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<polyline points="22 7 13.5 15.5'
        + ' 8.5 10.5 2 17"/>'
        + '<polyline points="16 7 22 7'
        + ' 22 13"/>',
        size,
        cssClass,
    );
}

export function iconAlertCircle(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<circle cx="12" cy="12" r="10"/>'
        + '<line x1="12" x2="12" y1="8"'
        + ' y2="12"/>'
        + '<line x1="12" x2="12.01" y1="16"'
        + ' y2="16"/>',
        size,
        cssClass,
    );
}

export function iconAlertTriangle(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="m21.73 18-8-14a2 2 0 0'
        + ' 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a'
        + '2 2 0 0 0 1.73-3Z"/>'
        + '<path d="M12 9v4"/>'
        + '<path d="M12 17h.01"/>',
        size,
        cssClass,
    );
}

export function iconNoEntry(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<circle cx="12" cy="12" r="10"/>'
        + '<line x1="5" x2="19" y1="12"'
        + ' y2="12"/>',
        size,
        cssClass,
    );
}

export function iconCheckCircle(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="M22 11.08V12a10 10 0 1'
        + ' 1-5.93-9.14"/>'
        + '<path d="m9 11 3 3L22 4"/>',
        size,
        cssClass,
    );
}

export function iconInfo(size: IconSize, cssClass: string) {
    return icon(
        '<circle cx="12" cy="12" r="10"/>'
        + '<path d="M12 16v-4"/>'
        + '<path d="M12 8h.01"/>',
        size,
        cssClass,
    );
}

export function iconMail(size: IconSize, cssClass: string) {
    return icon(
        '<rect width="20" height="16" x="2"'
        + ' y="4" rx="2"/>'
        + '<path d="m22 7-8.97 5.7a1.94 1.94'
        + ' 0 0 1-2.06 0L2 7"/>',
        size,
        cssClass,
    );
}

export function iconArchive(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<rect width="20" height="5" x="2"'
        + ' y="3" rx="1"/>'
        + '<path d="M4 8v11a2 2 0 0 0 2 2h12'
        + 'a2 2 0 0 0 2-2V8"/>'
        + '<path d="M10 12h4"/>',
        size,
        cssClass,
    );
}

export function iconPhone(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M22 16.92v3a2 2 0 0'
        + ' 1-2.18 2 19.79 19.79 0 0'
        + ' 1-8.63-3.07 19.5 19.5 0 0 1-6-6'
        + ' 19.79 19.79 0 0 1-3.07-8.67A2 2'
        + ' 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72'
        + ' 12.84 12.84 0 0 0 .7 2.81 2 2 0'
        + ' 0 1-.45 2.11L8.09 9.91a16 16 0 0'
        + ' 0 6 6l1.27-1.27a2 2 0 0 1'
        + ' 2.11-.45 12.84 12.84 0 0 0 2.81'
        + ' .7A2 2 0 0 1 22 16.92z"/>',
        size,
        cssClass,
    );
}

export function iconCalendar(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="M8 2v4"/>'
        + '<path d="M16 2v4"/>'
        + '<rect width="18" height="18" x="3"'
        + ' y="4" rx="2"/>'
        + '<path d="M3 10h18"/>',
        size,
        cssClass,
    );
}

export function iconClock(size: IconSize, cssClass: string) {
    return icon(
        '<circle cx="12" cy="12" r="10"/>'
        + '<polyline points="12 6 12 12'
        + ' 16 14"/>',
        size,
        cssClass,
    );
}

export function iconUpload(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2'
        + ' 2 0 0 1-2-2v-4"/>'
        + '<polyline points="17 8 12 3 7 8"/>'
        + '<line x1="12" x2="12" y1="3"'
        + ' y2="15"/>',
        size,
        cssClass,
    );
}

export function iconDownload(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="M21 15v4a2 2 0 0 1-2 2H5a2'
        + ' 2 0 0 1-2-2v-4"/>'
        + '<polyline points="7 10 12 15'
        + ' 17 10"/>'
        + '<line x1="12" x2="12" y1="15"'
        + ' y2="3"/>',
        size,
        cssClass,
    );
}

export function iconTrash(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M3 6h18"/>'
        + '<path d="M19 6v14c0 1-1 2-2'
        + ' 2H7c-1 0-2-1-2-2V6"/>'
        + '<path d="M8 6V4c0-1 1-2 2-2h4c1'
        + ' 0 2 1 2 2v2"/>'
        + '<line x1="10" x2="10" y1="11"'
        + ' y2="17"/>'
        + '<line x1="14" x2="14" y1="11"'
        + ' y2="17"/>',
        size,
        cssClass,
    );
}

export function iconEdit(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M17 3a2.85 2.83 0 1 1 4'
        + ' 4L7.5 20.5 2 22l1.5-5.5Z"/>'
        + '<path d="m15 5 4 4"/>',
        size,
        cssClass,
    );
}

export function iconCopy(size: IconSize, cssClass: string) {
    return icon(
        '<rect width="14" height="14" x="8"'
        + ' y="8" rx="2" ry="2"/>'
        + '<path d="M4 16c-1.1 0-2-.9-2-2V4c0'
        + '-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
        size,
        cssClass,
    );
}

export function iconSave(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8'
        + ' 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0'
        + ' 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0'
        + ' 1 2-2z"/>'
        + '<path d="M17 21v-7a1 1 0 0 0-1-1H8'
        + 'a1 1 0 0 0-1 1v7"/>'
        + '<path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
        size,
        cssClass,
    );
}

export function iconSend(size: IconSize, cssClass: string) {
    return icon(
        '<path d="m22 2-7 20-4-9-9-4Z"/>'
        + '<path d="M22 2 11 13"/>',
        size,
        cssClass,
    );
}

export function iconShare(size: IconSize, cssClass: string) {
    return icon(
        '<circle cx="18" cy="5" r="3"/>'
        + '<circle cx="6" cy="12" r="3"/>'
        + '<circle cx="18" cy="19" r="3"/>'
        + '<line x1="8.59" x2="15.42"'
        + ' y1="13.51" y2="17.49"/>'
        + '<line x1="15.41" x2="8.59"'
        + ' y1="6.51" y2="10.49"/>',
        size,
        cssClass,
    );
}

export function iconRocket(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M4.5 16.5c-1.5 1.26-2 5-2'
        + ' 5s3.74-.5 5-2c.71-.84.7-2.13'
        + '-.09-2.91a2.18 2.18 0 0'
        + ' 0-2.91-.09z"/>'
        + '<path d="m12 15-3-3a22 22 0 0 1'
        + ' 2-3.95A12.88 12.88 0 0 1 22'
        + ' 2c0 2.72-.78 7.5-6 11a22.35'
        + ' 22.35 0 0 1-4 2z"/>'
        + '<path d="M9 12H4s.55-3.03 2-4c1.62'
        + '-1.08 5 0 5 0"/>'
        + '<path d="M12 15v5s3.03-.55 4-2c1.08'
        + '-1.62 0-5 0-5"/>',
        size,
        cssClass,
    );
}

export function iconZap(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9'
        + '-10.2a.5.5 0 0 1 .86.46l-1.92'
        + ' 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1'
        + ' .78 1.63l-9.9 10.2a.5.5 0 0'
        + ' 1-.86-.46l1.92-6.02A1 1 0 0 0 11'
        + ' 14z"/>',
        size,
        cssClass,
    );
}

export function iconBrain(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M12 5a3 3 0 1 0-5.997.125'
        + ' 4 4 0 0 0-2.526 5.77 4 4 0 0 0'
        + ' .556 6.588A4 4 0 1 0 12 18Z"/>'
        + '<path d="M12 5a3 3 0 1 1 5.997.125'
        + ' 4 4 0 0 1 2.526 5.77 4 4 0 0'
        + ' 1-.556 6.588A4 4 0 1 1 12 18Z"/>'
        + '<path d="M15 13a4.5 4.5 0 0 1-3-4'
        + ' 4.5 4.5 0 0 1-3 4"/>'
        + '<path d="M17.599 6.5a3 3 0 0 0'
        + ' .399-1.375"/>'
        + '<path d="M6.003 5.125A3 3 0 0 0'
        + ' 6.401 6.5"/>'
        + '<path d="M3.477 10.896a4 4 0 0 1'
        + ' .585-.396"/>'
        + '<path d="M19.938 10.5a4 4 0 0 1'
        + ' .585.396"/>'
        + '<path d="M6 18a4 4 0 0'
        + ' 1-1.967-.516"/>'
        + '<path d="M19.967 17.484A4 4 0 0 1'
        + ' 18 18"/>',
        size,
        cssClass,
    );
}

export function iconBarChart(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="M3 3v18h18"/>'
        + '<path d="M18 17V9"/>'
        + '<path d="M13 17V5"/>'
        + '<path d="M8 17v-3"/>',
        size,
        cssClass,
    );
}

export function iconShield(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M20 13c0 5-3.5 7.5-7.66'
        + ' 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4'
        + ' 18 4 13V6a1 1 0 0 1 1-1c2 0'
        + ' 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1'
        + ' 1.52 0C14.51 3.81 17 5 19 5a1 1 0'
        + ' 0 1 1 1z"/>',
        size,
        cssClass,
    );
}

export function iconBuilding(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="M6 22V4a2 2 0 0 1 2-2h8a2'
        + ' 2 0 0 1 2 2v18Z"/>'
        + '<path d="M6 12H4a2 2 0 0 0-2 2v6a'
        + '2 2 0 0 0 2 2h2"/>'
        + '<path d="M18 9h2a2 2 0 0 1 2 2v9a'
        + '2 2 0 0 1-2 2h-2"/>'
        + '<path d="M10 6h4"/>'
        + '<path d="M10 10h4"/>'
        + '<path d="M10 14h4"/>'
        + '<path d="M10 18h4"/>',
        size,
        cssClass,
    );
}

export function iconBriefcase(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="M16 20V4a2 2 0 0 0-2-2h-4a'
        + '2 2 0 0 0-2 2v16"/>'
        + '<rect width="20" height="14" x="2"'
        + ' y="6" rx="2"/>',
        size,
        cssClass,
    );
}

export function iconClipboardCheck(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<rect width="8" height="4" x="8"'
        + ' y="2" rx="1" ry="1"/>'
        + '<path d="M16 4h2a2 2 0 0 1 2 2v14a'
        + '2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2'
        + ' 2 0 0 1 2-2h2"/>'
        + '<path d="m9 14 2 2 4-4"/>',
        size,
        cssClass,
    );
}

export function iconDollarSign(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<line x1="12" x2="12" y1="2"'
        + ' y2="22"/>'
        + '<path d="M17 5H9.5a3.5 3.5 0 0 0 0'
        + ' 7h5a3.5 3.5 0 0 1 0 7H6"/>',
        size,
        cssClass,
    );
}

export function iconGripVertical(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<circle cx="9" cy="12" r="1"/>'
        + '<circle cx="9" cy="5" r="1"/>'
        + '<circle cx="9" cy="19" r="1"/>'
        + '<circle cx="15" cy="12" r="1"/>'
        + '<circle cx="15" cy="5" r="1"/>'
        + '<circle cx="15" cy="19" r="1"/>',
        size,
        cssClass,
    );
}

export function iconLineChart(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="M3 3v18h18"/>'
        + '<path d="m19 9-5 5-4-4-3 3"/>',
        size,
        cssClass,
    );
}

export function iconArrowUpRight(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="M7 7h10v10"/>'
        + '<path d="M7 17 17 7"/>',
        size,
        cssClass,
    );
}

export function iconArrowDownRight(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="m7 7 10 10"/>'
        + '<path d="M17 7v10H7"/>',
        size,
        cssClass,
    );
}

export function iconCreditCard(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<rect width="20" height="14" x="2"'
        + ' y="5" rx="2"/>'
        + '<line x1="2" x2="22" y1="10"'
        + ' y2="10"/>',
        size,
        cssClass,
    );
}

export function iconCircle(size: IconSize, cssClass: string) {
    return icon(
        '<circle cx="12" cy="12" r="10"/>',
        size,
        cssClass,
    );
}

export function iconMessageSquare(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="M21 15a2 2 0 0 1-2 2H7l-4'
        + ' 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1'
        + ' 2 2z"/>',
        size,
        cssClass,
    );
}

export function iconPersonPlus(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="M16 21v-2a4 4 0 0 0-4-4H6a'
        + '4 4 0 0 0-4 4v2"/>'
        + '<circle cx="9" cy="7" r="4"/>'
        + '<line x1="19" x2="19" y1="8"'
        + ' y2="14"/>'
        + '<line x1="22" x2="16" y1="11"'
        + ' y2="11"/>',
        size,
        cssClass,
    );
}

export function iconPersonX(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M16 21v-2a4 4 0 0 0-4-4H6a'
        + '4 4 0 0 0-4 4v2"/>'
        + '<circle cx="9" cy="7" r="4"/>'
        + '<line x1="17" x2="22" y1="8"'
        + ' y2="13"/>'
        + '<line x1="22" x2="17" y1="8"'
        + ' y2="13"/>',
        size,
        cssClass,
    );
}

export function iconXCircle(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<circle cx="12" cy="12" r="10"/>'
        + '<path d="m15 9-6 6"/>'
        + '<path d="m9 9 6 6"/>',
        size,
        cssClass,
    );
}

export function iconCheckCircle2(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<circle cx="12" cy="12" r="10"/>'
        + '<path d="m9 12 2 2 4-4"/>',
        size,
        cssClass,
    );
}

export function iconMinus(size: IconSize, cssClass: string) {
    return icon(
        '<path d="M5 12h14"/>',
        size,
        cssClass,
    );
}

export function iconUndo(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="M9 14 4 9l5-5"/>'
        + '<path d="M4 9h10.5a5.5 5.5'
        + ' 0 0 1 5.5 5.5 5.5 5.5'
        + ' 0 0 1-5.5 5.5H11"/>',
        size,
        cssClass,
    );
}

export function iconRedo(
    size: IconSize,
    cssClass: string,
) {
    return icon(
        '<path d="m15 14 5-5-5-5"/>'
        + '<path d="M20 9H9.5A5.5 5.5'
        + ' 0 0 0 4 14.5 5.5 5.5'
        + ' 0 0 0 9.5 20H13"/>',
        size,
        cssClass,
    );
}

export type IconFn =
    (size: IconSize, cssClass: string) => SafeHtml;

export { icon };
